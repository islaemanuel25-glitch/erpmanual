// correccionDirty — detección de "cambios sin guardar" en la corrección de venta.
//
// Genera una FIRMA determinista del PAYLOAD FUNCIONAL que realmente se enviaría a
// /revisar y /corregir (líneas + pagos + cliente + motivo), y la compara contra el
// snapshot inicial tomado justo después de cargar /editar. Es un helper PURO y
// testeable: no depende de React ni del DOM.
//
// Principios (para evitar falsos positivos/negativos):
//   · Se normaliza sobre la SALIDA de payloadLineas()/payloadPagos(), no sobre el
//     estado React crudo (keys, nombres, flags de UI no cambian el payload).
//   · Importes en CENTAVOS; cantidades en MILÉSIMAS (soporta fraccionarios ≤3 dec).
//   · Orden ESTABLE (sort determinista): reordenar líneas/pagos no marca dirty.
//   · Se ignoran metadatos de UI y los estados loading/error/revision.
//
// Campos considerados por línea: origenDetalleId (alta/baja), productoBaseId,
// cantidad, precio, precioCosto, modoVentaLinea (Pack/Unidad), factorPack,
// cantidadStock, esServicio, importeServicio. Por pago: medio y monto (el
// "ajustador" no es campo de wire —el backend lo deriva— y se refleja vía los
// montos resultantes). Además: cliente seleccionado (id) y motivo (trim).
//
// Nota: el payload usa productoBaseId (no productoLocalId); la resolución a
// ProductoLocal la hace el backend, así que la firma compara por productoBaseId.

const money = (n) => Math.round(Number(n || 0) * 100); // centavos
const qty = (n) => Math.round(Number(n || 0) * 1000); // milésimas (cantidades fraccionarias)

function normLinea(l) {
  return {
    o: l.origenDetalleId != null ? Number(l.origenDetalleId) : null, // null = línea agregada
    b: l.productoBaseId != null ? Number(l.productoBaseId) : null,
    c: qty(l.cantidad),
    p: money(l.precio),
    pc: l.precioCosto != null ? money(l.precioCosto) : null,
    m: String(l.modoVentaLinea || "NORMAL"),
    f: Math.max(1, Number(l.factorPack) || 1),
    cs: l.cantidadStock == null ? null : qty(l.cantidadStock),
    s: l.esServicio ? 1 : 0,
    is: l.importeServicio != null ? money(l.importeServicio) : null,
  };
}

function normPago(p) {
  return { medio: String(p.medio || "").toUpperCase(), monto: money(p.monto) };
}

function cmpLinea(a, b) {
  const MAX = Number.MAX_SAFE_INTEGER;
  return (
    (a.o == null ? MAX : a.o) - (b.o == null ? MAX : b.o) ||
    (a.b == null ? -1 : a.b) - (b.b == null ? -1 : b.b) ||
    a.p - b.p ||
    a.c - b.c ||
    (a.m < b.m ? -1 : a.m > b.m ? 1 : 0)
  );
}

function cmpPago(a, b) {
  return a.medio < b.medio ? -1 : a.medio > b.medio ? 1 : a.monto - b.monto;
}

/**
 * Firma determinista del payload funcional de corrección.
 * @param {{lineas?: Array, pagos?: Array, cliente?: {id:any}|null, motivo?: string}} estado
 *   lineas = salida de payloadLineas(); pagos = salida de payloadPagos(pagosCalc.pagos).
 * @returns {string}
 */
export function firmaCorreccion(estado = {}) {
  const { lineas = [], pagos = [], cliente = null, motivo = "" } = estado || {};
  const L = (lineas || []).map(normLinea).sort(cmpLinea);
  const P = (pagos || []).map(normPago).sort(cmpPago);
  const C = cliente && cliente.id != null ? Number(cliente.id) : null;
  const M = String(motivo || "").trim();
  return JSON.stringify({ L, P, C, M });
}

/**
 * ¿Hay cambios respecto del snapshot inicial?
 * @param {string|null} firmaInicial  firma tomada tras cargar /editar (null = aún sin cargar).
 * @param {object} estadoActual        mismo shape que firmaCorreccion().
 * @returns {boolean}
 */
export function correccionDirty(firmaInicial, estadoActual) {
  if (firmaInicial == null) return false; // venta no cargada todavía → nunca dirty
  return firmaInicial !== firmaCorreccion(estadoActual);
}
