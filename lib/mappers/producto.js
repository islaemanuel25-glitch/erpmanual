// lib/mappers/producto.js

function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** ✅ MERGE BASE + LOCAL → UI */
export function mergeBaseLocalToUi(base = {}, local = null) {
  if (!base) return null;

  const pick = (global, override) => {
    // ❌ Si override es null → NO debe pisar el valor base
    if (override === null || override === undefined) return global;
    return override;
  };

  return {
    id: base.id,
    baseId: base.id,
    localProductoId: local?.id ?? null,
    localId: local?.localId ?? null,

    nombre: pick(base.nombre, local?.nombre),
    descripcion: pick(base.descripcion, local?.descripcion),
    sku: base.sku ?? null,
    codigoBarra: base.codigo_barra ?? null,

    categoriaId: base.categoria_id ?? null,
    proveedorId: base.proveedor_id ?? null,
    areaFisicaId: base.area_fisica_id ?? null,

    unidadMedida: base.unidad_medida,
    factorPack: base.factor_pack,

    pesoKg: toNum(base.peso_kg),
    volumenMl: toNum(base.volumen_ml),

    precioCosto: toNum(pick(base.precio_costo, local?.precio_costo)),
    precioVenta: toNum(pick(base.precio_venta, local?.precio_venta)),
    margen: toNum(pick(base.margen, local?.margen)),

    precioSugerido: toNum(base.precio_sugerido),
    ivaPorcentaje: toNum(base.iva_porcentaje),
    fechaVencimiento: base.fecha_vencimiento ?? null,

    redondeo100: base.redondeo_100 ?? false,
    activo: pick(base.activo, local?.activo),

    imagenUrl: base.imagen_url ?? null,
    esCombo: base.es_combo ?? false,

    createdAt: base.createdAt ?? null,
    updatedAt: base.updatedAt ?? null,
  };
}

/** ✅ UI → DB (split) */
export function splitUiToDb(payload = {}) {
  // ✅ Datos base SIN override
  const baseData = {
    nombre: payload.nombre ?? null,
    descripcion: payload.descripcion ?? null,
    sku: payload.sku ?? null,
    codigo_barra: payload.codigo_barra ?? null,

    unidad_medida: payload.unidad_medida,
    factor_pack: payload.factor_pack ?? null,

    peso_kg: payload.peso_kg ?? null,
    volumen_ml: payload.volumen_ml ?? null,

    precio_costo: payload.precio_costo ?? null,
    precio_venta: payload.precio_venta ?? null,
    margen: payload.margen ?? null,

    precio_sugerido: payload.precio_sugerido ?? null,
    iva_porcentaje: payload.iva_porcentaje ?? null,

    fecha_vencimiento: payload.fecha_vencimiento
      ? new Date(payload.fecha_vencimiento)
      : null,

    redondeo_100: Boolean(payload.redondeo_100),
    activo: payload.activo ?? true,

    imagen_url: payload.imagen_url ?? null,
    es_combo: Boolean(payload.es_combo),
  };

  // ✅ Relaciones para Prisma
  if (payload.categoria_id)
    baseData.categoria = { connect: { id: Number(payload.categoria_id) } };
  else baseData.categoria = { disconnect: true };

  if (payload.proveedor_id)
    baseData.proveedor = { connect: { id: Number(payload.proveedor_id) } };
  else baseData.proveedor = { disconnect: true };

  if (payload.area_fisica_id)
    baseData.area_fisica = { connect: { id: Number(payload.area_fisica_id) } };
  else baseData.area_fisica = { disconnect: true };

  // ✅ Override del local SOLO TIENE CAMPOS EDITABLES POR LOCAL
  const localData = {
    precio_costo: payload.precio_costo ?? null,
    precio_venta: payload.precio_venta ?? null,
    margen: payload.margen ?? null,
    activo: payload.activo ?? true,
  };

  return { baseData, localData };
}
