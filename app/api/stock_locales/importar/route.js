// app/api/stock_locales/importar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    // ================================
    // 0) SESSION Y PERMISOS
    // ================================
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado." },
        { status: 401 }
      );
    }

    const { permisos } = session;
    const esAdmin = Array.isArray(permisos) && permisos.includes("*");

    // Solo admin puede importar masivamente
    if (!esAdmin && !permisos.includes("productos.importar")) {
      return NextResponse.json(
        { ok: false, error: "No tenés permisos para importar productos." },
        { status: 403 }
      );
    }

    // ================================
    // 1) RECIBIR BODY
    // ================================
    const { productos } = await req.json();

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay productos para importar." },
        { status: 400 }
      );
    }

    // ================================
    // 2) MAPEO camelCase → snake_case
    // ================================
    const productosBaseData = productos.map((p) => ({
      grupoId: p.grupoId,
      creadoEnLocalId: p.creadoEnLocalId ?? null,

      nombre: p.nombre,
      descripcion: p.descripcion ?? null,
      sku: p.sku ?? null,
      codigo_barra: p.codigoBarra ?? null,

      categoria_id: p.categoriaId ?? null,
      proveedor_id: p.proveedorId ?? null,
      area_fisica_id: p.areaFisicaId ?? null,

      unidad_medida: p.unidadMedida,
      factor_pack: p.factorPack ?? null,
      peso_kg: p.pesoKg ?? null,
      volumen_ml: p.volumenMl ?? null,

      precio_costo: Number(p.precioCosto),
      precio_venta: Number(p.precioVenta),
      margen: p.margen ?? null,
      precio_sugerido: p.precioSugerido ?? null,
      iva_porcentaje: p.ivaPorcentaje ?? null,
      fecha_vencimiento: p.fechaVencimiento ?? null,
      redondeo_100: p.redondeo100 ?? false,
      activo: p.activo ?? true,

      imagen_url: p.imagenUrl ?? null,
      es_combo: p.esCombo ?? false,
    }));

    // ================================
    // 3) INSERTAR PRODUCTO BASE
    // ================================
    await prisma.productoBase.createMany({
      data: productosBaseData,
      skipDuplicates: true,
    });

    // ================================
    // 4) LEER LOS INSERTADOS RECIENTES
    // ================================
    const bases = await prisma.productoBase.findMany({
      orderBy: { id: "desc" },
      take: productosBaseData.length,
    });

    const baseIds = bases.map((b) => b.id);

    // ================================
    // 5) OBTENER LOCALES
    // (Admin puede afectar a todos)
    // ================================
    const locales = await prisma.local.findMany({
      select: { id: true },
    });

    // ================================
    // 6) CREAR PRODUCTOLOCAL
    // ================================
    const productosLocalesData = [];

    for (const b of bases) {
      for (const l of locales) {
        productosLocalesData.push({
          baseId: b.id,
          localId: l.id,
          precio_costo: b.precio_costo,
          precio_venta: b.precio_venta,
          margen: b.margen,
          activo: b.activo,
        });
      }
    }

    await prisma.productoLocal.createMany({
      data: productosLocalesData,
      skipDuplicates: true,
    });

    // ================================
    // 7) CREAR STOCK LOCAL
    // ================================
    const productosLocales = await prisma.productoLocal.findMany({
      where: { baseId: { in: baseIds } },
      select: { id: true, localId: true },
    });

    const stockData = productosLocales.map((pl) => ({
      localId: pl.localId,
      productoId: pl.id,
      cantidad: 0,
      stockMin: 0,
      stockMax: 0,
    }));

    await prisma.stockLocal.createMany({
      data: stockData,
      skipDuplicates: true,
    });

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("❌ ERROR IMPORTAR:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
