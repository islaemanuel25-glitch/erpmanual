// lib/pedidos/estados.js
//
// LOS ESTADOS DEL PEDIDO (`PosTransferencia`) Y EL FILTRO QUE DEJA AFUERA A LOS
// CANCELADOS.
//
// El campo `estado` es un String. El camino de siempre es Borrador (o
// Preparando) → Solicitado → Enviando → Enviado. Hasta la Tanda 9A, cancelar un
// pedido Solicitado BORRABA la fila con sus líneas; desde entonces la MARCA:
// estado "Cancelado", con `canceladoAt` y `canceladoPorUserId`
// (`app/api/pos-transferencias/cancelar/route.js`). Lo decidió el dueño el
// 2026-10-11, para que quede rastro y se pueda saber qué está pendiente.
//
// ── POR QUÉ UN FILTRO ÚNICO ───────────────────────────────────────────────
//
// Un pedido cancelado antes NO EXISTÍA. Toda lectura que lo encontraba por id
// daba 404 y todo listado o conteo no lo veía. Para que eso siga igual, cada
// lectura de `PosTransferencia` —y cada lectura de sus líneas que parte de un
// pedido— pasa su `where` por `sinCancelados`. Es UNA función y no un
// `estado: { not: "Cancelado" }` escrito en cada ruta, por la regla 1 de
// CLAUDE.md: el día que cambie qué cuenta como cancelado, cambia acá.
//
// Las lecturas que NO lo usan son pocas y cada una tiene su motivo escrito en
// `lib/pedidos/sinCancelados.test.mjs`, que recorre el repo y se pone rojo si
// aparece una lectura nueva sin el filtro y sin motivo.
//
// `sinCancelados` agrega la condición en `AND` y deja el resto del `where`
// donde estaba: así sirve también en `findUnique`, que necesita el `id` en el
// primer nivel, y respeta un `AND` que ya viniera.

export const ESTADO_PEDIDO = Object.freeze({
  BORRADOR: "Borrador",
  PREPARANDO: "Preparando",
  SOLICITADO: "Solicitado",
  ENVIANDO: "Enviando",
  ENVIADO: "Enviado",
  CANCELADO: "Cancelado",
});

const NO_CANCELADO = Object.freeze({ estado: Object.freeze({ not: ESTADO_PEDIDO.CANCELADO }) });

/**
 * El mismo `where`, sin los pedidos cancelados.
 *
 * @param {object} [where] un `where` de `PosTransferencia` (o el filtro de la
 *   relación `pos` desde una línea).
 */
export function sinCancelados(where = {}) {
  const previos = where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND];
  return { ...where, AND: [...previos, NO_CANCELADO] };
}
