// Helpers para cola offline de ventas pendientes
const STORAGE_KEY = "posVentasOfflineQueue_v1";

/**
 * Estructura de item en cola:
 * {
 *   clientVentaId: string (UUID),
 *   createdAt: number (timestamp),
 *   localId: number,
 *   grupoId: number,
 *   userId: number,
 *   formaPago: string,
 *   subtotal: number,
 *   descuento: number,
 *   descuentoPorPuntos: number,
 *   total: number,
 *   clienteId: number | null,
 *   // Operador identificado al cobrar (referencia/legibilidad) + voucher firmado
 *   // por el server. Al sincronizar el server atribuye la venta con el VOUCHER
 *   // (infalsificable), no con operadorId. Ítems legacy sin voucher → operador null.
 *   operadorId: number | null,
 *   operadorVoucher: string | null,
 *   // El turno donde se cobró (2026-10-02). La venta se sincroniza contra ESTE
 *   // turno y no contra el de quien sincroniza. null en ítems anteriores o si la
 *   // pantalla nunca supo su turno: ver lib/pos-ventas/replayOffline.js.
 *   turnoId: number | null,
 *   items: Array<{
 *     productoBaseId, nombre, precio, cantidad,
 *     // Modo de venta de la línea (depósito + pack). "NORMAL" | "UNIDAD_REMANENTE".
 *     // Opcional: ítems legacy sin este campo se procesan como "NORMAL".
 *     modoVentaLinea: 'NORMAL' | 'UNIDAD_REMANENTE',
 *     // Trazabilidad de lista de precios (Etapa 4 — opcional, tolerar legacy sin estos campos):
 *     listaPrecioId: number | null,
 *     tipoPrecioAplicado: 'PRECIO_VENTA' | 'COSTO_MAS_MARGEN' | 'COSTO_PURO' | 'MANUAL_AUTORIZADO' | 'OVERRIDE_PRODUCTO',
 *     margenAplicado: number | null,
 *   }>
 * }
 * Nota: ítems legacy (anteriores a Etapa 4) sin trazabilidad siguen siendo procesables.
 * El server resuelve la lista al procesar items sin listaPrecioId.
 */

export function loadQueue() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Error cargando cola offline:", err);
    return [];
  }
}

export function saveQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    return true;
  } catch (err) {
    console.error("Error guardando cola offline:", err);
    return false;
  }
}

/** Lo que ve el cajero cuando la venta offline NO quedó guardada. */
export const ERROR_VENTA_OFFLINE_NO_GUARDADA =
  "La venta NO se pudo guardar en este equipo y NO está registrada. El carrito sigue acá: reintentá el cobro. No la des por vendida hasta ver \"Venta guardada offline\".";

/**
 * Encola una venta y CONFIRMA que quedó guardada.
 *
 * El cajero ya recibió el efectivo: la pantalla solo puede decir "guardada",
 * imprimir el ticket y vaciar el carrito si la venta está de verdad en la cola.
 * `saveQueue` puede fallar —almacenamiento lleno, bloqueado o en una ventana
 * privada— y antes ese resultado se ignoraba: el ticket salía igual y la venta
 * no existía en ningún lado.
 *
 * Por eso no alcanza con que `setItem` no tire: se relee la cola y se busca la
 * venta por su `clientVentaId`.
 *
 * @returns {{ ok: true, length: number } | { ok: false }}
 */
export function enqueue(ventaData) {
  const queue = loadQueue();
  queue.push(ventaData);
  if (!saveQueue(queue)) return { ok: false };
  const guardada = loadQueue();
  const esta = guardada.some((item) => item?.clientVentaId === ventaData?.clientVentaId);
  return esta ? { ok: true, length: guardada.length } : { ok: false };
}

export function dequeueById(clientVentaId) {
  const queue = loadQueue();
  const filtered = queue.filter((item) => item.clientVentaId !== clientVentaId);
  saveQueue(filtered);
  return filtered.length;
}

export function clearQueue() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (err) {
    console.error("Error limpiando cola offline:", err);
    return false;
  }
}

export function getQueueLength() {
  return loadQueue().length;
}



