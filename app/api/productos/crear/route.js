import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getGrupoIdDeLocal, getLocalesDeGrupo } from "@/lib/grupos";

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const localId = Number(url.searchParams.get("localId") || 0);
    const body = await req.json();

    if (!localId) {
      return NextResponse.json({ ok: false, error: "localId requerido" }, { status: 400 });
    }

    const num = (v) =>
      v === "" || v === null || v === undefined || Number.isNaN(Number(v))
        ? null
        : Number(v);

    // 1) Obtener grupo del local creador
    const grupoId = await getGrupoIdDeLocal(localId);
    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "El local no pertenece a ningún grupo" },
        { status: 400 }
      );
    }

    // 2) Crear ProductoBase
    const base = await prisma.productoBase.create({
      data: {
        grupoId,
        creadoEnLocalId: localId,
        nombre: body.nombre,
        descripcion: body.descripcion || null,
        sku: body.sku || null,
        codigo_barra: body.codigo_barra || null,

        categoria_id: num(body.categoria_id),
        proveedor_id: num(body.proveedor_id),
        area_fisica_id: num(body.area_fisica_id),

        unidad_medida: body.unidad_medida,
        factor_pack: num(body.factor_pack),

        peso_kg: num(body.peso_kg),
        volumen_ml: num(body.volumen_ml),

        precio_costo: Number(body.precio_costo),
        precio_venta: Number(body.precio_venta),
        margen: num(body.margen),

        precio_sugerido: num(body.precio_sugerido),
        iva_porcentaje: num(body.iva_porcentaje),

        fecha_vencimiento: body.fecha_vencimiento
          ? new Date(body.fecha_vencimiento)
          : null,

        redondeo_100: Boolean(body.redondeo_100),
        activo: Boolean(body.activo),
        imagen_url: body.imagen_url || null,
        es_combo: Boolean(body.es_combo),
      },
    });

    // 3) Ver si el creador es depósito
    const creador = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    // --------------------------------------------------------
    // CASO DEPÓSITO → replicar a todos los locales del grupo
    // --------------------------------------------------------
    if (creador?.es_deposito) {
      const localesGrupo = await getLocalesDeGrupo(grupoId);

      for (const loc of localesGrupo) {
        const pl = await prisma.productoLocal.create({
          data: {
            localId: loc.id,
            baseId: base.id,
            precio_costo: base.precio_costo,
            precio_venta: base.precio_venta,
            margen: base.margen,
            activo: base.activo,
          },
        });

        await prisma.stockLocal.create({
          data: {
            localId: loc.id,
            productoId: pl.id, // ✔ CORRECTO
            cantidad: 0,
            stockMin: 0,
            stockMax: 0,
          },
        });
      }

      return NextResponse.json({ ok: true, item: base });
    }

    // --------------------------------------------------------
    // CASO LOCAL → crear solo en ese local
    // --------------------------------------------------------
    const pl = await prisma.productoLocal.create({
      data: {
        localId,
        baseId: base.id,
        precio_costo: base.precio_costo,
        precio_venta: base.precio_venta,
        margen: base.margen,
        activo: base.activo,
      },
    });

    await prisma.stockLocal.create({
      data: {
        localId,
        productoId: pl.id, // ✔ CORRECTO
        cantidad: 0,
        stockMin: 0,
        stockMax: 0,
      },
    });

    return NextResponse.json({ ok: true, item: base });

  } catch (e) {
    console.error("🔥 ERROR CREAR PRODUCTO >>>", e);
    return NextResponse.json(
      { ok: false, error: e.message || String(e) },
      { status: 500 }
    );
  }
}
