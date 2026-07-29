// lib/reportes-ventas/returnParams.js
//
// Contexto de RETORNO del listado de ventas, serializado en query params VALIDADOS.
// Se usa para: (a) construir el link "Ver venta" → /modulos/reportes-ventas/[id]?<ctx>,
// y (b) reconstruir "Volver a ventas" con el mismo contexto. Todo pasa por una
// WHITELIST estricta: cualquier clave/valor no reconocido se descarta.
//
// NO acepta: rutas, URLs completas, javascript:, ni parámetros arbitrarios (returnTo).
// Las URLs que produce SIEMPRE son rutas internas con el prefijo BASE.

const BASE = "/modulos/reportes-ventas";
const TABS = new Set(["venta", "cliente"]);
const FORMAS = new Set(["efectivo", "mercadopago", "debito", "credito"]);
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE = 100000;

function toInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

// YYYY-MM-DD con fecha real (rechaza 2026-13-40).
function fechaValida(s) {
  if (typeof s !== "string" || !RE_FECHA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

// Lee de un URLSearchParams / ReadonlyURLSearchParams / objeto plano / Map.
function reader(input) {
  if (input && typeof input.get === "function") return (k) => input.get(k);
  if (input && typeof input === "object") return (k) => input[k];
  return () => null;
}

/**
 * Parsea y VALIDA el contexto de retorno. Devuelve un objeto canónico solo con las
 * claves reconocidas y válidas (las demás se ignoran). `page` se descarta si tab es
 * "cliente" (esa vista no pagina).
 */
export function parseReturnParams(input) {
  const get = reader(input);
  const out = {};

  const tabRaw = get("tab");
  if (tabRaw != null && TABS.has(String(tabRaw))) out.tab = String(tabRaw);

  const fd = get("fechaDesde");
  if (fd != null && fechaValida(String(fd))) out.fechaDesde = String(fd);
  const fh = get("fechaHasta");
  if (fh != null && fechaValida(String(fh))) out.fechaHasta = String(fh);

  const lid = toInt(get("localId"));
  if (lid != null && lid >= 1) out.localId = lid;

  const fp = get("formaPago");
  if (fp != null && FORMAS.has(String(fp).toLowerCase())) out.formaPago = String(fp).toLowerCase();

  // page: entero >= 1; irrelevante en la vista "cliente" (no pagina) → se descarta.
  const page = toInt(get("page"));
  if (page != null && page >= 1 && page <= MAX_PAGE && out.tab !== "cliente") out.page = page;

  return out;
}

/**
 * Serializa un contexto a query string (revalidando). Orden estable. Devuelve "" si
 * no hay nada válido. NUNCA emite claves fuera de la whitelist.
 */
export function serializeReturnParams(params) {
  const c = parseReturnParams(params || {});
  const sp = new URLSearchParams();
  if (c.tab) sp.set("tab", c.tab);
  if (c.page != null) sp.set("page", String(c.page));
  if (c.fechaDesde) sp.set("fechaDesde", c.fechaDesde);
  if (c.fechaHasta) sp.set("fechaHasta", c.fechaHasta);
  if (c.localId != null) sp.set("localId", String(c.localId));
  if (c.formaPago) sp.set("formaPago", c.formaPago);
  return sp.toString();
}

/** URL interna del detalle de una venta con el contexto de retorno embebido. */
export function buildDetalleUrl(ventaId, ctx) {
  const id = Number(ventaId);
  if (!Number.isInteger(id) || id <= 0) return BASE; // fail-safe: nunca una URL inválida
  const qs = serializeReturnParams(ctx || {});
  return `${BASE}/${id}${qs ? `?${qs}` : ""}`;
}

/** URL interna de regreso al listado, reconstruida desde params validados. */
export function buildVolverUrl(input) {
  const qs = serializeReturnParams(parseReturnParams(input || {}));
  return qs ? `${BASE}?${qs}` : BASE;
}

/**
 * ¿El contexto alcanza para RECONSTRUIR el reporte automáticamente? El reporte exige
 * fechaDesde + fechaHasta; sin ambas no se auto-genera (se cae al flujo manual).
 */
export function contextoReconstruible(input) {
  const p = parseReturnParams(input || {});
  return Boolean(p.fechaDesde && p.fechaHasta);
}

export const REPORTES_VENTAS_BASE = BASE;
