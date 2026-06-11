import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { defaultModoEnvio, esFiambreFijo as checkFiambreFijo } from "@/lib/conversiones/stock";
import { redondear100 } from "@/lib/precios/redondeo";
import { resolverListaCliente } from "@/lib/precios/resolverListaCliente";
import { calcularPrecioConLista } from "@/lib/precios/calcularPrecioConLista";
import {
  rankearLiteral,
  resolverContraCatalogo,
} from "@/lib/productos/busquedaFuzzyProducto";

const FUZZY_CANDIDATE_LIMIT = 10000;
const FUZZY_TOP_RESULTS = 10;

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos.usar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    let localId = Number(searchParams.get("localId") || 0);
    const clienteIdRaw = Number(searchParams.get("clienteId") || 0);
    const clienteId = Number.isFinite(clienteIdRaw) && clienteIdRaw > 0 ? clienteIdRaw : null;
    const fromVoice = searchParams.get("fromVoice") === "true";

    if (!localId) localId = Number(session.localId || 0);

    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    if (!session.esAdmin && localId !== Number(session.localId)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para este local" },
        { status: 403 }
      );
    }

    if (!q) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Obtener si el local es depósito (una sola query, cacheable)
    const local = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });
    const esDeposito = local?.es_deposito === true;

    // Leer config de stock negativo desde DB
    const grupoId = await getGrupoIdDeLocal(localId);
    let allowNegativeStock = false;
    if (grupoId) {
      const configGrupo = await prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { allowNegativeStock: true },
      });
      allowNegativeStock = configGrupo?.allowNegativeStock === true;
    }

    // Resolver lista de precios aplicable (una sola vez por request)
    // Fallback silencioso: si no se puede resolver, cae al precioVenta clásico del producto.
    let listaAplicable = null;
    if (grupoId) {
      try {
        listaAplicable = await resolverListaCliente({ clienteId, grupoId, prisma });
      } catch (e) {
        console.warn(
          `[pos-ventas/buscar-producto] No se pudo resolver lista (grupoId=${grupoId}, clienteId=${clienteId}):`,
          e.message
        );
        listaAplicable = null;
      }
    }

    // Prioridad: match exacto por codigo_barra (retorno inmediato)
    // — scanner sigue funcionando aunque venga marcado fromVoice (no debería, pero
    //   por seguridad lo dejamos antes del flujo voz).
    const exacto = await prisma.productoLocal.findMany({
      where: {
        localId,
        activo: true,
        base: {
          activo: true,
          OR: [
            { codigo_barra: q },
            { codigo_barra_secundario: q },
          ],
        },
      },
      include: {
        base: true,
        stock: { where: { localId }, select: { cantidad: true } },
      },
      take: 1,
    });

    if (exacto.length > 0) {
      const items = mapProductos(exacto, esDeposito, allowNegativeStock, listaAplicable);
      return NextResponse.json({ ok: true, items });
    }

    // Manual y voz comparten universo: el catálogo real del local. Antes el
    // LIKE clásico hacía take:30 sin orderBy y dejaba afuera productos válidos
    // (ej. "leche" no encontraba "Leche Cotar" porque caía después del 30).
    // Ahora cargamos todo el catálogo activo del local y rankeamos en memoria.
    const candidatos = await prisma.productoLocal.findMany({
      where: {
        localId,
        activo: true,
        base: { activo: true },
      },
      select: {
        id: true,
        nombre: true,
        base: { select: { nombre: true, codigo_barra: true, codigo_barra_secundario: true } },
      },
      take: FUZZY_CANDIDATE_LIMIT,
    });

    const getNombre = (p) => p.nombre || p.base?.nombre || "";
    const getCodigo = (p) => [p.base?.codigo_barra, p.base?.codigo_barra_secundario].filter(Boolean);

    let rankings;
    let queryInterpretada = null;
    if (fromVoice) {
      // Voz: variantes ("acotar" → "cotar") + Levenshtein contra catálogo real.
      const resuelto = resolverContraCatalogo(candidatos, q, {
        getNombre,
        getCodigo,
        maxDistance: 3,
      });
      rankings = resuelto.rankings;
      queryInterpretada = resuelto.queryInterpretada;
    } else {
      // Manual: solo substring / inicio de palabra. Sin variantes ni Levenshtein.
      rankings = rankearLiteral(candidatos, q, { getNombre, getCodigo });
    }

    const topIds = rankings.slice(0, FUZZY_TOP_RESULTS).map((r) => r.item.id);
    if (topIds.length === 0) {
      return NextResponse.json({
        ok: true,
        items: [],
        ...(fromVoice ? { queryInterpretada: null } : {}),
      });
    }

    const productosFull = await prisma.productoLocal.findMany({
      where: { id: { in: topIds } },
      include: {
        base: true,
        stock: { where: { localId }, select: { cantidad: true } },
      },
    });
    const orderMap = new Map(topIds.map((id, idx) => [id, idx]));
    productosFull.sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));

    const items = mapProductos(
      productosFull,
      esDeposito,
      allowNegativeStock,
      listaAplicable
    );
    return NextResponse.json({
      ok: true,
      items,
      ...(fromVoice ? { queryInterpretada } : {}),
    });
  } catch (err) {
    console.error("Error buscar-producto POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al buscar productos" },
      { status: 500 }
    );
  }
}

/**
 * Calcula modoSalidaDefault para un producto dado el contexto.
 *
 * - Local normal → siempre UNIDAD (vende unitario al público)
 * - Depósito → según modo_envio configurado del producto:
 *     SOLO_BULTO  → BULTO
 *     MIXTO       → BULTO  (default conservador para depósito)
 *     SOLO_UNIDAD → UNIDAD
 *     null        → usa defaultModoEnvio(unidadMedida) y aplica la misma lógica
 */
function calcularModoSalida(esDeposito, modoEnvio, unidadMedida) {
  if (!esDeposito) return "UNIDAD";

  const efectivo = modoEnvio || defaultModoEnvio(unidadMedida);
  if (efectivo === "SOLO_UNIDAD") return "UNIDAD";
  // SOLO_BULTO y MIXTO → default BULTO en depósito
  return "BULTO";
}

function mapProductos(lista, esDeposito, allowNegativeStock = false, listaAplicable = null) {
  return lista
    .map((pl) => {
      const stock = Number(pl.stock?.[0]?.cantidad || 0);
      const sinStock = stock <= 0;
      const disponibleParaVenta = !sinStock || allowNegativeStock;
      let unidadMedida = pl.base?.unidad_medida || "unidad";
      const factorPack = Number(pl.base?.factor_pack || 1);
      const modoEnvio = pl.base?.modo_envio || null;

      // Detectar fiambre fijo en depósito → vende por pieza
      const fiambreFijo = esDeposito && checkFiambreFijo(pl.base);
      const pesoReferenciaKg = fiambreFijo ? Number(pl.base.pesoReferenciaKg) : 0;

      // precio_venta en DB: precio tal como está cargado (puede ser bulto o unitario según el producto)
      const precioDB = Number(pl.precio_venta || pl.base?.precio_venta || 0);
      const precioCosto = Number(pl.precio_costo || pl.base?.precio_costo || 0);

      // ¿precio_venta/precio_costo están guardados en escala de BULTO (hay que
      // derivar el unitario ÷ factor_pack)? Eso depende SOLO de unidad_medida
      // (FormProducto guarda "Venta (por bulto)" para pack/cajón), NO de modo_envio.
      // modo_envio decide el MODO DE SALIDA (modoSalidaDefault), no la escala del
      // precio: un pack + SOLO_UNIDAD igual tiene el precio guardado en bulto y debe
      // dividirse para mostrar el unitario. Mezclar ambos (esBultoMode) hacía que
      // pack+SOLO_UNIDAD cobrara el precio de bulto.
      const esBultoConPack =
        !fiambreFijo &&
        factorPack > 1 &&
        precioDB > 0 &&
        ["pack", "cajon", "caja", "carton"].includes(unidadMedida);

      // Cuatro escalas explícitas: la API es la fuente autoritativa del precio/costo
      // unitario real y del de bulto. El frontend NO debe re-derivar dividiendo.
      let precioVentaBulto = precioDB;
      let precioVentaUnitario = precioDB;
      let precioCostoBulto = precioCosto;
      let precioCostoUnitario = precioCosto;

      if (fiambreFijo) {
        // Fiambre fijo en depósito: precio/costo por pieza = valor por kg × pesoRef.
        const precioPorPieza = Number((precioDB * pesoReferenciaKg).toFixed(2));
        const costoPorPieza = Number((precioCosto * pesoReferenciaKg).toFixed(2));
        precioVentaUnitario = precioPorPieza;
        precioVentaBulto = precioPorPieza;
        precioCostoUnitario = costoPorPieza;
        precioCostoBulto = costoPorPieza;
        // Cambiar unidadMedida para que el frontend no abra modal kg
        unidadMedida = "unidad";
      } else if (esBultoConPack) {
        // DB guarda precio/costo del bulto → derivar unitario real (÷ factorPack).
        precioVentaBulto = Number(precioDB.toFixed(2));
        precioVentaUnitario = Number((precioDB / factorPack).toFixed(2));
        precioCostoBulto = Number(precioCosto.toFixed(2));
        precioCostoUnitario = Number((precioCosto / factorPack).toFixed(2));
      }

      // Misma regla que stock_locales/listar: redondeo a 100 hacia arriba (helper compartido)
      if (pl.base?.redondeo_100 === true && !fiambreFijo) {
        precioVentaUnitario = redondear100(precioVentaUnitario);
      }

      const modoSalidaDefault = fiambreFijo
        ? "UNIDAD"
        : calcularModoSalida(esDeposito, modoEnvio, unidadMedida);

      // precioVenta / precioCostoEnEscala = los que corresponden al modo de salida
      // default (lo que se muestra/cobra si no se togglea la línea).
      let precioVenta = modoSalidaDefault === "BULTO"
        ? precioVentaBulto
        : precioVentaUnitario;
      let precioCostoEnEscala = modoSalidaDefault === "BULTO"
        ? precioCostoBulto
        : precioCostoUnitario;

      // Aplicar lista de precios (si hay una resuelta)
      let aplicacionLista = null;
      if (listaAplicable) {
        const precioOriginal = Number(precioVenta.toFixed(2));
        try {
          const calc = calcularPrecioConLista({
            precioVenta,
            costo: precioCostoEnEscala,
            lista: listaAplicable,
          });
          const precioFinalNum = Number(calc.precioFinal);

          // Mantener proporción unitario/bulto cuando hay factor_pack > 1
          if (factorPack > 1 && precioVenta > 0) {
            const ratio = precioFinalNum / precioVenta;
            precioVentaUnitario = Number((precioVentaUnitario * ratio).toFixed(2));
            precioVentaBulto = Number((precioVentaBulto * ratio).toFixed(2));
          } else {
            // Sin factor pack: precioUnitario == precioBulto == precioFinal
            precioVentaUnitario = precioFinalNum;
            precioVentaBulto = precioFinalNum;
          }
          precioVenta = precioFinalNum;

          aplicacionLista = {
            listaPrecioId: listaAplicable.id,
            listaPrecioNombre: listaAplicable.nombre,
            tipoBase: listaAplicable.tipoBase,
            tipoPrecioAplicado: calc.tipoPrecioAplicado,
            margenAplicado: calc.margenAplicado,
            precioOriginal,
            precioFinal: precioFinalNum,
            esDefault: !!listaAplicable.esDefault,
          };
        } catch (e) {
          console.warn(
            "[pos-ventas/buscar-producto] calcularPrecioConLista lanzó (probable MANUAL_AUTORIZADO):",
            e.message
          );
          // Mantener precioVenta clásico, aplicacionLista = null
          aplicacionLista = null;
        }
      }

      // ── Precios/costos REALES para POS Depósito (NORMAL vs UNIDAD_REMANENTE) ──
      // El modelo guarda UN solo precio_venta y UN solo precio_costo (escala de
      // bulto para productos pack). NO existe columna separada de precio unitario:
      // el "precio unidad" del producto ES precio_venta / factor_pack — EXACTAMENTE
      // lo que muestra el módulo Productos como "Venta unitario ref."
      // (FormProducto.jsx → toPrecioUnitarioRef, sin redondeo propio).
      //
      // La lista de precios del cliente SE RESPETA en ambos modos, igual que la
      // venta normal, pero aplicada en LA ESCALA QUE CORRESPONDE:
      //   NORMAL (formato depósito): bulto con lista = el MISMO valor que cobra hoy
      //     la venta normal (precioVentaBulto, ya calculado con la lista arriba).
      //   UNIDAD_REMANENTE: se aplica la MISMA lista sobre la base unitaria real
      //     (precio_venta/factor), NO dividiendo el pack ya alterado/redondeado por
      //     la lista (eso distorsiona: daba 1010 cuando la unidad correcta es 1000).
      //     Sin lista → 1000. Con lista PRECIO_VENTA → 1000. Con lista COSTO+margen →
      //     el unitario que define esa lista. Sin redondeo extra de producto.
      const baseUnitariaVenta = esBultoConPack ? precioDB / factorPack : precioDB;
      const baseUnitariaCosto = esBultoConPack ? precioCosto / factorPack : precioCosto;

      let precioVentaUnitarioReal;
      if (fiambreFijo) {
        // Fiambre fijo: el "unitario" es la pieza, ya calculada con lista arriba.
        precioVentaUnitarioReal = Number(precioVentaUnitario.toFixed(2));
      } else if (listaAplicable) {
        try {
          const calcUnit = calcularPrecioConLista({
            precioVenta: baseUnitariaVenta,
            costo: baseUnitariaCosto,
            lista: listaAplicable,
          });
          precioVentaUnitarioReal = Number(Number(calcUnit.precioFinal).toFixed(2));
        } catch {
          // MANUAL_AUTORIZADO u otro caso → unitario clásico sin lista (igual que NORMAL)
          precioVentaUnitarioReal = Number(baseUnitariaVenta.toFixed(2));
        }
      } else {
        precioVentaUnitarioReal = Number(baseUnitariaVenta.toFixed(2));
      }

      // NORMAL: el MISMO valor que cobra hoy la venta normal (bulto con lista).
      const precioVentaFormatoDepositoReal = Number(precioVentaBulto.toFixed(2));
      // Costo: no lleva lista (es costo), escala real cruda en cada modo.
      const precioCostoFormatoDepositoReal = Number(precioCostoBulto.toFixed(2));
      const precioCostoUnitarioReal = fiambreFijo
        ? Number(precioCostoUnitario.toFixed(2))
        : Number(baseUnitariaCosto.toFixed(2));

      return {
        productoBaseId: pl.baseId,
        productoLocalId: pl.id,
        nombre: pl.nombre || pl.base?.nombre || "",
        codigoBarra: pl.base?.codigo_barra || "",
        codigoBarraSecundario: pl.base?.codigo_barra_secundario || "",
        precioVenta: Number(precioVenta.toFixed(2)),
        precioVentaUnitario,
        precioVentaBulto,
        precioCosto: precioCostoEnEscala,
        precioCostoUnitario,
        precioCostoBulto,
        // Escalas REALES (sin lista/redondeo en el unitario) para el toggle de depósito
        precioVentaFormatoDepositoReal,
        precioVentaUnitarioReal,
        precioCostoFormatoDepositoReal,
        precioCostoUnitarioReal,
        // Fiambre fijo: el stock operativo del depósito ya está en PIEZAS.
        // Se devuelve tal cual → stockMax del carrito (escala de piezas) es correcto.
        stock,
        sinStock,
        allowNegativeStock,
        disponibleParaVenta,
        unidadMedida,
        factorPack,
        modoEnvio,
        modoSalidaDefault,
        // Fiambre fijo: frontend puede mostrar "pieza" como label
        esFiambreFijo: fiambreFijo || false,
        pesoReferenciaKg: fiambreFijo ? pesoReferenciaKg : undefined,
        // Trazabilidad de lista de precios aplicada (null si no aplica)
        aplicacionLista,
      };
    });
}
