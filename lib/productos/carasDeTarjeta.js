// lib/productos/carasDeTarjeta.js
//
// LAS DOS CARAS DE LA TARJETA DE PRODUCTO.
//
//   FRENTE = cómo está decidido VENDER ese producto en la ubicación activa.
//   DORSO  = la otra referencia, para consultar. No cambia nada.
//
// ── LA REGLA QUE SOSTIENE TODO ESTO ────────────────────────────────────────
//
// **Acá no se divide ni se redondea nada.** Los importes de las dos caras salen
// de `valorEnLaEscalaDeVenta`, que es la misma función que ya usa la tarjeta y
// que por debajo llama a `precioUnitarioQueSeCobra` y `precioEnEscalaQueSeCobra`
// —las del POS—. Este módulo elige QUÉ escala pedirle a esa función para cada
// cara, y nada más.
//
// El motivo es el de siempre: una división escrita al lado de la del POS no se
// rompe el día que se escribe, se rompe el día que una de las dos cambie. Y en
// este archivo esa diferencia sería un precio en pantalla distinto del que se
// cobra en el mostrador, que es exactamente el defecto que costó la tanda del
// redondeo.
//
// ── CÓMO SE SABE SI HAY CONVERSIÓN, SIN VOLVER A DECIDIRLO ────────────────
//
// La condición "es un bulto de verdad" —unidad `pack` o `cajon` Y factor mayor
// que 1— YA vive adentro de `precioUnitarioQueSeCobra`. Escribirla otra vez acá
// sería la quinta copia de un predicado que este repo ya tuvo divergido en cuatro
// lugares.
//
// Así que no se escribe: se le PREGUNTA a las funciones. Se piden los dos
// importes —el unitario y el de la escala— y si dan distinto es porque hay
// conversión. Si dan igual, no hay bulto y no hay nada que poner en el dorso.
//
// ── LOS CASOS ESPECIALES NO INVENTAN NADA ─────────────────────────────────
//
// Kilo y pieza fija no tienen conversión pack ↔ unidad, así que su dorso no lleva
// un importe con otra escala. Lleva la MISMA línea de referencia que la tarjeta
// ya mostraba —"$130,00 cada 100 g", "1 pieza = 6 kg · $1.000,00 por kilo"—
// salida de `lineaDeEquivalencia`, sin tocarla.
//
// Eso no es inventar una conversión para tener dorso: es no perder una referencia
// que ya existía. La franja donde vivía se va, y si esa línea no se mudara,
// desaparecería del catálogo sin que nadie lo hubiera pedido.
//
// El servicio de importe variable no tiene precio: no tiene dorso.

// ── LOS IMPORTS VAN RELATIVOS, Y NO ES ESTILO ──────────────────────────────
//
// Este módulo lo consume también `scripts/sonda-tarjeta-producto.mjs`, que corre
// en node pelado y SIN el resolutor de alias. Con `@/lib/...` la sonda muere con
// `Cannot find package '@/lib'` antes de medir nada — pasó al escribirla. Es la
// misma razón por la que `escalaDeVenta.js`, que la sonda también importa, usa
// rutas relativas.
import {
  ESCALA_BULTO,
  ESCALA_IMPORTE,
  ESCALA_KG,
  ESCALA_PIEZA,
  ESCALA_UNIDAD,
  valorEnLaEscalaDeVenta,
} from "../precios/escalaDeVenta.js";
import { lineaDeEquivalencia } from "../moneda.js";

/**
 * ── EL RÓTULO DE PRESENTACIÓN ─────────────────────────────────────────────
 *
 * La presentación es inseparable del precio: "$31.200" solo no dice nada, y
 * "$31.200 · PACK X 24" sí. Por eso el rótulo viaja con el importe en vez de ser
 * una franja aparte.
 *
 * Va en mayúsculas y sin la preposición —"PACK X 24", no "por bulto"— porque
 * ahora es una ETIQUETA de presentación y no una frase: se lee de un vistazo al
 * lado del número, que es lo que hace en una lista de veinticinco.
 *
 * El factor entra en el rótulo SOLO si es mayor que 1. Un "PACK X 1" no es una
 * presentación: es un producto suelto mal declarado, y escribirlo lo afirmaría.
 */
export function presentacionDe({ escala, factor, unidad } = {}) {
  if (escala === ESCALA_IMPORTE) return "IMPORTE VARIABLE";
  if (escala === ESCALA_KG) return "KG";
  if (escala === ESCALA_PIEZA) return "PIEZA";
  if (escala === ESCALA_UNIDAD) return "UNIDAD";

  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 1) return "BULTO";
  return `${String(unidad) === "cajon" ? "CAJÓN" : "PACK"} X ${f}`;
}

/**
 * El nombre corto de una cara, para el botón que lleva hasta ella.
 *
 * "Ver unidad", "Ver pack". Sale del mismo rótulo para que el botón y la cara a
 * la que lleva no puedan decir cosas distintas.
 */
/**
 * Cómo se llama la cara de atrás, según lo que tenga adentro.
 *
 * ── POR QUÉ NO ALCANZA CON `nombreCortoDe` ────────────────────────────────
 *
 * Un dorso puede existir por dos motivos distintos: porque hay una REFERENCIA
 * —otra escala, o la línea de kilo/pieza— o porque hay IDENTIFICACIÓN, o sea los
 * códigos. En el segundo caso no hay ninguna presentación que nombrar, y llamarlo
 * "Ver referencia" es prometer una referencia que esa cara no tiene: se vio en la
 * captura, sobre un producto suelto cuyo dorso son sus dos códigos.
 *
 * `null` significa "no hay referencia": el dorso es de identificación.
 */
export function nombreDelDorso(dorso) {
  if (!dorso) return "códigos";
  if (dorso.presentacion) return nombreCortoDe(dorso.presentacion);
  // Kilo y pieza: hay una línea de referencia pero no una segunda escala con su
  // nombre.
  return "referencia";
}

export function nombreCortoDe(presentacion) {
  if (!presentacion) return "referencia";
  const p = String(presentacion);
  if (p.startsWith("PACK")) return "pack";
  if (p.startsWith("CAJÓN")) return "cajón";
  if (p === "UNIDAD") return "unidad";
  if (p === "KG") return "kilo";
  if (p === "PIEZA") return "pieza";
  if (p === "BULTO") return "bulto";
  return "referencia";
}

/**
 * Las dos caras de un producto.
 *
 * @param {string} escala             la de `escalaDeVentaDe`, ya resuelta por el llamador
 * @param {number|string|null} precio el precio que el POS cobra en esta ubicación
 * @param {boolean} redondeo100       el redondeo que manda en esta ubicación
 * @param {number|null} factor
 * @param {string|null} unidad
 * @param {number|null} pesoReferenciaKg
 * @param {boolean} esCombo
 * @returns {{frente: object, dorso: object|null}}
 *
 * `dorso` en `null` significa "esta tarjeta es de una sola cara", y la pantalla
 * tiene que poder funcionar así: es el caso de un suelto, de un servicio, y de
 * cualquier producto al que las funciones de precio no le encuentren una segunda
 * referencia.
 */
export function carasDeTarjeta({
  escala,
  precio,
  costo = null,
  redondeo100 = false,
  factor = null,
  unidad = null,
  pesoReferenciaKg = null,
  esCombo = false,
} = {}) {
  const enLaEscala = (esc, valor, redondea) =>
    valorEnLaEscalaDeVenta({
      escala: esc,
      valor,
      factor,
      unidad,
      redondeo100: redondea,
      pesoReferenciaKg,
    });

  const importeEn = (esc) => enLaEscala(esc, precio, redondeo100);

  // ── EL COSTO VA EN LA ESCALA DE SU CARA, Y CON LA MISMA FUNCIÓN ─────────
  //
  // Es la regla dura del costo en la tarjeta: un costo por bulto al lado de una
  // venta por unidad no es una comparación difícil, es una comparación AL REVÉS,
  // que hace parecer sano lo que está mal. Con dos caras el riesgo se duplica —
  // el dorso podría quedarse con el costo del frente— así que cada cara pide el
  // suyo a la misma función, con SU escala.
  //
  // Y NUNCA con el redondeo comercial: el costo no se cobra, se paga. Es el mismo
  // criterio que ya tenía la pantalla, y por eso el `false` está escrito acá y no
  // lo decide el llamador — dos criterios sobre lo mismo escondidos en una rama
  // es cómo se separan.
  const costoEn = (esc) => (costo === null || costo === undefined ? null : enLaEscala(esc, costo, false));

  const frente = {
    escala,
    importe: escala === ESCALA_IMPORTE ? null : importeEn(escala),
    costo: escala === ESCALA_IMPORTE ? null : costoEn(escala),
    presentacion: presentacionDe({ escala, factor, unidad }),
    esCombo: esCombo === true,
  };

  // ── UN SERVICIO NO TIENE PRECIO: NO TIENE SEGUNDA REFERENCIA ────────────
  if (escala === ESCALA_IMPORTE) return { frente, dorso: null };

  // ── KILO Y PIEZA: LA REFERENCIA QUE YA EXISTÍA, MUDADA ──────────────────
  //
  // `lineaDeEquivalencia` es la función que la franja usaba. Se la llama igual y
  // con los mismos argumentos; lo único que cambia es dónde se dibuja el
  // resultado. Si devuelve vacío —un kg sin precio, una pieza sin peso de
  // referencia— no hay dorso, que es la verdad.
  if (escala === ESCALA_KG || escala === ESCALA_PIEZA) {
    const detalle = lineaDeEquivalencia({
      precio,
      factor,
      unidad,
      redondeo100,
      escala,
      pesoReferenciaKg,
      // El prefijo de combo NO va acá: se dice una sola vez, al lado de la
      // presentación del frente. Repetirlo en el dorso lo diría dos veces.
      esCombo: false,
    });
    return {
      frente,
      dorso: detalle ? { detalle, importe: null, costo: null, presentacion: null } : null,
    };
  }

  // ── PACK / CAJÓN: LAS DOS ESCALAS, PREGUNTADAS Y NO DEDUCIDAS ───────────
  const unitario = importeEn(ESCALA_UNIDAD);
  const enBulto = importeEn(ESCALA_BULTO);

  // Si las dos funciones dan lo mismo, no hay bulto: la condición vive adentro de
  // ellas y acá no se vuelve a escribir. Ver el encabezado.
  const hayConversion =
    unitario !== null && enBulto !== null && Number(unitario) !== Number(enBulto);
  if (!hayConversion) return { frente, dorso: null };

  const alDorso = escala === ESCALA_BULTO ? ESCALA_UNIDAD : ESCALA_BULTO;
  return {
    frente,
    dorso: {
      escala: alDorso,
      importe: alDorso === ESCALA_UNIDAD ? unitario : enBulto,
      // El costo de la cara de atrás, en la escala de atrás. Sin esto el dorso
      // mostraría el costo del bulto al lado del precio unitario.
      costo: costoEn(alDorso),
      presentacion: presentacionDe({ escala: alDorso, factor, unidad }),
      detalle: null,
    },
  };
}
