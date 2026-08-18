// EL FORMATEADOR DE MONEDA DEL ERP.
//
// ── QUÉ RESUELVE, Y QUÉ NO ────────────────────────────────────────────────
//
// Resuelve que las piezas NUEVAS tengan un solo lugar del que sacar el formato.
// NO reemplaza a los 36 formateadores escritos a mano que ya existen: eso es una
// tanda propia, medida y anotada en el roadmap, y no se hace de paso porque
// mueve 205 lugares en 82 archivos y pone en rojo unos 45 candados que HOY SE
// CONTRADICEN ENTRE SÍ.
//
// ── EL FORMATO, Y DE DÓNDE SALE ───────────────────────────────────────────
//
// `es-AR`, punto de miles, coma decimal, SIEMPRE dos decimales: `$128.864,36`,
// `$24.980,00`. El símbolo va pegado al número.
//
// No es una preferencia nueva: `docs/04-CONVENCIONES.md` ya dice que la
// convención del proyecto es `minimumFractionDigits: 2, maximumFractionDigits: 2`.
// Lo que faltaba era un lugar donde vivir — la convención estaba escrita y 36
// formateadores no la cumplían.
//
// ── POR QUÉ EL MÁXIMO TAMBIÉN SE FIJA ─────────────────────────────────────
//
// Varios de los formateadores de hoy piden mínimo 2 y NO fijan el máximo, y el
// default lo lleva hasta 3: un costo de 166860.005 sale `$166.860,005`. Fijar
// los dos extremos es lo que hace que dos precios se puedan comparar de un
// vistazo, que es para lo que se los mira.
//
// ── EL NULO NO ES CERO ────────────────────────────────────────────────────
//
// Sin valor devuelve una raya, no `$0,00`. Es una regla de negocio, no de
// estilo: un producto sin costo cargado mostrando `$0,00` se lee como que vale
// cero, y alguien lo vende a pérdida. El candado de `presentacion.test.mjs` ya
// lo defiende con ese mismo motivo para las listas de proveedor.

const FORMATO = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Lo que se muestra cuando no hay valor. No es `$0,00` — ver arriba. */
export const SIN_VALOR = "—";

/**
 * Formatea un importe en pesos: `$128.864,36`.
 *
 * @param {number|string|null|undefined} valor
 * @param {{ sinSimbolo?: boolean }} [opciones]
 * @returns {string} el importe formateado, o `SIN_VALOR` si no hay número.
 */
export function formatearMoneda(valor, { sinSimbolo = false } = {}) {
  if (valor === null || valor === undefined || valor === "") return SIN_VALOR;
  const n = Number(valor);
  if (!Number.isFinite(n)) return SIN_VALOR;
  const cuerpo = FORMATO.format(n);
  return sinSimbolo ? cuerpo : `$${cuerpo}`;
}

/**
 * LA LÍNEA DE EQUIVALENCIA de la tarjeta de producto.
 *
 * Es el dato que contesta la pregunta que uno se hace mirando un precio por
 * bulto: *¿cuánto me sale cada uno?*. Sin ella, un precio de pack y uno de
 * unidad se ven iguales y no se pueden comparar.
 *
 * Tres casos, y son los tres que existen:
 *
 *   · por kilo      — no hay bulto que dividir, así que se dice el precio de una
 *                     fracción usable (100 g) en vez de inventar una unidad;
 *   · con factor    — `1 pack = 24 un · $1.329,17 por unidad`;
 *   · sin factor    — no hay equivalencia que mostrar y devuelve `null`. La
 *                     tarjeta omite el bloque entero: media línea diciendo
 *                     "1 pack = 1 un" es ruido, no información.
 *
 * @param {object} p
 * @param {number|string|null} p.precio        el precio del bulto.
 * @param {number|null} p.factor               unidades por bulto.
 * @param {string|null} p.unidad               `"kg"` para los que van por peso.
 * @returns {string|null} el texto, o null si no hay nada que decir.
 */
export function lineaDeEquivalencia({ precio, factor, unidad } = {}) {
  // El nulo se descarta ANTES de convertir: `Number(null)` es 0, que es finito,
  // así que una guarda que sólo mira `isFinite` deja pasar un producto sin precio
  // cargado y le arma "$0,00 por unidad" — el mismo defecto que este archivo
  // evita en `formatearMoneda`, colado por la puerta de al lado. Lo destapó
  // probar el caso, no leerlo.
  if (precio === null || precio === undefined || precio === "") return null;
  const n = Number(precio);
  if (!Number.isFinite(n)) return null;

  if (String(unidad).toLowerCase() === "kg") {
    // Cada 100 g: es la fracción con la que se compra fiambre y queso, y evita
    // un número de tres decimales que nadie compara de un vistazo.
    return `Se vende por kilo · ${formatearMoneda(n / 10)} cada 100 g`;
  }

  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 1) return null;

  return `1 pack = ${f} un · ${formatearMoneda(n / f)} por unidad`;
}

/**
 * Kilos: UN decimal, no dos. `8,4 kg`.
 *
 * Va acá y no en un helper aparte porque es la otra unidad que la tarjeta de
 * producto muestra, y separarlas invita a que cada pantalla resuelva los kilos
 * por su cuenta — que es exactamente cómo nacieron los 36 formateadores.
 */
export function formatearKg(valor) {
  if (valor === null || valor === undefined || valor === "") return SIN_VALOR;
  const n = Number(valor);
  if (!Number.isFinite(n)) return SIN_VALOR;
  return `${n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}
