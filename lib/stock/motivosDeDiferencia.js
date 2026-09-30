// lib/stock/motivosDeDiferencia.js
//
// ── POR QUÉ LA CANTIDAD NO ES LA QUE TENÍA QUE SER ──────────────────────────
//
// El vocabulario con el que el ERP explica una diferencia de mercadería. Lo usan
// tres módulos y es UNO solo:
//
//   · la recepción de una transferencia —`TransferenciaDetalle.motivoPrincipal`—;
//   · la corrección de una línea de compra —`PedidoProveedorDetalle.motivoPrincipal`—;
//   · el ajuste manual de Stock Locales —`AuditoriaStock.motivoPrincipal`—.
//
// Antes eran dos copias —`recepcionUI.js` y `HojaCorregirLinea.jsx`— con un
// comentario pidiendo que coincidieran y nada que lo comprobara. Un reporte por
// motivo que viera "Producto dañado" en una tabla y "Dañado" en otra estaría
// contando dos cosas distintas donde hay una sola.
//
// ── LOS VALORES SON LOS QUE YA ESTÁN GUARDADOS ─────────────────────────────
//
// Se guardan tal cual, en castellano, desde antes de este archivo. Cambiar uno
// dejaría las filas viejas con un valor que ya nadie ofrece. Por eso el valor es
// canónico y el TEXTO que se muestra es aparte: la tarjeta móvil de la recepción
// decía "Roto" y compras dice "Dañado", y los dos guardan "Producto dañado".
//
// ── LO QUE UN MOTIVO NO DICE ───────────────────────────────────────────────
//
// Dice POR QUÉ, no QUÉ PASÓ CON EL STOCK. "Producto dañado" en una recepción es
// una diferencia de conteo que vuelve al origen; en un ajuste manual es una baja.
// El efecto lo dice el origen del movimiento en el Libro de Stock, no el motivo.

/** Los valores canónicos, tal como se guardan. */
export const MOTIVO_DIFERENCIA = Object.freeze({
  FALTANTE: "Faltante",
  PRODUCTO_DANADO: "Producto dañado",
  SOBRANTE: "Sobrante",
  OTRO: "Otro",
});

/** Hacia dónde se movió la cantidad respecto de la que se esperaba. */
export const DIRECCION_DIFERENCIA = Object.freeze({
  DISMINUCION: "DISMINUCION",
  AUMENTO: "AUMENTO",
});

/**
 * Qué motivos tienen sentido para cada dirección.
 *
 * Ofrecer "Faltante" para explicar que hay MÁS es pedirle a alguien que
 * clasifique un sobrante como una falta, y ese dato después se lee en un
 * reporte. El orden es el que la pantalla muestra.
 */
export const MOTIVOS_POR_DIRECCION = Object.freeze({
  [DIRECCION_DIFERENCIA.DISMINUCION]: Object.freeze([
    MOTIVO_DIFERENCIA.FALTANTE,
    MOTIVO_DIFERENCIA.PRODUCTO_DANADO,
    MOTIVO_DIFERENCIA.OTRO,
  ]),
  [DIRECCION_DIFERENCIA.AUMENTO]: Object.freeze([
    MOTIVO_DIFERENCIA.SOBRANTE,
    MOTIVO_DIFERENCIA.OTRO,
  ]),
});

/** El texto largo de cada motivo, el de los selectores de escritorio. */
export const ETIQUETA_MOTIVO = Object.freeze({
  [MOTIVO_DIFERENCIA.FALTANTE]: "Faltante",
  [MOTIVO_DIFERENCIA.PRODUCTO_DANADO]: "Producto dañado",
  [MOTIVO_DIFERENCIA.SOBRANTE]: "Sobrante",
  [MOTIVO_DIFERENCIA.OTRO]: "Otro (especificar)",
});

const VALORES = new Set(Object.values(MOTIVO_DIFERENCIA));

/** ¿Es uno de los valores canónicos? */
export function esMotivoDeDiferencia(valor) {
  return VALORES.has(valor);
}

/**
 * La dirección de una diferencia, o null si no la hay.
 *
 * @param {number} esperada  la cantidad contra la que se compara
 * @param {number} real      la que hay, o la que llegó
 */
export function direccionDeDiferencia(esperada, real) {
  // `Number(null)` y `Number("")` dan 0: una cantidad que no está no es un cero.
  if (esperada == null || real == null || esperada === "" || real === "") return null;
  const a = Number(esperada);
  const b = Number(real);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return b < a ? DIRECCION_DIFERENCIA.DISMINUCION : DIRECCION_DIFERENCIA.AUMENTO;
}

/** Los valores que se ofrecen para una dirección; lista vacía si no hay. */
export function motivosParaDireccion(direccion) {
  return MOTIVOS_POR_DIRECCION[direccion] ?? [];
}

/** Las opciones `{ value, label }` de una dirección, con el texto largo. */
export function opcionesParaDireccion(direccion) {
  return motivosParaDireccion(direccion).map((value) => ({ value, label: ETIQUETA_MOTIVO[value] }));
}

/** ¿Este motivo explica una diferencia en esta dirección? */
export function motivoPermitidoPara(direccion, motivo) {
  return motivosParaDireccion(direccion).includes(motivo);
}

/** Solo "Otro" necesita que alguien cuente qué pasó: los demás ya lo dicen. */
export function motivoExigeDetalle(motivo) {
  return motivo === MOTIVO_DIFERENCIA.OTRO;
}
