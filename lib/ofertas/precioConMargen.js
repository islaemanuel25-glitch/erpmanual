// lib/ofertas/precioConMargen.js
//
// LOS DOS CAMPOS QUE SE SINCRONIZAN, Y EL REDONDEO QUE MANDA SOBRE LOS DOS.
//
// ── LA CUENTA ES MARGEN SOBRE EL COSTO ───────────────────────────────────
//
//   precio = costo × (1 + % / 100)
//   %      = (precio / costo − 1) × 100
//
// NO es "margen sobre la venta", que sería `(precio − costo) / precio`. Son dos
// números distintos y el mismo producto da 30 % en uno y 23 % en el otro. Este
// módulo usa SOBRE EL COSTO en los dos sentidos, así que escribir un % y leer el
// precio que sale, y después escribir ese precio, devuelve el mismo %.
//
// Ojo, porque en este mismo repo convive la otra: `margenOferta` en `precio.js`
// calcula sobre el PRECIO —`(precio − costo) / precio`— y se usa para la línea
// informativa "te queda X % de margen". No se unificaron a propósito: son dos
// preguntas distintas y unificarlas cambiaría el número que ya se muestra.
//
// ── EL % QUE SE MUESTRA ES EL DE DESPUÉS DEL REDONDEO ────────────────────
//
// Si se tipea 18 y el redondeo deja el precio en un valor que da 16, el campo
// dice 16. Mostrar el tipeado sería mostrar una intención en el lugar donde va
// un hecho: el margen que va a quedar es el segundo, y es el que decide si la
// oferta conviene.
//
// ── EL REDONDEO SALE DE LA REGLA DEL POS, NO DE UNA NUEVA ────────────────
//
// `redondear100` es la misma función con la que el POS redondea el precio
// unitario. No se reescribe acá: dos reglas de redondeo es cómo empezó el
// problema de escala de la tanda anterior.

import { redondear100 } from "@/lib/precios/redondeo";
import { round2Pct } from "./precio";

/** Dos decimales, que es lo que la columna guarda. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Un número de un campo de texto. Devuelve `null` si no hay nada escrito. */
export function numeroDeCampo(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().replace(",", ".");
  if (texto === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/** `precio = costo × (1 + % / 100)`. */
export function precioDesdeMargen(costo, margenPct) {
  const c = Number(costo);
  const m = Number(margenPct);
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(m)) return null;
  return round2(c * (1 + m / 100));
}

/** `% = (precio / costo − 1) × 100`. */
export function margenDesdePrecio(costo, precio) {
  const c = Number(costo);
  const p = Number(precio);
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(p)) return null;
  return round2Pct((p / c - 1) * 100);
}

/**
 * EL MARGEN QUE EL PRODUCTO TIENE HOY, con el que arrancan los dos campos.
 *
 * ── POR QUÉ NO ARRANCAN VACÍOS ───────────────────────────────────────────
 *
 * Para que se vea DE DÓNDE SE PARTE. Un campo vacío obliga a acordarse del
 * precio normal y a hacer la cuenta de cabeza; arrancando en el margen real, lo
 * que se mira al bajar el número es cuánto se está resignando.
 *
 * Y ese estado inicial NO ES UNA OFERTA: es el precio normal escrito en dos
 * campos. Por eso `esOferta` sale en `false` y el botón de publicar arranca
 * apagado — se enciende recién cuando el precio baja del normal.
 */
export function estadoInicial({ precioNormal, costo } = {}) {
  const p = Number(precioNormal);
  const c = Number(costo);
  const hayCosto = Number.isFinite(c) && c > 0;
  return {
    // SIN COSTO NO HAY MARGEN POSIBLE. No se devuelve 0 ni 100: se devuelve
    // `null`, y la pantalla no dibuja el campo. Un 0 es un valor y acá es un
    // dato que falta, y además dividir por cero daría infinito.
    margen: hayCosto ? margenDesdePrecio(c, p) : null,
    precio: Number.isFinite(p) && p > 0 ? round2(p) : null,
    hayCosto,
  };
}

/**
 * RESUELVE EL BLOQUE ENTERO a partir de qué campo se tocó.
 *
 * `origen` es "MARGEN" o "PRECIO": el campo que la persona está escribiendo.
 * Ese campo NO se reescribe —se devuelve tal cual llegó— porque reescribirlo
 * debajo del dedo es lo que hace que no se pueda tipear "12" sin que salte a
 * "1" y después a "12" con el cursor movido.
 *
 * El OTRO campo sí se recalcula, y con el precio YA REDONDEADO si el redondeo
 * está encendido: el % que se muestra tiene que ser el real.
 *
 * Devuelve `{ margen, precio, precioSinRedondear, redondeoCambioAlgo, ... }`.
 */
export function resolverBloque({
  origen = "PRECIO",
  margen,
  precio,
  costo,
  precioNormal,
  redondear = true,
} = {}) {
  const c = Number(costo);
  const hayCosto = Number.isFinite(c) && c > 0;
  const normal = Number(precioNormal);

  const mEscrito = numeroDeCampo(margen);
  const pEscrito = numeroDeCampo(precio);

  // ── EL PRECIO EXACTO, ANTES DE REDONDEAR ────────────────────────────────
  let exacto = null;
  if (origen === "MARGEN") {
    // Sin costo no se puede ir de % a precio: no hay de qué calcularlo.
    exacto = hayCosto && mEscrito !== null ? precioDesdeMargen(c, mEscrito) : null;
  } else {
    exacto = pEscrito;
  }

  if (exacto === null || !(exacto > 0)) {
    return {
      margen: origen === "MARGEN" ? margen : hayCosto ? null : null,
      precio: origen === "PRECIO" ? precio : null,
      precioFinal: null,
      precioSinRedondear: null,
      redondeoCambioAlgo: false,
      hayCosto,
      esOferta: false,
    };
  }

  const redondeado = redondear ? redondear100(exacto) : round2(exacto);
  const cambioAlgo = redondear && round2(redondeado) !== round2(exacto);

  // El margen REAL, calculado sobre el precio que se va a cobrar.
  const margenReal = hayCosto ? margenDesdePrecio(c, redondeado) : null;

  return {
    // El campo tocado vuelve tal cual; el otro, recalculado.
    margen: origen === "MARGEN" ? margen : margenReal,
    precio: origen === "PRECIO" ? precio : redondeado,
    precioFinal: redondeado,
    precioSinRedondear: round2(exacto),
    redondeoCambioAlgo: cambioAlgo,
    margenReal,
    hayCosto,
    // Es oferta solo si baja del precio normal. El estado inicial —precio normal
    // en los dos campos— cae acá en `false`, que es lo que mantiene apagado el
    // botón de publicar.
    esOferta: Number.isFinite(normal) && normal > 0 && redondeado < normal,
  };
}

/** "Redondeado de $ 3.343,33 · el margen real queda en 16 %" */
export function textoDeRedondeo(bloque, money) {
  if (!bloque?.redondeoCambioAlgo) return "";
  const importe = money ? money(bloque.precioSinRedondear) : bloque.precioSinRedondear;
  if (bloque.margenReal == null) return `Redondeado de ${importe}`;
  return `Redondeado de ${importe} · el margen real queda en ${bloque.margenReal} %`;
}

/**
 * ¿El campo de margen tiene un valor que no se puede aceptar?
 *
 * Un margen NEGATIVO se frena EN EL CAMPO —es la única de las tres
 * validaciones que bloquea— porque no es una decisión comercial sino un tipeo:
 * nadie pone "-20" queriendo vender bajo costo, para eso escribe el precio.
 * Vender bajo costo sigue siendo legítimo y se hace escribiendo el precio.
 *
 * ── Y POR ESO MIRA QUIÉN LO ESCRIBIÓ ─────────────────────────────────────
 *
 * Los dos campos están sincronizados, así que escribir un precio por debajo del
 * costo DEJA UN MARGEN NEGATIVO en el otro campo sin que nadie lo haya tipeado.
 * Ese caso es legítimo —es el líder de pérdida, que avisa y no bloquea— y si
 * esta función no mirara el origen, frenaría exactamente la venta bajo costo
 * que la pantalla dice permitir tres bloques más arriba.
 *
 * `origen` es el campo que se está tocando. Con "PRECIO" el margen es un
 * resultado, no una instrucción, y no hay nada que frenar.
 */
export function margenInvalido(margen, origen = "MARGEN") {
  if (origen !== "MARGEN") return null;
  const m = numeroDeCampo(margen);
  if (m === null) return null;
  if (m < 0) return "El margen no puede ser negativo. Si querés vender bajo costo, escribí el precio.";
  return null;
}
