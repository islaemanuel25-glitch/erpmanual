// lib/auditoria/formato.js
//
// Presentación legible de los cambios de la bitácora: nombre de campo en criollo
// y valores formateados. Se usa en el flush del interceptor.

const LABELS = {
  precio_costo: "Precio de costo",
  precio_venta: "Precio de venta",
  precio_sugerido: "Precio sugerido",
  margen: "Margen",
  activo: "Activo",
  nombre: "Nombre",
  descripcion: "Descripción",
  estado: "Estado",
  permisos: "Permisos",
  email: "Email",
  sku: "SKU",
  codigo_barra: "Código de barra",
  codigo_barra_secundario: "Código de barra secundario",
  categoria_id: "Categoría (id)",
  proveedor_id: "Proveedor (id)",
  proveedor2_id: "Proveedor 2 (id)",
  proveedor3_id: "Proveedor 3 (id)",
  iva_porcentaje: "IVA %",
  unidad_medida: "Unidad de medida",
  factor_pack: "Factor pack",
  stock: "Stock",
  stockMin: "Stock mínimo",
  stockMax: "Stock máximo",
  cantidad: "Cantidad",
  rolId: "Rol (id)",
  localId: "Local (id)",
  fechaAnulado: "Fecha anulado",
  fechaRecibido: "Fecha recibido",
  redondeo_100: "Redondeo a 100",
};

function prettify(campo) {
  return String(campo)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function labelDe(campo) {
  return LABELS[campo] || prettify(campo);
}

function esNumericoStr(v) {
  return typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v);
}

function formatNumero(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
}

// Convierte un valor (ya JSON-safe: Decimal→string, Date→ISO) a texto legible.
export function formatValor(campo, v) {
  if (v === null || v === undefined) return null;
  if (v === "[REDACTADO]") return v;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "number" || esNumericoStr(v)) return formatNumero(v);
  if (typeof v === "string") {
    // Fecha ISO → YYYY-MM-DD
    const m = v.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (m) return m[1];
    return v;
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}
