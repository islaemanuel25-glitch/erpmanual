// lib/pos-ventas/ticketOffline.js
//
// El nombre del cliente en el ticket de una venta guardada sin conexión.
//
// `guardarVentaPendiente` arma el ticket con el cliente como OBJETO —nombre,
// documento, teléfono, dirección— y el modal lo dibujaba como texto: React
// explota con un objeto como hijo, así que la venta quedaba guardada pero el
// ticket no se veía; y al imprimir salía "[object Object]". Tickets viejos
// guardados con el cliente como texto siguen andando.

/** El nombre a mostrar, o null si no hay cliente o es consumidor final. */
export function nombreClienteDeTicket(cliente) {
  const nombre = typeof cliente === "string" ? cliente : cliente?.nombre;
  if (typeof nombre !== "string") return null;
  const limpio = nombre.trim();
  if (!limpio || limpio === "Consumidor Final") return null;
  return limpio;
}
