// lib/ofertas/integracionPos.js
//
// ENCLAVAMIENTO: HASTA QUE EL POS SEPA MOSTRAR EL PRECIO DE OFERTA, NO SE PUEDE
// PUBLICAR UNA.
//
// ── QUÉ PASARÍA SIN ESTO ────────────────────────────────────────────────────
//
// El backend ya resuelve la oferta server-side y cobra el precio promocional.
// El POS, en cambio, todavía calcula su total como `subtotal − descuentos`, sin
// mirar ofertas ni recargos. Con una oferta publicada quedarían dos números
// distintos para la misma venta, y se rompe distinto según cómo se cobre:
//
//   · Con UN solo medio, el backend arma el tender con SU total. La venta entra
//     por $900 y la pantalla le pidió $1.000 al cliente. Nadie se entera hasta
//     el arqueo, y ahí falta plata en el cajón sin explicación.
//   · Con pago dividido, los importes los manda el POS y no suman el total del
//     backend: la venta se RECHAZA en la caja, con gente esperando.
//
// El primero es peor que el segundo porque es silencioso.
//
// ── POR QUÉ NO SE ARREGLÓ EN ESTA TANDA ─────────────────────────────────────
//
// Porque no es enchufar el motor en la pantalla: con ofertas y recargos, el
// total DEJA DE SER UN NÚMERO y pasa a ser uno por medio de pago. El mismo
// carrito vale $900 en efectivo y $1.050 con débito. Eso obliga a decidir cómo
// se dibuja —¿el carrito muestra los dos precios?, ¿el precio de la línea cambia
// al elegir el medio?, ¿qué imprime el ticket?— y esa decisión es de Emanuel, no
// del código. Además toca `FormaPago`, `CarritoVenta`, el modal de efectivo, la
// cola offline y el ticket, que son el camino por donde entra la plata.
//
// Y no había forma de verificarlo: en la máquina donde se trabajó no hay
// node_modules, el Node del sistema es 18, no hay servidor de desarrollo y la
// única base es la de producción. Un cambio a la pantalla de cobro sin poder
// abrirla es exactamente lo que la regla 9 dice que no se empieza.
//
// ── CÓMO SE LEVANTA ─────────────────────────────────────────────────────────
//
// Se pone en `true` cuando las tres cosas sean ciertas, no antes:
//
//   1. El POS calcula su total con `calcularVentaComercial` —la MISMA función
//      que usa `pos-ventas/crear`—, alimentada con las ofertas que ya devuelve
//      `pos-ventas/buscar-producto` y con los recargos del local.
//   2. La pantalla muestra el precio que corresponde al medio elegido, y avisa
//      antes de confirmar cuando el pago combinado deja una oferta afuera
//      (el texto ya está escrito: `avisoPagoCombinado`).
//   3. Se abrió el POS con datos reales y se cobró una venta de cada caso:
//      efectivo con oferta, débito sin oferta, y pago mixto.
//
// Mientras tanto TODO lo demás del módulo funciona: se pueden crear ofertas,
// cargarles productos, revisar costos, renovarlas y archivarlas. Lo único que no
// se puede es ponerlas a cobrar.

/** ¿El POS ya sabe cobrar con ofertas y recargos? Ver el comentario de arriba. */
export const POS_APLICA_CONDICION_COMERCIAL = false;

/** Motivo, en el idioma de quien lo va a leer en la pantalla. */
export const MOTIVO_PUBLICACION_BLOQUEADA =
  "Todavía no se puede publicar una oferta: la pantalla de cobro del POS no muestra " +
  "el precio promocional, así que la venta se cobraría por un importe distinto al que " +
  "ve el cliente. La oferta queda guardada como borrador y se publica sola en cuanto " +
  "esa parte esté lista.";

/**
 * ¿Se puede publicar? Devuelve el motivo cuando no, para que la ruta no tenga
 * que saber por qué y el texto viva en un solo lugar.
 * @returns {{puede:true} | {puede:false, motivo:string}}
 */
export function puedePublicarOfertas() {
  if (POS_APLICA_CONDICION_COMERCIAL) return { puede: true };
  return { puede: false, motivo: MOTIVO_PUBLICACION_BLOQUEADA };
}
