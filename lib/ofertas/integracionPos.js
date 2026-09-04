// lib/ofertas/integracionPos.js
//
// ENCLAVAMIENTO DE PUBLICACIÓN — LEVANTADO EL 2026-09-04.
//
// ── QUÉ IMPEDÍA, Y POR QUÉ ──────────────────────────────────────────────────
//
// Mientras el POS calculaba su total como `subtotal − descuentos`, sin mirar
// ofertas ni recargos, publicar una oferta habría dejado dos números distintos
// para la misma venta:
//
//   · Con UN solo medio, el backend armaba el tender con SU total. La venta
//     entraba por $8.100 y la pantalla le había pedido $9.000 al cliente. Nadie
//     se enteraba hasta el arqueo, y ahí faltaba plata sin explicación.
//   · Con pago dividido, los importes los manda el POS y no sumaban el total del
//     backend: la venta se RECHAZABA en la caja, con gente esperando.
//
// El primero era peor que el segundo porque era silencioso.
//
// ── QUÉ CAMBIÓ ──────────────────────────────────────────────────────────────
//
// Las tres condiciones que este archivo exigía para levantarse:
//
//   1. El POS calcula su total con `calcularVentaComercial` —la MISMA función
//      que usa `pos-ventas/crear`—, a través de `lib/ofertas/previewPos.js`, que
//      no hace ninguna cuenta propia: solo llama al motor una vez por medio.
//      Las ofertas salen de `pos-ventas/buscar-producto` y los recargos de
//      `/api/recargos-pago`, que acepta `pos.usar` justamente para esto.
//
//   2. La pantalla muestra el importe de CADA medio antes de tocarlo, y en el
//      panel de "Dividir pago" recalcula el total cuando cambia el conjunto de
//      medios, con el aviso de `avisoPagoCombinado`.
//
//   3. Y se agregó una tercera cosa que no estaba en la lista original y que es
//      la que de verdad cierra el agujero: el POS manda `totalPantalla` y el
//      servidor RECHAZA la venta si su cuenta da otra cosa
//      (`TOTAL_DESACTUALIZADO`). Las dos condiciones de arriba hacen que los
//      números coincidan; ésta hace que, el día que no coincidan, se vea.
//
// ── LO QUE NO SE VERIFICÓ, Y HAY QUE SABERLO ────────────────────────────────
//
// La pantalla NO se abrió con datos reales. La máquina donde se trabajó es el
// VPS de producción: no hay base de desarrollo, el Node del sistema es 18 y la
// única base es la que está cobrando. Abrir el POS ahí habría sido operar sobre
// producción, que es exactamente lo que no se puede hacer.
//
// Lo que sí se ejerció, todo en el job de CI contra un PostgreSQL efímero
// (.github/workflows/verificacion.yml):
//
//   · el camino completo buscar producto → carrito → preview → crear venta →
//     persistir → líneas del ticket, comprobando que NO haya dos totales
//     distintos (scripts/pruebas-db/ofertas.mjs);
//   · el render REAL del panel de cobro y del carrito con una oferta cargada,
//     ejecutando el JSX y leyendo los importes dibujados
//     (components/pos-ventas/ofertaEnPantallaRender.test.mjs).
//
// Eso cubre la aritmética y el cableado. NO cubre cómo se ve en la Sunmi ni si
// los cuatro importes entran en el botón a 360 px. Ese es el riesgo que queda, y
// la primera oferta que se publique conviene cobrarla mirando la pantalla.

/** ¿El POS ya sabe cobrar con ofertas y recargos? Ver el comentario de arriba. */
export const POS_APLICA_CONDICION_COMERCIAL = true;

/** Motivo, en el idioma de quien lo va a leer en la pantalla. */
export const MOTIVO_PUBLICACION_BLOQUEADA =
  "Todavía no se puede publicar una oferta: la pantalla de cobro del POS no muestra " +
  "el precio promocional, así que la venta se cobraría por un importe distinto al que " +
  "ve el cliente. La oferta queda guardada como borrador y se publica sola en cuanto " +
  "esa parte esté lista.";

/**
 * ¿Se puede publicar? Devuelve el motivo cuando no, para que la ruta no tenga
 * que saber por qué y el texto viva en un solo lugar.
 *
 * La función se conserva con el enclave levantado a propósito: es el punto por
 * el que se vuelve a bajar si aparece un defecto en el camino de cobro, sin
 * tener que reescribir la ruta de publicación ni su mensaje.
 *
 * @returns {{puede:true} | {puede:false, motivo:string}}
 */
export function puedePublicarOfertas() {
  if (POS_APLICA_CONDICION_COMERCIAL) return { puede: true };
  return { puede: false, motivo: MOTIVO_PUBLICACION_BLOQUEADA };
}
