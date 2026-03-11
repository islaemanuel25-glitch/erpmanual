import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { defaultModoEnvio, esProductoFiambre } from "@/lib/conversiones/stock";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const destinoId = Number(searchParams.get("destinoId") || 0);
    const posId = Number(searchParams.get("posId") || 0);

    if (!destinoId || !posId) {
      return NextResponse.json(
        {
          ok: false,
          error: "destinoId y posId requeridos",
        },
        { status: 400 }
      );
    }

    // ============================================================
    // 1) Obtener baseIds ya preparados
    // ============================================================
    const detalles = await prisma.posTransferenciaDetalle.findMany({
      where: { posTransferenciaId: posId },
      include: {
        producto: { select: { baseId: true } },
      },
    });

    const preparadosBaseIds = new Set(detalles.map((d) => d.producto.baseId));

    // ============================================================
    // 2) Confirmar destino
    // ============================================================
    const destino = await prisma.local.findUnique({
      where: { id: destinoId },
      select: { es_deposito: true },
    });

    if (!destino || destino.es_deposito) {
      return NextResponse.json(
        { ok: false, error: "Destino inválido" },
        { status: 400 }
      );
    }

    // Buscar depósito del grupo
    const grupoLocal = await prisma.grupoLocal.findUnique({
      where: { localId: destinoId },
      select: { grupoId: true },
    });

    if (!grupoLocal) {
      return NextResponse.json(
        { ok: false, error: "El local destino no pertenece a ningún grupo" },
        { status: 400 }
      );
    }

    const grupoDeposito = await prisma.grupoDeposito.findFirst({
      where: { grupoId: grupoLocal.grupoId },
      select: { localId: true },
    });

    if (!grupoDeposito) {
      return NextResponse.json(
        { ok: false, error: "No se encontró depósito para el grupo del local destino" },
        { status: 400 }
      );
    }

    const depositoId = grupoDeposito.localId;

    // ============================================================
    // 3) Productos del destino
    // ============================================================
    const productosDestino = await prisma.productoLocal.findMany({
      where: { localId: destinoId },
      include: {
        base: {
          include: {
            categoria: { select: { nombre: true } },
            area_fisica: { select: { nombre: true } },
          },
        },
        stock: {
          where: { localId: destinoId },
          select: { cantidad: true, stockMin: true, stockMax: true },
        },
      },
    });

    // ============================================================
    // 4) Obtener TODOS los ProductoLocal del depósito en una sola query
    // ============================================================
    const productosOrigen = await prisma.productoLocal.findMany({
      where: { localId: depositoId },
      include: {
        stock: {
          where: { localId: depositoId },
          select: { cantidad: true },
        },
      },
    });

    // Armar Map<baseId, { productoLocalOrigenId, stockActualOrigen }>
    const origenMap = new Map();
    for (const origen of productosOrigen) {
      const stockActualOrigen = Number(origen.stock?.[0]?.cantidad || 0);
      origenMap.set(origen.baseId, {
        productoLocalOrigenId: origen.id,
        stockActualOrigen,
      });
    }

    // ============================================================
    // 5) Procesar productos destino y calcular sugeridos
    // ============================================================
    const items = [];

    for (const p of productosDestino) {
      if (preparadosBaseIds.has(p.baseId)) continue;

      const base = p.base;
      const stock = p.stock?.[0] || {};

      const stockActualDestino = Number(stock.cantidad || 0);
      const stockMax = Number(stock.stockMax || 0);

      // Calcular faltante en unidades
      const faltanteUnidades = stockMax > stockActualDestino ? stockMax - stockActualDestino : 0;

      if (faltanteUnidades <= 0) continue;

      // Aplicar modo_pedido; modoVentaDeposito PIEZA → sugerir en piezas cuando aplique
      const modoPedido = base.modo_pedido || "BULTO";
      const factorPack = Number(base.factor_pack || 1);
      const modoVentaDep = base.modoVentaDeposito || "PESO";
      const pesoRef = Number(base.pesoReferenciaKg || 0);
      let sugeridoCantidad;
      let sugeridoUnidad;

      if (modoVentaDep === "PIEZA" && pesoRef > 0 && esProductoFiambre(base)) {
        sugeridoCantidad = Math.ceil(faltanteUnidades / pesoRef);
        sugeridoUnidad = "UNIDAD";
      } else if (modoPedido === "BULTO" && factorPack > 1) {
        // Por bulto: ceil(faltanteUnidades / factor)
        sugeridoCantidad = Math.ceil(faltanteUnidades / factorPack);
        sugeridoUnidad = "BULTO";
      } else {
        // Por unidad: faltanteUnidades
        sugeridoCantidad = faltanteUnidades;
        sugeridoUnidad = "UNIDAD";
      }

      if (sugeridoCantidad <= 0) continue;

      // Obtener datos del origen desde el Map (sin query adicional)
      const origenData = origenMap.get(p.baseId) || {
        productoLocalOrigenId: null,
        stockActualOrigen: 0,
      };

      items.push({
        productoLocalDestinoId: p.id,
        productoLocalOrigenId: origenData.productoLocalOrigenId,

        baseId: p.baseId,
        productoNombre: p.nombre || base.nombre,
        codigoBarra: base.codigo_barra || "",

        // Filtros UI: devolver valor real o null (sin fallback de texto).
        categoriaNombre: base?.categoria?.nombre?.trim() || null,
        areaFisicaNombre: base?.area_fisica?.nombre?.trim() || null,

        stockActualDestino,
        stockMin: Number(stock.stockMin || 0),
        stockMax,

        stockActualOrigen: origenData.stockActualOrigen,
        
        // Campos nuevos (claridad)
        sugeridoCantidad,
        sugeridoUnidad,
        faltanteUnidades,
        factorPack,
        modoEnvio: base.modo_envio || defaultModoEnvio(base.unidad_medida),
        modoStock: base.modo_stock || "BULTO",

        // Campo legacy (compatibilidad)
        sugerido: sugeridoCantidad,

        precioCosto: Number(p.precio_costo || base.precio_costo || 0),
        unidadMedida: base.unidad_medida,
        modoPedido: base.modo_pedido || "BULTO",

        // Fiambre: modoVentaDeposito define si depósito opera por PIEZA o PESO
        esFiambre: esProductoFiambre(base),
        modoVentaDeposito: base.modoVentaDeposito || "PESO",
        pesoReferenciaKg: esProductoFiambre(base) ? Number(base.pesoReferenciaKg || 0) : null,
      });
    }

    if (process.env.NODE_ENV !== "production") {
      const sampleConMeta = items.find((i) => i.categoriaNombre || i.areaFisicaNombre);
      if (sampleConMeta) {
        console.debug("[pos-transferencias/sugeridos] sample categoria/area", {
          baseId: sampleConMeta.baseId,
          categoriaNombre: sampleConMeta.categoriaNombre,
          areaFisicaNombre: sampleConMeta.areaFisicaNombre,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      items,
      total: items.length,
      error: null,
    });
  } catch (err) {
    console.error("Error sugeridos POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
