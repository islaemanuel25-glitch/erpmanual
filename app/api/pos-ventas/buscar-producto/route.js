import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { defaultModoEnvio, esFiambreFijo as checkFiambreFijo } from "@/lib/conversiones/stock";
import { redondear100 } from "@/lib/precios/redondeo";
import { resolverListaCliente } from "@/lib/precios/resolverListaCliente";
import { calcularPrecioConLista } from "@/lib/precios/calcularPrecioConLista";
import { rankearFuzzy } from "@/lib/productos/busquedaFuzzyProducto";

const FUZZY_CANDIDATE_LIMIT = 10000;
const FUZZY_MIN_LIKE_RESULTS = 3;
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
    const exacto = await prisma.productoLocal.findMany({
      where: {
        localId,
        activo: true,
        base: { codigo_barra: q, activo: true },
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

    // Busqueda amplia (traer más para rankear correctamente)
    const productos = await prisma.productoLocal.findMany({
      where: {
        localId,
        activo: true,
        base: { activo: true },
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { base: { nombre: { contains: q, mode: "insensitive" } } },
          { base: { codigo_barra: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: {
        base: true,
        stock: { where: { localId }, select: { cantidad: true } },
      },
      take: 30,
    });

    // Rankear por relevancia antes de mapear
    const qLower = q.toLowerCase();
    productos.sort((a, b) => {
      return rankScore(a, qLower) - rankScore(b, qLower);
    });

    // Fallback fuzzy para búsqueda por voz: si el LIKE devolvió pocos resultados
    // (transcripción imprecisa típica de voz), traer candidatos del local y rankear
    // por similitud (Levenshtein). Solo se activa con fromVoice=true para no
    // afectar la búsqueda manual ni el scanner.
    if (fromVoice && productos.length < FUZZY_MIN_LIKE_RESULTS) {
      const idsActuales = new Set(productos.map((p) => p.id));
      const candidatos = await prisma.productoLocal.findMany({
        where: {
          localId,
          activo: true,
          base: { activo: true },
        },
        select: {
          id: true,
          nombre: true,
          base: { select: { nombre: true, codigo_barra: true } },
        },
        take: FUZZY_CANDIDATE_LIMIT,
        orderBy: { id: "asc" },
      });

      const ranked = rankearFuzzy(candidatos, q, {
        getNombre: (p) => p.nombre || p.base?.nombre || "",
        getCodigo: (p) => p.base?.codigo_barra || null,
        maxDistance: 3,
      });

      const idsFuzzy = ranked
        .map((r) => r.item.id)
        .filter((id) => !idsActuales.has(id))
        .slice(0, FUZZY_TOP_RESULTS);

      if (idsFuzzy.length > 0) {
        const fuzzyFull = await prisma.productoLocal.findMany({
          where: { id: { in: idsFuzzy } },
          include: {
            base: true,
            stock: { where: { localId }, select: { cantidad: true } },
          },
        });
        const orderMap = new Map(idsFuzzy.map((id, idx) => [id, idx]));
        fuzzyFull.sort(
          (a, b) => orderMap.get(a.id) - orderMap.get(b.id)
        );
        productos.push(...fuzzyFull);
      }
    }

    const items = mapProductos(productos.slice(0, 10), esDeposito, allowNegativeStock, listaAplicable);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("Error buscar-producto POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al buscar productos" },
      { status: 500 }
    );
  }
}

/**
 * Score de relevancia para ranking de búsqueda (menor = más relevante).
 * 0: código exacto | 1: nombre exacto | 2: nombre empieza con q
 * 3: alguna palabra empieza con q | 4: contiene q | 5: resto
 */
function rankScore(pl, qLower) {
  const nombre = (pl.nombre || pl.base?.nombre || "").toLowerCase();
  const codigo = (pl.base?.codigo_barra || "").toLowerCase();
  if (codigo === qLower) return 0;
  if (nombre === qLower) return 1;
  if (nombre.startsWith(qLower)) return 2;
  const palabras = nombre.split(/\s+/);
  if (palabras.some((w) => w.startsWith(qLower))) return 3;
  if (nombre.includes(qLower)) return 4;
  return 5;
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

      // Aplicar lista de precios (si hay una resuelta)
      let aplicacionLista = null;
      if (listaAplicable) {
        const precioOriginal = Number(precioVenta.toFixed(2));
        // El costo en DB está en la misma escala que precio_venta (bulto si factor_pack>1,
        // por kg si fiambre fijo). Para que `calcularPrecioConLista` produzca un precio
        // consistente con la escala de `precioVenta` (que ya fue derivado a unitario/pieza
        // según modoSalidaDefault), hay que escalar el costo igual.
        let costoEnEscala = precioCosto;
        if (fiambreFijo) {
          costoEnEscala = Number((precioCosto * pesoReferenciaKg).toFixed(2));
        } else if (
          factorPack > 1 &&
          unidadMedida !== "unidad" &&
          modoSalidaDefault === "UNIDAD"
        ) {
          costoEnEscala = Number((precioCosto / factorPack).toFixed(2));
        }
        try {
          const calc = calcularPrecioConLista({
            precioVenta,
            costo: costoEnEscala,
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
        precioVenta: Number(precioVenta.toFixed(2)),
        precioVentaUnitario,
        precioVentaBulto,
        precioCosto,
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
