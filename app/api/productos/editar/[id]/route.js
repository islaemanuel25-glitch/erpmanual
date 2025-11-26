import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { mergeBaseLocalToUi, splitUiToDb } from "@/lib/mappers/producto";

// Sincronizar precioCosto/activo a overrides
async function syncFromBaseToLocales(baseId, { precioCosto, activo }) {
  const data = {};
  if (precioCosto !== undefined && precioCosto !== null) {
    data.precio_costo = Number(precioCosto);
  }
  if (activo !== undefined) {
    data.activo = Boolean(activo);
  }
  if (Object.keys(data).length === 0) return;

  await prisma.productoLocal.updateMany({
    where: { baseId },
    data,
  });
}

export async function PUT(req, context) {
  try {
    const { id } = await context.params;
    const baseId = Number(id);

    if (!baseId || Number.isNaN(baseId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const localId = Number(url.searchParams.get("localId") || "0");

    const payload = await req.json();

    // separar base vs local con snake_case
    const { baseData, localData } = splitUiToDb(payload);

    // depósito o sin localId → edita BASE
    if (localId <= 0) return await editarBase(baseId, baseData);

    const local = await prisma.local.findUnique({
      where: { id: localId },
    });

    if (local?.es_deposito) return await editarBase(baseId, baseData);

    return await editarOverride(baseId, localId, localData);
  } catch (e) {
    console.error("ERROR productos/editar:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

/* ============================================================
   EDITAR PRODUCTO BASE — FIX FINAL
   ============================================================ */
async function editarBase(baseId, baseData) {
  const dataFinal = {
    nombre: baseData.nombre,
    descripcion: baseData.descripcion,
    sku: baseData.sku,
    codigo_barra: baseData.codigo_barra,

    unidad_medida: baseData.unidad_medida,
    factor_pack: baseData.factor_pack,

    peso_kg: baseData.peso_kg,
    volumen_ml: baseData.volumen_ml,

    precio_costo: baseData.precio_costo,
    precio_venta: baseData.precio_venta,
    margen: baseData.margen,

    precio_sugerido: baseData.precio_sugerido,
    iva_porcentaje: baseData.iva_porcentaje,

    fecha_vencimiento: baseData.fecha_vencimiento,

    redondeo_100: baseData.redondeo_100,
    activo: baseData.activo,

    imagen_url: baseData.imagen_url,
    es_combo: baseData.es_combo,

    // 🔥🔥🔥 FIX CORRECTO: asignar las FKs directamente
    categoria_id: baseData.categoria_id ? Number(baseData.categoria_id) : null,
    proveedor_id: baseData.proveedor_id ? Number(baseData.proveedor_id) : null,
    area_fisica_id: baseData.area_fisica_id ? Number(baseData.area_fisica_id) : null,
  };

  const updated = await prisma.productoBase.update({
    where: { id: baseId },
    data: dataFinal,
    include: { locales: true },
  });

  // sincronizar precioCosto/activo en overrides
  await syncFromBaseToLocales(baseId, {
    precioCosto: baseData.precio_costo,
    activo: baseData.activo,
  });

  return NextResponse.json({
    ok: true,
    item: mergeBaseLocalToUi(updated, null),
  });
}

/* ============================================================
   EDITAR OVERRIDE LOCAL
   ============================================================ */
async function editarOverride(baseId, localId, localData) {
  const existing = await prisma.productoLocal.findFirst({
    where: { baseId, localId },
  });

  let override;

  if (existing) {
    override = await prisma.productoLocal.update({
      where: { id: existing.id },
      data: {
        precio_costo: localData.precio_costo ?? undefined,
        precio_venta: localData.precio_venta ?? undefined,
        margen: localData.margen ?? undefined,
        activo: localData.activo ?? undefined,
        nombre: null,
        descripcion: null,
      },
    });
  } else {
    override = await prisma.productoLocal.create({
      data: {
        baseId,
        localId,
        precio_costo: localData.precio_costo ?? null,
        precio_venta: localData.precio_venta ?? null,
        margen: localData.margen ?? null,
        activo: localData.activo ?? true,
        nombre: null,
        descripcion: null,
      },
    });
  }

  const base = await prisma.productoBase.findUnique({
    where: { id: baseId },
  });

  return NextResponse.json({
    ok: true,
    item: mergeBaseLocalToUi(base, override),
  });
}
