// QUÉ PAPEL CUMPLE CADA PALABRA DEL NOMBRE DE UN PRODUCTO.
//
// ── POR QUÉ HACE FALTA SEPARAR POR PAPEL ───────────────────────────────────
//
// Los dos rankeadores que había tratan todas las palabras igual. `parecidoNombre`
// hace Jaccard sobre los tokens y `rankearPorPalabras` suma dos puntos por
// palabra compartida. Con eso, para el texto leído "MARLBIRO 10 ROJO":
//
//   MARLBORO 10      → "10" comparte  ................ 2 puntos
//   CAMEL 10 ROJO    → "10" y "rojo" comparten  ...... 4 puntos
//
// y gana CAMEL, que es de otra marca. No es un caso raro: es lo que pasa siempre
// que el OCR le erra una letra a la marca, porque la marca deja de sumar y las
// palabras genéricas deciden.
//
// El arreglo no es subir el umbral —eso solo hace que no sugiera nada— sino que
// las palabras dejen de valer todas lo mismo. Una marca distinta no es "una
// palabra menos en común": es una contradicción.
//
// ── LOS CINCO PAPELES ──────────────────────────────────────────────────────
//
//   MARCA         quién lo fabrica. Es lo que más identifica.
//   NUMERO        cantidades y tamaños: 10, 20, 500ml, 1l, 120g, x12.
//   PRESENTACION  cómo viene: box, pack, display, ks, conv, xl.
//   VARIANTE      qué versión: rojo, blue, gold, coral, uva.
//   GENERICO      palabras de relleno: de, la, con, para.
//
// ── CÓMO SE RECONOCE LA MARCA, Y POR QUÉ ASÍ ───────────────────────────────
//
// Por POSICIÓN: es el primer token significativo. No hay ninguna lista de
// marcas y no la va a haber — una lista se desactualiza sola y convertiría un
// motor genérico en una tabla de mantenimiento.
//
// La posición funciona porque en este catálogo el nombre empieza por la marca:
// "Marlboro 20 Crafted Box", "Chester 10", "Gancia pack x24". Cuando no
// funcione, el peor caso es que la primera palabra descriptiva se compare contra
// la primera del otro lado, que sigue siendo mejor que compararlo todo mezclado.
//
// Los vocabularios de presentación y de relleno SÍ son listas, y pueden serlo
// porque son cerradas y del idioma, no del negocio: "box" y "pack" significan lo
// mismo para cualquier proveedor.

import { normalizarTexto } from "@/lib/productos/busquedaFuzzyProducto";

export const PAPEL = Object.freeze({
  MARCA: "MARCA",
  NUMERO: "NUMERO",
  PRESENTACION: "PRESENTACION",
  VARIANTE: "VARIANTE",
  GENERICO: "GENERICO",
});

/**
 * Palabras de presentación. Cerradas y del idioma, no de ningún proveedor.
 *
 * Si una presentación nueva aparece seguido, se agrega acá y vale para todos.
 * Lo que NO puede entrar es una marca ni una variante concreta.
 */
const PRESENTACION = new Set([
  "box", "pack", "packs", "display", "caja", "cajas", "cajon", "bulto", "bultos",
  "bolsa", "bolsas", "lata", "latas", "botella", "botellas", "sachet", "estuche",
  "blister", "sixpack", "unidad", "unidades", "un", "bu", "di", "kg", "ks",
  "conv", "convertible", "xl", "slim", "soft", "hard", "rigido", "flexible",
]);

/** Relleno del idioma. No identifican nada. */
const GENERICO = new Set([
  "de", "del", "la", "el", "los", "las", "con", "sin", "para", "por", "y", "a",
  "en", "al", "un", "una", "x",
]);

/** Un token que es número, o número con unidad pegada: 500ml, 1l, 120g, x12. */
const ES_NUMERO = /^(?:x)?\d+(?:[.,]\d+)?(?:ml|l|lt|lts|cc|g|gr|grs|kg|kgs|mg|un|u|cm|mm)?$/;

/**
 * ¿Este token aporta algo? Los de una sola letra no, salvo que sean número.
 *
 * Es el mismo piso que ya usaba `parecidoNombre` con sus tokens de dos letras;
 * acá baja a uno para no perder un "1 L" partido en dos.
 */
const significativo = (t) => t.length >= 2 || /^\d$/.test(t);

/** El papel de UN token. */
export function papelDeToken(token, { esPrimeroSignificativo = false } = {}) {
  const t = String(token || "");
  if (!t) return PAPEL.GENERICO;
  if (ES_NUMERO.test(t)) return PAPEL.NUMERO;
  if (PRESENTACION.has(t)) return PAPEL.PRESENTACION;
  if (GENERICO.has(t)) return PAPEL.GENERICO;
  // La marca es POSICIONAL: el primero que no fue número, presentación ni
  // relleno. Todo lo que venga después y no encaje en otro papel es variante.
  return esPrimeroSignificativo ? PAPEL.MARCA : PAPEL.VARIANTE;
}

/**
 * Descompone un nombre en sus tokens con papel.
 *
 * @returns {{ marca: string|null, numeros: string[], presentaciones: string[],
 *             variantes: string[], genericos: string[], tokens: string[] }}
 */
export function tokenizarProducto(texto) {
  const tokens = normalizarTexto(texto).split(/\s+/).filter(Boolean).filter(significativo);
  const salida = {
    marca: null,
    numeros: [],
    presentaciones: [],
    variantes: [],
    genericos: [],
    tokens,
  };

  let marcaTomada = false;
  for (const t of tokens) {
    // El candidato a marca es el primer token que NO es número, presentación ni
    // relleno. Se pregunta con la misma función para que no haya dos criterios.
    const provisional = papelDeToken(t, { esPrimeroSignificativo: !marcaTomada });
    if (provisional === PAPEL.MARCA) {
      salida.marca = t;
      marcaTomada = true;
      continue;
    }
    if (provisional === PAPEL.NUMERO) { salida.numeros.push(normalizarNumero(t)); continue; }
    if (provisional === PAPEL.PRESENTACION) { salida.presentaciones.push(t); continue; }
    if (provisional === PAPEL.GENERICO) { salida.genericos.push(t); continue; }
    salida.variantes.push(t);
  }
  return salida;
}

/**
 * Un número comparable.
 *
 * "x12" y "12" son el mismo doce, y "500ml" y "500 ml" también. Se le saca la
 * `x` de multiplicación y se deja el número con su unidad pegada, para que
 * "500ml" NO se confunda con "500g" — que es una contradicción de verdad.
 */
export function normalizarNumero(token) {
  const t = String(token || "").replace(/^x/, "").replace(",", ".");
  const m = t.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!m) return t;
  const valor = String(Number(m[1]));
  const unidad = equivalenciaUnidad(m[2]);
  return unidad ? `${valor}${unidad}` : valor;
}

/** Unidades que son la misma escrita distinto. No convierte magnitudes. */
function equivalenciaUnidad(sufijo) {
  const s = String(sufijo || "").toLowerCase();
  if (!s) return "";
  if (["l", "lt", "lts"].includes(s)) return "l";
  if (["g", "gr", "grs"].includes(s)) return "g";
  if (["kg", "kgs"].includes(s)) return "kg";
  if (["u", "un"].includes(s)) return "u";
  return s;
}
