// lib/proveedores/listas/normalizarCodigo.js
//
// CÓDIGOS DE PROVEEDOR — normalización y coincidencia.
//
// POR QUÉ NORMALIZAR
//
// El mismo código llega escrito de maneras distintas según por dónde pasó. En la
// lista del proveedor puede venir "001-234", en el ERP estar cargado como
// "001234", y si el archivo se abrió en Excel antes de exportarlo, la celda pudo
// convertirse en el NÚMERO 1234 y perder los ceros de la izquierda para siempre.
// Los tres son el mismo producto y ninguno es igual al otro como string.
//
// QUÉ SE CONSERVA, SIEMPRE
//
// El código CRUDO, tal cual vino, y el NORMALIZADO. El crudo es lo que se le
// muestra al usuario cuando algo no machea: si solo guardáramos el normalizado,
// nadie podría buscar la fila en el archivo original.
//
// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO
//
// No reduce los códigos a solo dígitos. Sería tentador —resolvería el caso de
// Excel de una— pero "A01" y "01A" colapsarían al mismo "01" y dos productos
// distintos quedarían macheados entre sí. Un match equivocado es peor que un no
// match: el no match se ve y se corrige a mano; el match equivocado le cambia el
// costo al producto que no era.
//
// Tampoco hay coincidencia por nombre: genera falsos positivos que nadie revisa.
//
// SÍ HAY COINCIDENCIA POR SUFIJO, Y ES DELIBERADAMENTE INCÓMODA
//
// El proveedor y el ERP suelen cargar el mismo producto con prefijos distintos
// —"3312" contra "1003312"— y sin un fallback esas filas quedan sin vincular
// para siempre. Pero comparar terminaciones es peligroso: cuantos menos dígitos,
// más productos distintos comparten el final.
//
// Por eso el fallback baja de a un dígito, de 8 a 4, y se DETIENE en la primera
// longitud que encuentra algo. Si esa longitud devuelve más de un candidato, la
// fila queda ambigua y NO se sigue bajando: bajar buscaría un empate más flojo
// todavía, y elegir entre dos candidatos sería adivinar a qué producto se le
// cambia el costo. Cuatro dígitos es el piso; por debajo no se intenta.
//
// Solo participan códigos COMPLETAMENTE NUMÉRICOS de los dos lados. Un "A3312"
// y un "1003312" no son el mismo producto por terminar igual.

/** Separadores y adornos que no distinguen un código de otro. */
const SEPARADORES = /[\s\-_.\/\\]+/g;

/**
 * El valor tal como vino, pasado a string sin interpretarlo.
 *
 * Los números de Excel se imprimen sin notación científica ni decimales
 * fantasma: `1234` es "1234", no "1234.0". Un número con decimales reales se
 * conserva con ellos, porque perderlos cambiaría el código.
 */
export function codigoCrudo(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    // Number.prototype.toString ya evita el ".0" de los enteros y solo usa
    // notación exponencial fuera del rango de cualquier código real.
    return String(valor);
  }
  if (typeof valor === "boolean") return "";
  return String(valor);
}

/**
 * Forma canónica para comparar: sin espacios, sin separadores, en mayúsculas.
 *
 * Las letras se CONSERVAN. Es la diferencia entre normalizar y mutilar.
 * Devuelve "" cuando no queda nada comparable — vacío, null, o una celda que
 * solo tenía guiones.
 */
export function normalizarCodigo(valor) {
  const crudo = codigoCrudo(valor);
  if (!crudo) return "";
  return crudo.trim().replace(SEPARADORES, "").toUpperCase();
}

/**
 * Variante SIN ceros iniciales, para el fallback controlado.
 *
 * Solo se aplica a códigos completamente numéricos. Un "0A1" conserva su cero:
 * si lo sacáramos quedaría "A1" y podría chocar contra un producto que de verdad
 * se llama A1 — exactamente la colisión que este módulo existe para evitar.
 *
 * Devuelve "" si el código no es numérico o si al sacar los ceros no queda nada
 * ("000" no habilita ningún fallback).
 */
export function codigoSinCerosIniciales(valor) {
  const norm = normalizarCodigo(valor);
  if (!norm) return "";
  if (!/^[0-9]+$/.test(norm)) return "";
  const sinCeros = norm.replace(/^0+/, "");
  return sinCeros === norm ? "" : sinCeros;
}

/**
 * Las tres formas de un código, juntas. Es lo que viaja por el resto del módulo:
 * el crudo para mostrar, el normalizado para machear, el sinCeros para el
 * fallback.
 */
export function clavesDeCodigo(valor) {
  return {
    crudo: codigoCrudo(valor),
    normalizado: normalizarCodigo(valor),
    sinCeros: codigoSinCerosIniciales(valor),
  };
}

// ── Sufijos numéricos ───────────────────────────────────────────────────────

/**
 * Longitudes que prueba el fallback, EN ESTE ORDEN.
 *
 * De más específica a menos. El orden no es decorativo: es lo que garantiza que
 * una coincidencia de 8 dígitos le gane a una de 4, que siempre es más probable
 * por azar.
 */
export const LONGITUDES_SUFIJO = [8, 7, 6, 5, 4];

/** Piso del fallback. Con menos de 4 dígitos no se intenta nada. */
export const MIN_DIGITOS_SUFIJO = 4;

/** ¿El código normalizado es solo dígitos? Los alfanuméricos no usan sufijo. */
export function esCodigoNumerico(valor) {
  const norm = normalizarCodigo(valor);
  return norm !== "" && /^[0-9]+$/.test(norm);
}

/**
 * Los últimos `n` dígitos de un código numérico.
 *
 * Devuelve "" cuando el código no es numérico o cuando tiene MENOS de `n`
 * dígitos. No se rellena con ceros a la izquierda: un código de 4 dígitos no es
 * "el mismo" que uno de 8 que empieza con ceros, y rellenar haría que un código
 * corto machee contra cualquier cosa que termine igual.
 */
export function sufijoNumerico(valor, n) {
  const norm = normalizarCodigo(valor);
  if (!norm || !/^[0-9]+$/.test(norm)) return "";
  const largo = Number(n);
  if (!Number.isInteger(largo) || largo < MIN_DIGITOS_SUFIJO) return "";
  if (norm.length < largo) return "";
  return norm.slice(-largo);
}

/**
 * Las longitudes que este código puede llegar a usar, ya ordenadas.
 *
 * Un código de 5 dígitos no puede intentar 8, 7 ni 6: no los tiene. Uno de 3 no
 * intenta nada.
 */
export function longitudesAplicables(valor) {
  const norm = normalizarCodigo(valor);
  if (!norm || !/^[0-9]+$/.test(norm)) return [];
  if (norm.length < MIN_DIGITOS_SUFIJO) return [];
  return LONGITUDES_SUFIJO.filter((n) => norm.length >= n);
}

/** Nombre del tipo de coincidencia para una longitud. `SUFIJO_6`, por ejemplo. */
export function tipoSufijo(n) {
  return `SUFIJO_${n}`;
}

/** ¿Hay algo con qué machear? Un código vacío no busca: se informa y listo. */
export function codigoUtilizable(valor) {
  return normalizarCodigo(valor) !== "";
}

/**
 * Índice de códigos del ERP para machear contra la lista.
 *
 * Registra cada producto bajo su forma normalizada y, cuando corresponde, bajo
 * la forma sin ceros. Un código normalizado que aparece más de una vez queda
 * marcado como DUPLICADO: no se elige uno, porque elegir sería adivinar.
 *
 * @param items    filas del ERP
 * @param leerCodigo  cómo sacar el código de cada fila
 */
export function indexarCodigos(items = [], leerCodigo = (x) => x?.codigo) {
  const exacto = new Map();
  const sinCeros = new Map();

  for (const item of items) {
    const { normalizado, sinCeros: sc } = clavesDeCodigo(leerCodigo(item));
    if (!normalizado) continue;

    if (!exacto.has(normalizado)) exacto.set(normalizado, []);
    exacto.get(normalizado).push(item);

    if (sc) {
      if (!sinCeros.has(sc)) sinCeros.set(sc, []);
      sinCeros.get(sc).push(item);
    }
  }

  return { exacto, sinCeros };
}

/** Resultado de una búsqueda: qué se encontró y por qué camino. */
export const MATCH = {
  EXACTO: "EXACTO",
  SIN_CEROS: "SIN_CEROS",
  DUPLICADO: "DUPLICADO",
  NINGUNO: "NINGUNO",
};

/**
 * Busca un código de la lista en el índice del ERP.
 *
 * El criterio PRINCIPAL es la coincidencia exacta normalizada. El fallback sin
 * ceros solo corre cuando la exacta no encontró nada, y está pensado para el
 * caso de Excel: la lista trae 1234 porque la celda era numérica, y el ERP tiene
 * 001234.
 *
 * Cualquiera de los dos caminos que dé más de un producto devuelve DUPLICADO con
 * todos los candidatos. Ambigüedad se informa, no se resuelve sola.
 */
export function buscarPorCodigo(indice, valor) {
  const claves = clavesDeCodigo(valor);
  if (!claves.normalizado) {
    return { tipo: MATCH.NINGUNO, item: null, candidatos: [], claves };
  }

  const porExacto = indice?.exacto?.get(claves.normalizado) ?? [];
  if (porExacto.length === 1) {
    return { tipo: MATCH.EXACTO, item: porExacto[0], candidatos: porExacto, claves };
  }
  if (porExacto.length > 1) {
    return { tipo: MATCH.DUPLICADO, item: null, candidatos: porExacto, claves };
  }

  // Fallback: el código de la lista SIN ceros contra el índice sin ceros, y
  // también contra el índice exacto —porque el que perdió los ceros puede ser
  // cualquiera de los dos lados—.
  const clave = claves.sinCeros || claves.normalizado;
  const porSinCeros = [
    ...(indice?.sinCeros?.get(clave) ?? []),
    ...(claves.sinCeros ? indice?.exacto?.get(claves.sinCeros) ?? [] : []),
  ];
  const unicos = [...new Set(porSinCeros)];

  if (unicos.length === 1) {
    return { tipo: MATCH.SIN_CEROS, item: unicos[0], candidatos: unicos, claves };
  }
  if (unicos.length > 1) {
    return { tipo: MATCH.DUPLICADO, item: null, candidatos: unicos, claves };
  }

  return { tipo: MATCH.NINGUNO, item: null, candidatos: [], claves };
}
