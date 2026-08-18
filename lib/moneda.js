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

// Ruta relativa y no el alias: dentro de `lib/` es como se importan los vecinos
// —`recargoFijoUnidad.js` hace lo mismo con este archivo—, y además así lo puede
// importar la sonda, que corre con node pelado y sin el cargador de alias.
import { precioUnitarioQueSeCobra } from "./precios/redondeo.js";

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
 * ── SIEMPRE DEVUELVE TEXTO. ANTES DEVOLVÍA `null` Y ESO SE VEÍA ───────────
 *
 * Devolvía `null` para los productos sueltos, con el argumento de que "1 pack =
 * 1 un" es ruido. El argumento era cierto y la conclusión estaba mal: la tarjeta
 * omitía el bloque entero, así que en una lista de veinticinco las que no tenían
 * equivalencia quedaban MÁS BAJAS que las vecinas y la lista se veía despareja.
 *
 * Y la salida no es dejar el hueco vacío —eso es el mismo desparejo con más
 * pasos—: es que la línea diga lo que corresponde. **Que un producto se venda
 * por unidad también es información**, y es justamente la que falta cuando el de
 * al lado se vende por bulto. El caso que no había que mostrar no era "sin
 * equivalencia": era "1 pack = 1 un", que efectivamente no se muestra nunca.
 *
 * Los cinco casos, que son todos los que existen:
 *
 *   · kilo con precio    — `Se vende por kilo · $129,80 cada 100 g`
 *   · kilo sin precio    — `Se vende por kilo`
 *   · bulto con precio   — `1 pack = 24 un · $1.329,17 por unidad`
 *   · bulto sin precio   — `1 pack = 24 un`
 *   · suelto             — `Se vende por unidad`
 *
 * El precio se separó de la escala a propósito: la escala se sabe siempre, el
 * precio unitario no. Antes un producto sin precio perdía la línea entera, así
 * que perdía también el dato que sí se conocía.
 *
 * @param {object} p
 * @param {number|string|null} p.precio        el precio del bulto.
 * @param {number|null} p.factor               unidades por bulto.
 * @param {string|null} p.unidad               `"kg"` para los que van por peso.
 * @returns {string} el texto. Nunca vacío.
 */
export function lineaDeEquivalencia({ precio, factor, unidad, redondeo100 = false } = {}) {
  // El nulo se descarta ANTES de convertir: `Number(null)` es 0, que es finito,
  // así que una guarda que sólo mira `isFinite` deja pasar un producto sin precio
  // cargado y le arma "$0,00 por unidad" — el mismo defecto que este archivo
  // evita en `formatearMoneda`, colado por la puerta de al lado. Lo destapó
  // probar el caso, no leerlo.
  const sinPrecio = precio === null || precio === undefined || precio === "";
  const n = sinPrecio ? NaN : Number(precio);
  const hayPrecio = Number.isFinite(n);

  if (String(unidad).toLowerCase() === "kg") {
    // Cada 100 g: es la fracción con la que se compra fiambre y queso, y evita
    // un número de tres decimales que nadie compara de un vistazo.
    // También parte del precio que se cobra: para los de peso la escala YA es la
    // unitaria, así que si el producto redondea, los 100 g salen del redondeado.
    const porKilo = precioUnitarioQueSeCobra({ precio, factor, unidad, redondeo100 });
    return hayPrecio
      ? `Se vende por kilo · ${formatearMoneda(porKilo / 10)} cada 100 g`
      : "Se vende por kilo";
  }

  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 1) return "Se vende por unidad";

  // EL UNITARIO NO SE DIVIDE ACÁ. Sale de `precioUnitarioQueSeCobra`, que es
  // donde vive la regla del redondeo comercial, porque este número es el que el
  // POS le cobra al cliente. Dividir por el factor en esta línea era exactamente
  // lo que hacía que el catálogo mostrara un precio y el mostrador cobrara otro.
  const unitario = precioUnitarioQueSeCobra({ precio, factor, unidad, redondeo100 });

  return hayPrecio
    ? `1 pack = ${f} un · ${formatearMoneda(unitario)} por unidad`
    : `1 pack = ${f} un`;
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
