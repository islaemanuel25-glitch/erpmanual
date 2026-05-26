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

      // Calcular ambos precios
      let precioVentaBulto = precioDB;
      let precioVentaUnitario = precioDB;

      if (fiambreFijo) {
        // Fiambre fijo en depósito: precio por pieza = precioPerKg × pesoReferencia
        const precioPorPieza = Number((precioDB * pesoReferenciaKg).toFixed(2));
        precioVentaUnitario = precioPorPieza;
        precioVentaBulto = precioPorPieza;
        // Cambiar unidadMedida para que el frontend no abra modal kg
        unidadMedida = "unidad";
      } else if (factorPack > 1 && unidadMedida !== "unidad" && precioDB > 0) {
        // DB guarda precio del bulto → derivar unitario
        precioVentaUnitario = Number((precioDB / factorPack).toFixed(2));
        precioVentaBulto = Number(precioDB.toFixed(2));
      }

      // Misma regla que stock_locales/listar: redondeo a 100 hacia arriba (helper compartido)
      if (pl.base?.redondeo_100 === true && !fiambreFijo) {
        precioVentaUnitario = redondear100(precioVentaUnitario);
      }

      const modoSalidaDefault = fiambreFijo
        ? "UNIDAD"
        : calcularModoSalida(esDeposito, modoEnvio, unidadMedida);

      // precioVenta = el precio que corresponde según el modo de salida default
      let precioVenta = modoSalidaDefault === "BULTO"
        ? precioVentaBulto
        : precioVentaUnitario;

      // Costo escalado a la MISMA unidad que precioVenta (unitario/bulto/pieza).
      // El precio_costo en DB está en la misma escala que precio_venta (bulto si
      // factor_pack>1, por kg si fiambre fijo). Lo escalamos una sola vez para que:
      //   - calcularPrecioConLista reciba un costo consistente con precioVenta.
      //   - el POS lo mande al crear la venta y la ganancia se calcule en escala.
      let precioCostoEnEscala = precioCosto;
      if (fiambreFijo) {
        precioCostoEnEscala = Number((precioCosto * pesoReferenciaKg).toFixed(2));
      } else if (
        factorPack > 1 &&
        unidadMedida !== "unidad" &&
        modoSalidaDefault === "UNIDAD"
      ) {
        precioCostoEnEscala = Number((precioCosto / factorPack).toFixed(2));
      }

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
