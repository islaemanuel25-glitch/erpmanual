// lib/pedidos/lineasDelPedido.js
//
// LAS LÍNEAS DE UN PEDIDO AL DEPÓSITO, COMO LAS MUESTRA LA PANTALLA.
//
// Salieron de `app/modulos/pedidos/page.jsx` tal cual (`salePorBulto` y
// `cantidadEnPantalla`) cuando hizo falta juntar líneas repetidas: la regla de
// juntarlas tiene que usar la MISMA cuenta que la pantalla, y dos copias de esa
// cuenta se separan el día que una cambia.
//
// Puro y sin imports: se corre bajo `node --test`.

/** Si el producto se pide por bulto. Es el criterio de siempre de la pantalla. */
export const salePorBulto = (p) => p.modoEnvio === "SOLO_BULTO" && p.factorPack > 1;

/**
 * La cantidad que se muestra de una línea guardada, según su unidad.
 * - Si unidadSugerida === "BULTO" → it.sugerido ya esta en bultos, leer tal cual.
 * - Si unidadSugerida === "UNIDAD" y el producto sale por bulto (legacy):
 *   convertir a bultos para que el frontend en bultoMode funcione coherente.
 * - Si producto sale por unidad: it.sugerido en unidades, tal cual.
 * La usan el carrito y el pedido enviado: es el mismo dato.
 */
export function cantidadEnPantalla(it) {
  if (salePorBulto(it)) {
    return it.unidadSugerida === "BULTO" ? it.sugerido : Math.floor(it.sugerido / it.factorPack);
  }
  return it.sugerido;
}

/**
 * Junta las líneas del MISMO producto en una sola, con la cantidad sumada.
 *
 * ── POR QUÉ HAY LÍNEAS REPETIDAS ─────────────────────────────────────────
 *
 * `/api/pedidos/set-cantidad` busca la línea del producto y, si no está, la
 * crea; no hay nada en la base que impida dos líneas del mismo producto en un
 * pedido. Dos toques rápidos al + sobre un producto en 0 viajan juntos, los dos
 * no encuentran línea y los dos la crean: quedan dos líneas (1 y 2). Medido
 * contra la base de desarrollo (`scripts/pruebas-db/pedidosEnviarCancelar.mjs`,
 * sección 7), tres de tres.
 *
 * Esas líneas están guardadas y el depósito las ve: la pantalla NO las corrige,
 * las muestra juntas, con la suma, que es lo que el pedido lleva de verdad. Y
 * así cada producto se dibuja una sola vez: con dos tarjetas de la misma clave,
 * React dejaba una vieja viva al cambiar de lista.
 *
 * @param {object[]} lineas lo que trae la ruta (`items` del carrito o del pendiente).
 * @param {(l: object) => string|number} claveDe qué identifica al producto.
 * @returns {object[]} una por producto, en el orden en que apareció primero,
 *   con `cantidad` (la de pantalla, sumada) y `lineas` (cuántas había).
 */
export function juntarPorProducto(lineas, claveDe) {
  const porClave = new Map();
  for (const l of lineas || []) {
    const clave = claveDe(l);
    const ya = porClave.get(clave);
    if (ya) {
      ya.cantidad += cantidadEnPantalla(l);
      ya.lineas += 1;
    } else {
      porClave.set(clave, { ...l, cantidad: cantidadEnPantalla(l), lineas: 1 });
    }
  }
  return [...porClave.values()];
}

/**
 * Qué identifica a un producto en el pedido ENVIADO. La ruta no manda su id ahí
 * (`pendiente.items` trae nombre, cantidad, unidad y factor), así que se usa lo
 * que trae: el nombre más cómo se pide. Dos productos distintos con el mismo
 * nombre y la misma forma de pedirse se juntarían; con el id no pasaría, y para
 * tenerlo hay que tocar la ruta.
 */
export const claveDeLoEnviado = (l) => `${l.nombre}|${l.modoEnvio}|${l.factorPack}`;
