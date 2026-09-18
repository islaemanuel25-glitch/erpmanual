// EL CÓDIGO DE LA CAJA Y EL DE LA UNIDAD.
//
// ── EL PROBLEMA, MEDIDO ────────────────────────────────────────────────────
//
// De 2.718 productos activos en producción, 83 tienen en el campo del código de
// barras principal un código de CATORCE dígitos. Catorce no es un código de
// barras de unidad: es un GTIN-14, el que va impreso en la caja para el depósito.
// El que se escanea en la caja registradora tiene trece.
//
// El efecto es silencioso y caro: el producto existe, está bien cargado, y en el
// POS no aparece nunca. Nadie ve un error — ve un producto que "no está".
//
// ── CÓMO SE ARMA UN GTIN-14, QUE ES POR QUÉ SE PUEDE DESARMAR ──────────────
//
// Un GTIN-14 es tres cosas pegadas:
//
//   1 dígito    INDICADOR de nivel de empaque. 1 a 8 dicen "caja de tantas
//               unidades" —el número en sí no dice cuántas, lo fija el
//               fabricante— y 9 marca medida variable.
//   12 dígitos  EL CUERPO del GTIN-13 de la unidad, SIN su verificador.
//   1 dígito    el verificador del 14, calculado sobre los trece de la izquierda.
//
// Así que el código de la unidad sale de sacar el indicador, quedarse con los
// doce del cuerpo y volver a calcular el verificador. NO se puede reusar el
// verificador del 14: se calculó sobre otra cadena y da otro número.
//
// ── LO QUE ESTO NO PUEDE SABER, Y POR ESO NO SE APLICA SOLO ────────────────
//
// La aritmética es exacta, pero la conclusión no: que el 14 esté bien formado no
// prueba que el 13 que sale de él sea el código que el fabricante realmente
// imprimió en la unidad. Hay casos donde la unidad no tiene GTIN propio, o donde
// el 14 se cargó a mano y está mal tipeado.
//
// Por eso este módulo CALCULA y no decide. Quien mira la pantalla acepta cada
// uno, y el aviso busca confirmación en las listas del proveedor antes de
// proponerlo. Aplicar los 83 de un saque escribiría códigos inventados en el
// catálogo que cobra.
//
// Módulo puro: sin Prisma, sin Next. Solo aritmética sobre cadenas.

/** Largo de un código de caja. */
export const LARGO_CAJA = 14;
/** Largo de un código de unidad. */
export const LARGO_UNIDAD = 13;

/**
 * El código, en dígitos y nada más.
 *
 * Se sacan espacios y guiones porque un código tipeado a mano los trae —"7790
 * 0000 12345 6"— y sin esto un código perfectamente válido se leería como no
 * numérico. Cualquier otra cosa lo descalifica: una letra no es un dígito
 * perdido, es otro dato.
 */
export function soloDigitos(codigo) {
  if (codigo === null || codigo === undefined) return null;
  const limpio = String(codigo).trim().replace(/[\s-]/g, "");
  if (limpio === "" || !/^\d+$/.test(limpio)) return null;
  return limpio;
}

/**
 * EL VERIFICADOR DE UN EAN-13, sobre los DOCE dígitos del cuerpo.
 *
 * ── LA REGLA, Y EL DETALLE QUE SE EQUIVOCA SIEMPRE ────────────────────────
 *
 * Se suman los doce dígitos con pesos que alternan 1 y 3 EMPEZANDO POR 1 en el
 * primero. El verificador es lo que falta para llegar a la decena siguiente, y
 * cuando la suma ya termina en cero el verificador es cero — no diez.
 *
 * El error clásico es arrancar con peso 3, que da un número plausible y
 * equivocado en la mitad de los casos. Por eso los candados no prueban "que
 * devuelva un dígito": prueban dos códigos publicados por GS1 cuyo verificador
 * es conocido de antemano, más el borde del cero.
 *
 * @param {string} doce los doce dígitos del cuerpo
 * @returns {number|null} el verificador, o null si la entrada no son doce dígitos
 */
export function verificadorEan13(doce) {
  const d = soloDigitos(doce);
  if (d === null || d.length !== LARGO_UNIDAD - 1) return null;

  let suma = 0;
  for (let i = 0; i < d.length; i += 1) {
    // Índice 0 es el primer dígito y pesa 1; el segundo pesa 3; y así.
    suma += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (suma % 10)) % 10;
}

/** ¿Este EAN-13 tiene el verificador que le corresponde? */
export function ean13Valido(codigo) {
  const d = soloDigitos(codigo);
  if (d === null || d.length !== LARGO_UNIDAD) return false;
  return verificadorEan13(d.slice(0, 12)) === Number(d[12]);
}

/**
 * ¿Este código es el de una caja?
 *
 * CATORCE DÍGITOS Y NADA MÁS. No se exige que el verificador del 14 cierre, y es
 * deliberado: un código mal tipeado en el campo principal es igual de invisible
 * en el POS que uno bien tipeado, así que tiene que aparecer en el control. Lo
 * que sí cambia es qué se puede proponer — eso lo dice `unidadDesdeLaCaja`.
 */
export function esCodigoDeCaja(codigo) {
  const d = soloDigitos(codigo);
  return d !== null && d.length === LARGO_CAJA;
}

/** El dígito indicador de nivel de empaque, o null si no es un código de caja. */
export function indicadorDeEmpaque(codigo) {
  const d = soloDigitos(codigo);
  if (d === null || d.length !== LARGO_CAJA) return null;
  return Number(d[0]);
}

/**
 * EL CÓDIGO DE LA UNIDAD que se deduce del de la caja.
 *
 * @returns {{ok: true, unidad: string, indicador: number, cuerpo: string}}
 *        | {ok: false, motivo: string}
 *
 * ── POR QUÉ DEVUELVE UN MOTIVO Y NO `null` ────────────────────────────────
 *
 * Porque los dos "no se pudo" son distintos y la pantalla tiene que decir cuál:
 * un código que no tiene catorce dígitos no es este problema y no hay nada que
 * ofrecer; uno de catorce con indicador 9 es medida variable, y ahí el cuerpo no
 * identifica una unidad vendible —el precio viaja en el código— así que proponer
 * un EAN-13 sería inventarlo. Un `null` para los dos obligaría a la pantalla a
 * volver a preguntar por qué, con su propia copia de estas reglas.
 */
export function unidadDesdeLaCaja(codigo) {
  const d = soloDigitos(codigo);
  if (d === null) return { ok: false, motivo: "NO_NUMERICO" };
  if (d.length !== LARGO_CAJA) return { ok: false, motivo: "NO_ES_DE_CAJA" };

  const indicador = Number(d[0]);
  // ── EL 9 NO SE CONVIERTE ────────────────────────────────────────────────
  //
  // Indicador 9 es medida variable: adentro del código viaja el peso o el
  // importe, no una unidad de catálogo. El cuerpo no es el GTIN de nada que se
  // pueda escanear en la caja, así que acá no hay un código de unidad que
  // deducir — hay que leerlo del producto.
  if (indicador === 9) return { ok: false, motivo: "MEDIDA_VARIABLE" };

  // Los doce del cuerpo: se saltea el indicador y se descarta el verificador
  // del 14, que se calculó sobre otra cadena.
  const cuerpo = d.slice(1, 13);
  const verificador = verificadorEan13(cuerpo);
  if (verificador === null) return { ok: false, motivo: "NO_ES_DE_CAJA" };

  return { ok: true, unidad: `${cuerpo}${verificador}`, indicador, cuerpo };
}

/**
 * ¿Este producto no se puede escanear porque no tiene ningún código?
 *
 * Los TRES campos, porque los tres se escanean igual: el principal, el
 * secundario y el propio de la ubicación. Mirar solo el principal contaría como
 * "sin código" a un producto que el local identifica con el suyo, y mandaría a
 * alguien a cargar un código que ya existe.
 */
export function sinCodigoDeBarras(p) {
  return (
    soloDigitosOTexto(p?.codigo_barra) === null &&
    soloDigitosOTexto(p?.codigo_barra_secundario) === null &&
    soloDigitosOTexto(p?.codigo_barra_propio) === null
  );
}

/**
 * Un código cargado, sea numérico o no.
 *
 * `sinCodigoDeBarras` pregunta si hay ALGO escrito, no si es un EAN válido: un
 * código interno con letras igual se escanea y no es un producto sin código. Por
 * eso no reusa `soloDigitos`, que devolvería null y lo contaría como faltante.
 */
function soloDigitosOTexto(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
