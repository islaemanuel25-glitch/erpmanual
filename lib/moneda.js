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
 * ── SOLO LA CONVERSIÓN. LA ESCALA LA DICE EL RÓTULO ──────────────────────
 *
 * Hasta el 2026-08-19 esta función decía además la escala con palabras —"Se
 * vende por unidad"— y eso quedaba dos centímetros abajo de un rótulo que ya
 * decía "por unidad". En los sueltos era la misma frase dos veces.
 *
 * Ahora devuelve SOLO lo que el número grande no puede decir por sí solo, que es
 * la conversión. Y cuando no hay ninguna, devuelve `null` y la tarjeta no dibuja
 * el bloque.
 *
 * **OJO CON LA HISTORIA DE ESE `null`, porque ya se rompió una vez.** Antes
 * devolvía `null` para los sueltos y las tarjetas quedaban desparejas: la que no
 * tenía línea salía más baja que las vecinas, en una lista de veinticinco. Eso
 * era real y estaba medido. Lo que cambió es que la lista ahora iguala los altos
 * con `auto-rows-fr`, así que la más alta manda. **Se volvió a medir en la
 * pantalla antes de cambiarlo**, no se dio por sabido.
 *
 * Los casos, que son todos los que existen:
 *
 *   · bulto con precio   — `1 pack = 24 un · $1.329,17 por unidad`
 *   · bulto sin precio   — `1 pack = 24 un`
 *   · bulto, pero se vende por unidad — `1 pack = 24 un`
 *   · pieza fija         — `1 pieza = 6 kg · $1.000,00 por kilo`
 *   · kilo               — `$129,80 cada 100 g`
 *   · suelto             — `null`
 *
 * ── QUÉ ESCALA SE USA ────────────────────────────────────────────────────
 *
 * La de VENTA, si el llamador la pasa. El mismo pack se vende por bulto en el
 * depósito y por unidad en un local, y la conversión que hace falta no es la
 * misma: con el número grande ya en unitario, repetir el unitario abajo sobra.
 *
 * Si no la pasa se deduce la del precio GUARDADO, que es lo que esta función
 * asumía siempre. Eso es para las pantallas que muestran la ficha del producto y
 * no la de una ubicación.
 *
 * ── EL COMBO SE DICE ACÁ, CON PALABRA Y NO CON UN DIBUJO ─────────────────
 *
 * Un combo no se distinguía de un producto común en ninguna parte de la
 * tarjeta. Esta línea es el lugar natural para decirlo, porque ya contesta "qué
 * es lo que estás comprando" y está justo debajo del precio.
 *
 * Va como PREFIJO para componerse con la conversión en vez de reemplazarla. Y
 * **cuando no hay conversión, el combo igual devuelve `"Combo"`**: si no, los
 * combos sueltos —113, medidos— perderían su única marca sin que nadie lo pida.
 *
 * @param {object} p
 * @param {number|string|null} p.precio        el precio, en su escala guardada.
 * @param {number|null} p.factor               unidades por bulto.
 * @param {string|null} p.unidad               `"kg"` para los que van por peso.
 * @param {boolean} p.esCombo                  si el producto es un combo.
 * @param {string|null} p.escala               la escala de VENTA, si se conoce.
 * @param {number|null} p.pesoReferenciaKg     cuánto pesa una pieza.
 * @returns {string|null} la conversión, o `null` si no hay ninguna que aportar.
 */
export function lineaDeEquivalencia({
  precio,
  factor,
  unidad,
  redondeo100 = false,
  esCombo = false,
  // ── LAS DOS PREFERENCIAS DEL LOCAL ──────────────────────────────────────
  //
  // Las dos llegan APAGADAS por defecto, y con las dos apagadas esta función
  // devuelve exactamente el texto de siempre: la rama de abajo sale antes de
  // mirarlas. Eso no es prolijidad, es el requisito — un local que nunca entre a
  // la pantalla de apariencia tiene que ver lo mismo que hoy.
  ocultarEquivalencia = false,
  // La escala en la que se VENDE, de `escalaDeVentaDe`. Si no viene, se deduce
  // la del precio guardado — que es lo que esta función asumía siempre.
  escala = null,
  // Cuánto pesa una pieza. Solo lo mira la rama del fiambre de pieza fija.
  pesoReferenciaKg = null,
} = {}) {
  // El prefijo se aplica al final, sobre la frase que armen las ramas de abajo,
  // para no repetir la palabra en cada una. La primera letra baja a minúscula
  // porque deja de empezar la oración: "Combo · Se vende" se lee como dos
  // títulos pegados. Las frases que arrancan con un número no se ven afectadas.
  //
  // ── Y CUANDO NO HAY NADA QUE CONVERTIR, EL COMBO IGUAL SE TIENE QUE VER ──
  //
  // Ésta es la única marca que distingue un combo de un producto común en toda
  // la tarjeta. Si la línea desaparece para los sueltos, los combos sueltos
  // perderían su marca sin que nadie lo pida — 113 combos, medidos. Por eso una
  // frase vacía con `esCombo` devuelve "Combo" y no `null`.
  const conPrefijo = (frase) => {
    if (!frase) return esCombo ? "Combo" : null;
    return esCombo ? `Combo · ${frase.charAt(0).toLowerCase()}${frase.slice(1)}` : frase;
  };

  // El nulo se descarta ANTES de convertir: `Number(null)` es 0, que es finito,
  // así que una guarda que sólo mira `isFinite` deja pasar un producto sin precio
  // cargado y le arma "$0,00 por unidad" — el mismo defecto que este archivo
  // evita en `formatearMoneda`, colado por la puerta de al lado. Lo destapó
  // probar el caso, no leerlo.
  const sinPrecio = precio === null || precio === undefined || precio === "";
  const n = sinPrecio ? NaN : Number(precio);
  const hayPrecio = Number.isFinite(n);

  // ── LA ESCALA YA LA DICE EL RÓTULO PEGADO AL PRECIO ─────────────────────
  //
  // Esta línea decía la escala con palabras —"Se vende por unidad"— dos
  // centímetros abajo de un rótulo que decía "por unidad". En los sueltos era
  // literal: la misma frase dos veces. Ahora queda SOLO cuando aporta una
  // CONVERSIÓN, que es lo que el número grande no puede decir por sí solo: sin
  // ella, "$24.000,00 por bulto" no se puede controlar.
  //
  // Cuando no hay nada que convertir devuelve `null` y la tarjeta no dibuja el
  // bloque. Eso NO desnivela las tarjetas: la lista las iguala con
  // `auto-rows-fr`, y se volvió a medir en la pantalla antes de cambiarlo.
  const escalaEfectiva = escala || escalaImplicita(unidad, factor);

  // ── PIEZA: el mismo caso del pack, con kilos en vez de unidades ─────────
  //
  // Un fiambre de pieza fija se vende por pieza en el depósito y la pieza pesa
  // siempre lo mismo. El valor guardado es POR KILO, así que la conversión es la
  // que deja controlar el número de arriba: la paleta son 6 kg, el kilo $1.000,
  // la pieza $6.000.
  if (escalaEfectiva === "por pieza") {
    const peso = Number(pesoReferenciaKg);
    if (!Number.isFinite(peso) || peso <= 0) return conPrefijo("");
    // `formatearKgExacto` y no `formatearKg`: con un solo decimal, una pieza de
    // 0,265 kg se mostraría como "0,3 kg" y la multiplicación no cerraría — la
    // línea diría lo contrario de lo que viene a probar.
    const kg = formatearKgExacto(peso);
    return conPrefijo(
      hayPrecio ? `1 pieza = ${kg} · ${formatearMoneda(n)} por kilo` : `1 pieza = ${kg}`
    );
  }

  if (escalaEfectiva === "por kg") {
    // Cada 100 g: es la fracción con la que se compra fiambre y queso, y evita
    // un número de tres decimales que nadie compara de un vistazo. Es una
    // conversión, así que se queda; lo que se fue es el "Se vende por kilo" que
    // repetía el rótulo.
    if (!hayPrecio) return conPrefijo("");
    const porKilo = precioUnitarioQueSeCobra({ precio, factor, unidad, redondeo100 });
    return conPrefijo(`${formatearMoneda(porKilo / 10)} cada 100 g`);
  }

  const f = Number(factor);
  // Sin bulto no hay nada que convertir: el número de arriba ya es el que se
  // cobra y su rótulo ya dice en qué escala está.
  if (!Number.isFinite(f) || f <= 1) return conPrefijo("");

  // ── DE ACÁ PARA ABAJO ES EL CASO DE BULTO, Y ES EL ÚNICO QUE LA ─────────
  // ── PREFERENCIA TOCA ───────────────────────────────────────────────────
  //
  // El interruptor se llama "ocultar la equivalencia de BULTO", así que no puede
  // tocar a las filas que no son de bulto. Por eso las ramas de arriba salen
  // antes de mirarlo.
  //
  // Y ahora sí lo deja vacío, en vez de reemplazarlo por la escala con palabras:
  // esa frase era justamente la repetición que se está sacando.
  if (ocultarEquivalencia) return conPrefijo("");

  // EL UNITARIO NO SE DIVIDE ACÁ. Sale de `precioUnitarioQueSeCobra`, que es
  // donde vive la regla del redondeo comercial, porque este número es el que el
  // POS le cobra al cliente. Dividir por el factor en esta línea era exactamente
  // lo que hacía que el catálogo mostrara un precio y el mostrador cobrara otro.
  const unitario = precioUnitarioQueSeCobra({ precio, factor, unidad, redondeo100 });

  // Con el número grande YA en unitario, repetir "$1.400,00 por unidad" acá sería
  // decir dos veces lo mismo a dos centímetros. Queda el tamaño del bulto, que es
  // lo que el número grande no dice.
  if (escalaEfectiva === "por unidad") return conPrefijo(`1 pack = ${f} un`);

  return conPrefijo(
    hayPrecio
      ? `1 pack = ${f} un · ${formatearMoneda(unitario)} por unidad`
      : `1 pack = ${f} un`
  );
}

/**
 * La escala que se deduce del producto cuando el llamador no dice cuál usa.
 *
 * Es la escala en la que está GUARDADO el precio, que es lo que esta función
 * asumía siempre antes de que existiera la de venta. Se conserva para las
 * pantallas que muestran la ficha del producto y no la de la ubicación.
 */
function escalaImplicita(unidad, factor) {
  if (String(unidad).toLowerCase() === "kg") return "por kg";
  const f = Number(factor);
  return Number.isFinite(f) && f > 1 ? "por bulto" : "por unidad";
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

/**
 * Kilos con los que se puede MULTIPLICAR: hasta tres decimales, sin ceros de
 * relleno. `6 kg`, `1,9 kg`, `0,265 kg`.
 *
 * ── POR QUÉ NO ALCANZA `formatearKg` ─────────────────────────────────────
 *
 * Aquélla redondea a UN decimal, que está bien para una cantidad de stock: nadie
 * hace cuentas con lo que ve. Acá sí. La línea "1 pieza = N kg · $X por kilo"
 * existe para que alguien pueda comprobar el número grande multiplicando, y con
 * un decimal esa comprobación FALLA en los productos reales: hay piezas de
 * 0,265 kg —medido, `PEHUAMAR CHISITOS 265G`— que se mostrarían como "0,3 kg", y
 * 0,3 × $1.000 no da los $265 de arriba. La línea diría lo contrario de lo que
 * viene a probar.
 *
 * Tres decimales es la precisión de la columna: `pesoReferenciaKg` es
 * `Decimal(10,3)`. Y sin ceros de relleno porque una paleta de 6 kg no gana nada
 * escrita "6,000 kg".
 */
export function formatearKgExacto(valor) {
  if (valor === null || valor === undefined || valor === "") return SIN_VALOR;
  const n = Number(valor);
  if (!Number.isFinite(n)) return SIN_VALOR;
  return `${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} kg`;
}
