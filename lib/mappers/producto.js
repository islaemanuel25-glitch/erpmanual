// lib/mappers/producto.js

function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** ============================================================
 *  MERGE BASE + LOCAL → UI
 *  ============================================================ */
export function mergeBaseLocalToUi(base = {}, local = null) {
  if (!base) return null;

  const pick = (global, override) => {
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
    codigoBarraSecundario: base.codigo_barra_secundario ?? null,

    categoriaId: base.categoria_id ?? null,
    proveedorId: base.proveedor_id ?? null,
    proveedor2Id: base.proveedor2_id ?? null,
    proveedor3Id: base.proveedor3_id ?? null,
    areaFisicaId: base.area_fisica_id ?? null,

    unidadMedida: base.unidad_medida,
    factorPack: base.factor_pack,
    modoPedido: base.modo_pedido ?? "BULTO",
    modoEnvio: base.modo_envio ?? (base.unidad_medida === "cajon" ? "SOLO_BULTO" : "MIXTO"),
    modoStock: base.modo_stock ?? "BULTO",

    pesoKg: toNum(base.peso_kg),
    volumenMl: toNum(base.volumen_ml),

    modoCompraProveedor: base.modoCompraProveedor ?? "BULTO",
    pesoReferenciaKg: toNum(base.pesoReferenciaKg),
    pesoEsFijo: base.pesoEsFijo ?? false,
    modoVentaDeposito: base.modoVentaDeposito ?? "PESO",
    pesoPromedioKg: toNum(base.pesoPromedioKg),
    actualizaPromedioPorRecepcion: base.actualizaPromedioPorRecepcion ?? true,

    precioCosto: toNum(pick(base.precio_costo, local?.precio_costo)),
    precioVenta: toNum(pick(base.precio_venta, local?.precio_venta)),
    margen: toNum(pick(base.margen, local?.margen)),

    precioSugerido: toNum(base.precio_sugerido),
    ivaPorcentaje: toNum(base.iva_porcentaje),
    fechaVencimiento: base.fecha_vencimiento ?? null,

    redondeo100: base.redondeo_100 ?? true,
    activo: pick(base.activo, local?.activo),

    imagenUrl: base.imagen_url ?? null,
    esCombo: base.es_combo ?? false,

    createdAt: base.createdAt ?? null,
    updatedAt: base.updatedAt ?? null,
  };
}

/** ============================================================
 *  UI → DB  (split)
 *  ============================================================ */
export function splitUiToDb(payload = {}) {
  const baseData = {
    nombre: payload.nombre ?? null,
    descripcion: payload.descripcion ?? null,
    sku: payload.sku ?? null,
    codigo_barra: payload.codigo_barra ?? null,
    codigo_barra_secundario: payload.codigo_barra_secundario ?? null,

    categoria_id: payload.categoria_id ? Number(payload.categoria_id) : null,
    proveedor_id: payload.proveedor_id ? Number(payload.proveedor_id) : null,
    proveedor2_id: payload.proveedor2_id ? Number(payload.proveedor2_id) : null,
    proveedor3_id: payload.proveedor3_id ? Number(payload.proveedor3_id) : null,
    area_fisica_id: payload.area_fisica_id ? Number(payload.area_fisica_id) : null,

    unidad_medida: payload.unidad_medida,
    factor_pack: payload.factor_pack ?? null,
    modo_pedido: payload.modo_pedido ?? "BULTO",
    modo_envio: payload.modo_envio ?? (payload.unidad_medida === "cajon" ? "SOLO_BULTO" : "MIXTO"),
    modo_stock: payload.modo_stock ?? "BULTO",

    peso_kg: payload.peso_kg ?? null,
    volumen_ml: payload.volumen_ml ?? null,

    modoCompraProveedor: payload.modoCompraProveedor ?? "BULTO",
    pesoReferenciaKg: payload.pesoReferenciaKg ?? null,
    pesoEsFijo: Boolean(payload.pesoEsFijo ?? false),
    modoVentaDeposito: payload.modoVentaDeposito || "PESO",
    pesoPromedioKg: payload.pesoPromedioKg ?? null,
    actualizaPromedioPorRecepcion: payload.actualizaPromedioPorRecepcion ?? true,

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

  // 🔥 Override local
  const localData = {
    precio_costo: payload.precio_costo ?? null,
    precio_venta: payload.precio_venta ?? null,
    margen: payload.margen ?? null,
    activo: payload.activo ?? true,
  };

  return { baseData, localData };
}
