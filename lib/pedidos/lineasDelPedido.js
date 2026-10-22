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
 * Cuántos PRODUCTOS tiene un pedido del historial, no cuántos renglones: con la
 * misma regla que `juntarPorProducto` —los renglones del mismo producto
 * cuentan uno—.
 *
 * `/api/pedidos/historial` trae `itemCount`, que cuenta RENGLONES, y en
 * `resumen` los primeros cinco renglones con su nombre, sin el id del
 * producto. Así que:
 *   · con el pedido entero en `resumen` (hasta cinco renglones), se juntan por
 *     nombre y factor del bulto —lo que `resumen` trae del producto—;
 *   · con más de cinco, la ruta no dice cuáles se repiten: va `itemCount`, que
 *     puede contar de más un pedido viejo con un producto repetido.
 * Sin el dato, `null`.
 */
export function productosDelHistorial(pedido) {
  const renglones = pedido?.itemCount;
  if (!Number.isInteger(renglones)) return null;
  const resumen = Array.isArray(pedido.resumen) ? pedido.resumen : [];
  if (resumen.length !== renglones) return renglones;
  return juntarPorProducto(resumen, (r) => `${r.nombre}|${r.factorPack}`).length;
}

/**
 * Qué identifica a un producto en el pedido ENVIADO. Desde el 2026-10-22 la
 * ruta manda su id en `pendiente.items` —para que el pedido enviado se pueda
 * seguir armando con las mismas tarjetas—, y se usa ése. Las respuestas de
 * antes no lo traían: para ésas queda el nombre más cómo se pide, con el que
 * dos productos distintos del mismo nombre y la misma forma se juntaban.
 */
export const claveDeLoEnviado = (l) =>
  l.productoLocalId != null ? `id:${l.productoLocalId}` : `${l.nombre}|${l.modoEnvio}|${l.factorPack}`;
