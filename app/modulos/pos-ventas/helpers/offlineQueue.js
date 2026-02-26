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
 *   items: Array<{ productoBaseId, nombre, precio, cantidad }>
 * }
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

export function enqueue(ventaData) {
  const queue = loadQueue();
  queue.push(ventaData);
  saveQueue(queue);
  return queue.length;
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



