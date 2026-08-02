// lib/pos-ventas/payloadVenta.js
//
// Helper PURO y CANÓNICO para mapear un ítem del carrito del POS al ítem que se
// envía a /api/pos-ventas/crear. Existe para que TODOS los caminos de cobro
// (online y offline) armen el ítem con la MISMA forma y no diverjan.
//
// Bug que evita: el path online omitía `importeBaseServicio`, por lo que el
// backend (que clasifica servicio por la modalidad del producto y valida el
// importe) recibía `undefined` y rechazaba con "Ingresá el importe del servicio."
// aunque el importe estuviera en el carrito.
//
// Contrato del backend (crear/route.js):
//   · esServicio lo decide el backend por la modalidad del producto.
//   · Para servicios necesita `importeBaseServicio` (número entero > 0); recalcula
//     precio/recargo/costo/ganancia server-side.
//   · Para NORMAL rechaza si viene `importeBaseServicio != null` → por eso los
//     ítems no-servicio mandan `importeBaseServicio: null`.

/**
 * Mapea un ítem del carrito al payload de creación de venta (backend-bound).
 * @param {object} item — ítem del carrito (state.carrito[i])
 * @returns {object} ítem para el body de /api/pos-ventas/crear
 */
export function itemCrearPayload(item) {
  const esServicio = item?.esServicio === true;
  return {
    productoBaseId: item?.productoBaseId,
    nombre: item?.nombre,
    precio: item?.precio,
    cantidad: item?.cantidad,
    precioCosto: item?.precioCosto ?? null,
    modoVentaLinea: item?.modoVentaLinea ?? "NORMAL",
    listaPrecioId: item?.listaPrecioId ?? null,
    tipoPrecioAplicado: item?.tipoPrecioAplicado ?? "PRECIO_VENTA",
    margenAplicado: item?.margenAplicado ?? null,
    // Servicio de importe variable: el backend recalcula todo desde importeBaseServicio.
    // NORMAL/servicio de precio fijo → null (el backend rechaza importe en no-servicios).
    esServicio,
    importeBaseServicio: esServicio ? item?.importeBaseServicio : null,
    // Línea de PESO cargada POR IMPORTE: el total lo fija el cajero y el peso es
    // el derivado. El backend revalida (producto por peso, importe > 0) y
    // recalcula el peso por su cuenta; nunca confía en este número a ciegas.
    // Null en servicios y en todo lo que no sea peso cargado por precio.
    subtotalFijado: esServicio ? null : (item?.subtotalFijado ?? null),
  };
}

/** Mapea la lista completa del carrito a los ítems del payload. */
export function itemsCrearPayload(carrito) {
  return (Array.isArray(carrito) ? carrito : []).map(itemCrearPayload);
}
