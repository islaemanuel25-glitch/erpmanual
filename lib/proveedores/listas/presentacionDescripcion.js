// lib/proveedores/listas/presentacionDescripcion.js
//
// QUÉ DICE LA DESCRIPCIÓN DEL PROVEEDOR sobre la presentación.
//
// La descripción de Arcor es texto libre, pero repite unas pocas formas. De ahí
// sale la cantidad de la presentación, que es un dato distinto del precio y
// distinto del UxBU.
//
// ── LAS FORMAS QUE APARECEN EN EL ARCHIVO REAL ──────────────────────────────
//
//   "JG. PV. ARC FRUTILLA 18u x 18g"   18 unidades de 18 g   → cantidad 18
//   "BOCADITO CABSHA 48 x 10g"         48 unidades de 10 g   → cantidad 48
//   "BON. O BON BLANCO x 30u"          30 unidades           → cantidad 30
//   "MOGUL. BANANITAS 12X12X30G"       12 de 12 de 30 g      → cantidad 12
//   "TABLETA ARCOR LECHE MANI x 80g"   un envase de 80 g     → cantidad 1
//   "MOGUL x 500Grs FRUTILLA (119u)"   bolsa de 500 g        → cantidad 1, contenido 119
//   "MOGUL x1 Kg CONITOS (450u)"       bolsa de 1 kg         → cantidad 1, contenido 450
//
// ── LA DISTINCIÓN QUE IMPORTA ───────────────────────────────────────────────
//
// CANTIDAD DE PRESENTACIÓN es cuántas unidades comerciales trae el envase que se
// compra y se vende. CONTENIDO INTERNO es cuántas piezas hay adentro de un
// envase que se vende por peso: los 450 caramelos de una bolsa de un kilo
// describen la bolsa, no la convierten en un pack de 450 bolsas.
//
// El contenido interno se devuelve aparte y NUNCA alimenta una hipótesis de
// multiplicar el precio. El que quiera mostrarlo lo muestra; el cálculo del
// costo no lo mira.
//
// ── LO QUE ESTE MÓDULO NO HACE ──────────────────────────────────────────────
//
// No mira UxBU. UxBU es un nivel logístico del proveedor —displays por bulto,
// cajas por caja madre— que ERP Azul no maneja: no es la cantidad del producto
// ni multiplica ningún precio.
//
// Módulo puro: sin BD, sin Next.

/** Hasta acá una cantidad de presentación es creíble. Más es contenido interno. */
export const CANTIDAD_MAX = 200;

const NUM = "(\\d{1,4})";

/**
 * Un peso o volumen escrito de cualquiera de las formas del archivo:
 * "15g", "18 GRS", "500Grs", "1 Kg", "51g", "110G".
 */
const UNIDAD_PESO = "(?:g|gr|grs|grms|gramos|kg|k|ml|l|cc)\\b\\.?";

/** "(119u)" o "(450 u)" o "(210" — el contenido de un envase por peso. */
const RE_CONTENIDO = new RegExp(`\\(\\s*${NUM}\\s*u?\\s*\\)?`, "i");

/** "18u x 18g" · "48 x 10g" · "12x36g" · "10X50G" · "20u x 12g" */
const RE_CANTIDAD_POR_PESO = new RegExp(`\\b${NUM}\\s*u?\\s*[x×]\\s*\\d+(?:[.,]\\d+)?\\s*${UNIDAD_PESO}`, "i");

/** "12X12X30G" — el primer número es la cantidad; el resto describe la pieza. */
const RE_TRIPLE = new RegExp(`\\b${NUM}\\s*[x×]\\s*\\d+\\s*[x×]\\s*\\d+\\s*${UNIDAD_PESO}`, "i");

/** "x 30u" · "x 18u" · "x10u" — cantidad sin peso. */
const RE_CANTIDAD_SOLA = new RegExp(`[x×]\\s*${NUM}\\s*u\\b`, "i");

/** "x 80g" · "X150G." · "x1 Kg" · "x 500Grs" — un envase, sin cantidad. */
const RE_PESO_SOLO = new RegExp(`[x×]?\\s*\\d+(?:[.,]\\d+)?\\s*${UNIDAD_PESO}`, "i");

const entero = (s) => {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 ? n : null;
};

/**
 * Lo que la descripción dice de la presentación.
 *
 * @returns {{
 *   cantidad: number|null,        cuántas unidades trae el envase (null = no se pudo leer)
 *   contenidoInterno: number|null piezas adentro de un envase por peso, dato informativo
 *   pesoTexto: string|null,       el peso o volumen tal como está escrito
 *   origen: string                de qué forma salió, para poder explicarlo
 * }}
 */
export function presentacionDeDescripcion(descripcion) {
  const texto = String(descripcion ?? "").trim();
  const vacio = { cantidad: null, contenidoInterno: null, pesoTexto: null, origen: "SIN_DATO" };
  if (!texto) return vacio;

  // El contenido interno se saca primero y se quita del texto: si no, el "(119u)"
  // de una bolsa de 500 g se leería como cantidad de presentación.
  const mContenido = texto.match(RE_CONTENIDO);
  const contenidoInterno = mContenido ? entero(mContenido[1]) : null;
  const resto = mContenido ? texto.replace(mContenido[0], " ") : texto;

  const mPeso = resto.match(RE_PESO_SOLO);
  const pesoTexto = mPeso ? mPeso[0].replace(/^[x×]\s*/i, "").trim() : null;

  const triple = resto.match(RE_TRIPLE);
  if (triple) {
    const n = entero(triple[1]);
    if (n !== null && n <= CANTIDAD_MAX) {
      return { cantidad: n, contenidoInterno, pesoTexto, origen: "CANTIDAD_POR_PESO" };
    }
  }

  const porPeso = resto.match(RE_CANTIDAD_POR_PESO);
  if (porPeso) {
    const n = entero(porPeso[1]);
    if (n !== null && n <= CANTIDAD_MAX) {
      return { cantidad: n, contenidoInterno, pesoTexto, origen: "CANTIDAD_POR_PESO" };
    }
  }

  const sola = resto.match(RE_CANTIDAD_SOLA);
  if (sola) {
    const n = entero(sola[1]);
    if (n !== null && n <= CANTIDAD_MAX) {
      return { cantidad: n, contenidoInterno, pesoTexto, origen: "CANTIDAD_SOLA" };
    }
  }

  // Queda un envase descrito por su peso y nada más: es UNO.
  if (pesoTexto) {
    return { cantidad: 1, contenidoInterno, pesoTexto, origen: "ENVASE_UNICO" };
  }

  return { ...vacio, contenidoInterno };
}

/**
 * ¿La cantidad que dice la descripción coincide con la que tiene el producto?
 *
 * Sirve para la conciliación de PRESENTACIÓN, que es independiente de la del
 * precio: un producto puede tener la cantidad desactualizada y aun así costarse
 * bien, y al revés.
 *
 * @returns "COINCIDEN" | "DIFIEREN" | "SIN_DATO"
 */
export function compatibilidadDePresentacion({ cantidadDescripcion, factorPack } = {}) {
  const a = Number(cantidadDescripcion);
  const b = Number(factorPack);
  if (!Number.isFinite(a) || a < 1) return "SIN_DATO";
  if (!Number.isFinite(b) || b < 1) return "SIN_DATO";
  return a === b ? "COINCIDEN" : "DIFIEREN";
}
