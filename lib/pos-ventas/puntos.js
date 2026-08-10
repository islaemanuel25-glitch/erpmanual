// lib/pos-ventas/puntos.js
//
// EL DESCUENTO POR PUNTOS LO CALCULA EL SERVIDOR.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// Era el ÚNICO importe del cobro que se aceptaba tal como lo mandaba el cliente.
// El servidor validaba que `puntosCanje` no excediera el saldo —dos veces, una
// antes y otra dentro de la transacción— pero el peso del descuento entraba
// crudo del body: `Number(descuentoPorPuntosBody) || 0`.
//
// O sea que se controlaba CUÁNTOS puntos se gastaban y no CUÁNTA plata valían.
// El único tope era no exceder la mercadería elegible, así que un canje de 1
// punto podía descontar el subtotal entero.
//
// Todo el resto del cobro ya era server-authoritative: los pagos se consolidan y
// se exige Σ == total exacto en centavos, el precio sale de la lista que resuelve
// el servidor, el peso de una línea por importe se recalcula. Esto era el agujero
// que quedaba.
//
// ── QUÉ VALOR DE pesoPorPunto MANDA ─────────────────────────────────────────
//
// `pesoPorPunto` vive en `PuntosConfigLocal.redencionJson` y se puede editar en
// cualquier momento desde la pantalla de fidelidad. Entre que el cajero abre el
// modal de canje y aprieta cobrar, alguien puede haberlo cambiado.
//
// MANDA EL DEL SERVIDOR AL MOMENTO DEL COBRO. No el que el navegador tenía
// cargado. Razones, en orden:
//
//   · es el que está vigente cuando se aplica el descuento, que es lo que
//     importa: la venta se cobra ahora, no cuando se abrió la pantalla;
//   · el valor del cliente puede venir de una pestaña abierta hace horas;
//   · si el cliente manda otra cosa, es o una pestaña vieja o una manipulación,
//     y las dos se resuelven igual: se rechaza y se vuelve a abrir el canje.
//
// Se RECHAZA en vez de corregir en silencio. Corregir cambiaría el total que el
// cajero le está por cobrar a una persona que está enfrente, después de que él ya
// lo leyó en pantalla. Un rechazo con un mensaje claro es honesto; un total que
// cambia solo, no.
//
// ── LA TOLERANCIA ───────────────────────────────────────────────────────────
//
// Se compara en centavos enteros, con 1 centavo de margen. `pts * pesoPorPunto`
// en coma flotante puede dar 0.1 + 0.2 = 0.30000000000000004, y rechazar una
// venta legítima por ruido binario sería peor que el problema que se arregla.
//
// Módulo puro: sin Prisma, sin next/server.

/** Margen en centavos. Cubre el ruido de coma flotante, nada más. */
export const TOLERANCIA_CENTAVOS = 1;

const aCentavos = (n) => Math.round((Number(n) || 0) * 100);

/**
 * Cuánta plata descuentan N puntos.
 *
 * Es la fórmula, en un solo lugar. El front la usa para mostrar y el servidor
 * para decidir; que sea la misma función es lo que hace que coincidan.
 *
 * Devuelve 0 ante cualquier entrada inválida —negativa, no numérica, sin
 * configuración— en vez de propagar un NaN al total.
 */
export function descuentoPorPuntos(puntos, pesoPorPunto) {
  const pts = Number(puntos);
  const peso = Number(pesoPorPunto);
  if (!Number.isFinite(pts) || !Number.isFinite(peso)) return 0;
  if (pts <= 0 || peso <= 0) return 0;
  return Math.round(pts * peso * 100) / 100;
}

/**
 * ¿El descuento que mandó el cliente es el que corresponde?
 *
 * @returns {{ok: boolean, esperado: number, recibido: number}}
 */
export function verificarDescuentoPuntos({ puntosCanje, pesoPorPunto, descuentoRecibido }) {
  const esperado = descuentoPorPuntos(puntosCanje, pesoPorPunto);
  const recibido = Number(descuentoRecibido) || 0;
  const ok = Math.abs(aCentavos(esperado) - aCentavos(recibido)) <= TOLERANCIA_CENTAVOS;
  return { ok, esperado, recibido };
}

/**
 * El texto que ve el cajero cuando no coincide.
 *
 * No dice "error de validación": dice qué pasó y qué hacer. El cajero tiene una
 * persona esperando enfrente y necesita saber si puede seguir.
 */
export function textoDescuentoPuntosInvalido({ esperado, recibido }) {
  return (
    `El descuento por puntos no coincide con la configuración vigente: ` +
    `la pantalla calculó $${recibido.toFixed(2)} y corresponden $${esperado.toFixed(2)}. ` +
    `Puede que se haya cambiado la equivalencia de puntos mientras armabas la venta. ` +
    `Quitá el canje y volvé a aplicarlo para tomar el valor actual.`
  );
}
