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
 * Medidas y relleno de factura que no son número ni están en los vocabularios
 * de arriba: "9 UNID.", "X 6 UDS", "500 GRS".
 */
const RELLENO_DE_FACTURA = new Set([
  "unid", "unids", "und", "uds", "uni", "unidad", "unidades", "lts", "grs", "kgs", "mts",
]);

/**
 * LAS PALABRAS QUE IDENTIFICAN UN PRODUCTO: solo letras, tres o más, y que no
 * sean medida ni relleno.
 *
 * "PRITTY LIMON 1000 X 9 UNID." → ["pritty", "limon"]. Es lo único con lo que
 * `rankearPorPalabras` deja entrar a un candidato.
 *
 * Las de presentación —box, pack, conv— SÍ cuentan: son palabras del papel y,
 * sacándolas, "N.FORJADO 20 BOX RED" empataba con "Solmar 20 red común" en vez
 * de quedarse con "Nivaldo 20 Forjado Box".
 */
export function palabrasSignificativas(texto) {
  return normalizarTexto(texto)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && /^[a-z]+$/.test(t) && !RELLENO_DE_FACTURA.has(t) && !GENERICO.has(t));
}

/** Cuánto vale cada unidad en la base de su magnitud: mililitros o gramos. */
const A_LA_BASE = Object.freeze({
  ml: [1, "ml"], cc: [1, "ml"], l: [1000, "ml"], lt: [1000, "ml"], lts: [1000, "ml"],
  g: [1, "g"], gr: [1, "g"], grs: [1, "g"], kg: [1000, "g"], kgs: [1000, "g"],
});

/**
 * LAS MEDIDAS DE UN TEXTO, COMPARABLES ENTRE SÍ.
 *
 * Una por número, y cada una es el conjunto de formas en que se puede escribir:
 * "1L" → {1000ml}; "1000CC" → {1000ml}; "1.5L" → {1500ml}; "2KG" → {2000g}. Un
 * número pelado no dice la unidad, así que vale como él mismo, como mililitros
 * o como gramos: "1000" → {1000, 1000ml, 1000g}, y por eso "PRITTY LIMON 1000"
 * coincide con PRITTY 1L. Dos medidas coinciden si comparten alguna forma.
 *
 * Lee el texto CRUDO y no el normalizado, porque `normalizarTexto` parte
 * "1.5L" en "1" y "5l". A diferencia de `normalizarNumero`, sí convierte
 * magnitudes: se usa solo para desempatar, nunca para decidir.
 */
export function medidasDelTexto(texto) {
  const salida = [];
  // La `x` puede venir pegada detrás —"473MLX6"—; adelante, nada que sea otro
  // número, para no leer "5L" adentro de "1.5L".
  //
  // Y LAS CANTIDADES NO SON MEDIDAS: un número detrás de una `x` suelta —"X 6",
  // "X6"— o delante de "UNI"/"UNID" cuenta unidades del bulto. Leído como medida,
  // el "X 6 UNI" de "PRITTY LIMON 2250 CC X 6 UNI" coincidía con el "X6" de
  // PRITTY 500ML X6 y lo ponía a la par de PRITTY 2.25L.
  const patron =
    /(?<![\d.,])(?<!(?:^|[^a-z])x\s*)(\d+(?:[.,]\d+)?)(?!\s*(?:u|un|uni|unid|unids|unidad|unidades|uds|und)(?![a-z]))\s*(ml|cc|lts|lt|l|kgs|kg|grs|gr|g)?(?![a-wyz0-9])/gi;
  for (const [, numero, unidad] of String(texto ?? "").matchAll(patron)) {
    const valor = Number(numero.replace(",", "."));
    if (!Number.isFinite(valor)) continue;
    const enBase = A_LA_BASE[String(unidad ?? "").toLowerCase()];
    const redondo = (n) => Math.round(n * 1000) / 1000;
    salida.push(
      enBase
        ? new Set([`${redondo(valor * enBase[0])}${enBase[1]}`])
        : new Set([`${redondo(valor)}`, `${redondo(valor)}ml`, `${redondo(valor)}g`])
    );
  }
  return salida;
}

/**
 * CÓMO SE PARECE LA MEDIDA DE UN NOMBRE A LA DEL PAPEL: 0 equivalente, 1 sin
 * medida, 2 distinta. Si el papel no trae medida no hay con qué comparar y
 * todos valen 1.
 */
function claseDeMedida(delPapel, delNombre) {
  if (!delPapel.length || !delNombre.length) return 1;
  const claves = new Set(delNombre.flatMap((m) => [...m]));
  return delPapel.some((m) => [...m].some((clave) => claves.has(clave))) ? 0 : 2;
}

/**
 * RANKEA POR PALABRAS SUELTAS, no por la frase entera.
 *
 * ── POR QUÉ HIZO FALTA ─────────────────────────────────────────────────────
 *
 * `rankearLiteral` compara la CONSULTA COMPLETA contra el nombre: igual,
 * empieza con, alguna palabra empieza con, o contiene. Sirve cuando quien
 * escribe teclea un pedazo del nombre.
 *
 * No sirve para conciliar una factura, donde los dos textos son NOMBRES
 * DISTINTOS DEL MISMO PRODUCTO. "CHESTERFIELD 10 CONV" contra "Chester 10" no
 * es igual, no empieza igual, ninguna palabra del nombre empieza con la frase
 * entera, y no la contiene. Literal: cero.
 *
 * ── CÓMO PUNTÚA ───────────────────────────────────────────────────────────
 *
 * SOLO con palabras significativas (`palabrasSignificativas`). Cada una de la
 * consulta que aparece ENTERA en el nombre suma 2; la que es prefijo de una del
 * nombre —o al revés, que es el caso "chester"/"chesterfield"— suma 1.
 *
 * Los números y las medidas NO suman. Antes sí, y "PRITTY LIMON 1000 X 9
 * UNID." traía LIVRA 1.5L PERA porque el "1" de "1.5L" era prefijo de "1000".
 * Un candidato sin ninguna palabra significativa en común no sale: no se
 * rellena la lista con lo menos malo.
 *
 * A igual puntaje desempatan, en este orden: la palabra del papel que
 * coincide MÁS ADELANTE en el texto —la marca va primero, como en
 * `tokenizarProducto`: "N.FORJADO 20 KS RED" es un Forjado antes que un "red"—,
 * la MEDIDA (`claseDeMedida`) —entre "Chester 10" y "Chester 20" para
 * "CHESTERFIELD 10 CONV", o PRITTY 2.25L entre los PRITTY para "PRITTY LIMON
 * 2250 CC X 6 UNI"—, lo que pide quien llama con `opts.preferir` —la cascada:
 * estar en el pedido, que pesa MENOS que la medida—, y al final el nombre MÁS
 * CORTO —entre "Marlboro 20 Crafted Box" y "Marlboro 20 Crafted Uva Box" para
 * una factura que no dice uva, el que no agrega palabras—.
 *
 * `score` mantiene la convención de los otros rankeadores: MENOR ES MEJOR.
 */
export function rankearPorPalabras(items, query, opts = {}) {
  const getNombre = opts.getNombre || ((i) => i?.nombre || "");
  const preferir = opts.preferir || (() => false);
  const palabras = palabrasSignificativas(query);
  if (!palabras.length) return [];
  const medidas = medidasDelTexto(query);

  const out = [];
  for (const item of items) {
    const delNombre = palabrasSignificativas(getNombre(item));
    if (!delNombre.length) continue;

    let puntos = 0;
    let primera = palabras.length;
    palabras.forEach((p, i) => {
      const antes = puntos;
      if (delNombre.includes(p)) puntos += 2;
      else if (delNombre.some((w) => w.startsWith(p) || p.startsWith(w))) puntos += 1;
      if (puntos > antes && i < primera) primera = i;
    });
    if (puntos <= 0) continue;
    out.push({
      item,
      score: -puntos,
      puntos,
      primera,
      medida: claseDeMedida(medidas, medidasDelTexto(getNombre(item))),
      preferido: preferir(item) ? 0 : 1,
    });
  }

  out.sort(
    (a, b) =>
      b.puntos - a.puntos ||
      a.primera - b.primera ||
      a.medida - b.medida ||
      a.preferido - b.preferido ||
      getNombre(a.item).length - getNombre(b.item).length
  );
  return out;
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
