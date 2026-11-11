// LOS RENGLONES DEL MISMO PRODUCTO EN LOS PAPELES DE UNA MISMA RECEPCIÓN.
//
// Vinos, 2026-11-11: el proveedor entrega con dos papeles —una factura y un
// presupuesto— y el mismo producto viene en los dos. La pantalla los muestra
// juntos en una sola fila, con el costo promediado (`juntarElMismoProducto`),
// así que lo que una persona decide sobre esa fila —revisado, en qué viene, el
// precio aceptado— vale para todos sus renglones. Se escribe en todos: si se
// escribiera en uno solo, la fila volvería a preguntar o el cierre no
// encontraría el precio aceptado en los demás.
//
// Son hermanos los renglones atados a la misma línea del pedido, de cualquier
// papel no anulado del mismo pedido, menos los que una persona sacó ("no vino").

/**
 * @param prisma   el cliente o la transacción
 * @param linea    `{ id, pedidoDetalleId, comprobante: { pedidoId } }`
 * @returns los ids de todos los renglones del producto, incluido el propio
 */
export async function hermanosDelRenglon(prisma, linea) {
  const pedidoId = linea?.comprobante?.pedidoId ?? null;
  if (linea?.pedidoDetalleId == null || pedidoId == null) return [linea.id];
  const filas = await prisma.comprobanteLinea.findMany({
    where: {
      pedidoDetalleId: linea.pedidoDetalleId,
      noVino: false,
      comprobante: { pedidoId, estado: { not: "ANULADO" } },
    },
    select: { id: true },
  });
  const ids = filas.map((f) => f.id);
  return ids.includes(linea.id) ? ids : [linea.id, ...ids];
}
