// lib/proveedores/listas/calculoCosto.js
//
// CONCILIACIÓN DE LISTAS DE PROVEEDOR — el cálculo del costo propuesto.
//
// Funciones puras. No leen la base, no escriben nada, no deciden si se aplica:
// solo calculan qué costo PROPONDRÍA la lista y cuánto se mueve respecto del
// costo actual. Aplicar es otra etapa.
//
// ── LAS DOS CIFRAS, SEPARADAS ────────────────────────────────────────────────
//
// Arcor informa PRECIO POR UNIDAD. El ERP guarda el costo maestro POR BULTO
// cuando el producto es un pack. Son dos números distintos y se devuelven por
// separado a propósito:
//
//   costoUnitarioCalculado : lo que sale de la lista + recargo, por unidad.
//   costoNuevoPropuesto    : ese costo llevado a la unidad en la que el ERP
//                            guarda el costo maestro de ESTE producto.
//
// El recargo se aplica sobre el precio unitario, antes de cualquier conversión.
// Mostrar los dos permite que el usuario verifique la cuenta: ve el unitario que
// le pasó el proveedor y ve en qué se convirtió.
//
// ── LA CONVERSIÓN NO SE REINVENTA ────────────────────────────────────────────
//
// La regla de "en qué unidad se guarda el costo maestro" ya existe y vive en
// lib/compras-proveedor/costoMaestro.js. Acá se DELEGA en `costoLineaAMaestro`
// en vez de reimplementarla: si mañana cambia la convención, cambia en un solo
// lugar y este módulo la sigue. Lo mismo con `naturalezaLinea`, que es quien
// sabe distinguir un fiambre de un kg de un pack.
//
// Las excepciones reales del ERP, tal como están hoy:
//   · FIAMBRE (modoCompraProveedor === "UNIDAD") → el costo se guarda por kg,
//     sin factor.
//   · KG (unidad_medida === "kg") → por kg, sin factor.
//   · PACK (factor_pack > 1) → por bulto: unitario × factor.
//   · UNIDAD suelta → por unidad, sin factor.
//
// ── PRECISIÓN ────────────────────────────────────────────────────────────────
//
// La multiplicación por el factor se hace a precisión COMPLETA y recién el
// resultado final se lleva a centavos enteros. Es el mismo criterio —y la misma
// expresión de redondeo— que `costoLineaAMaestro`: redondear el unitario antes
// de multiplicar arrastra el error por el factor y $1.480 termina siendo
// $1.479,96. El resultado monetario final es un entero de centavos; el valor en
// pesos se deriva de él, nunca al revés.

// Rutas relativas (no alias "@/") porque este módulo se prueba con `node --test`.
import { costoLineaAMaestro } from "../../compras-proveedor/costoMaestro.js";
import { naturalezaLinea } from "../../compras-proveedor/calculoPedido.js";

/** Umbral de variación de Arcor. Es un DEFAULT del proveedor, no una regla de
 *  la función: `calcularVariacion` lo recibe por parámetro. */
export const UMBRAL_VARIACION_ARCOR = 30;

/**
 * Motivos de BLOQUEO: la línea se calculó bien, pero no se puede aplicar.
 *
 * Son distintos de ERROR_COSTO. Un error es "no pude calcular"; un bloqueo es
 * "calculé, y aun así nadie debería escribir esto".
 */
export const MOTIVO_BLOQUEO = {
  /**
   * La lista informa PRECIO POR UNIDAD y el ERP guarda el costo POR KILO.
   *
   * Pasa con los productos kg y con los fiambres (modoCompraProveedor
   * "UNIDAD"). El número que manda el proveedor es el precio de una pieza; el
   * campo que el ERP quiere escribir es el precio de un kilo. No son la misma
   * magnitud y no hay forma honesta de pasar de uno al otro sin el peso real de
   * la pieza — y el peso de referencia es un promedio, no el peso de lo que
   * llegó. Con un fiambre de 3 kg, escribir el precio de la pieza como precio
   * del kilo es un error del 200 % en el costo, que después se propaga al precio
   * de venta por la regla de margen.
   *
   * Por eso se BLOQUEA en vez de advertir: una advertencia sobre cien filas se
   * saltea, y el daño es silencioso.
   */
  UNIDAD_INCOMPATIBLE: "UNIDAD_INCOMPATIBLE_CON_LISTA",
};

/** Texto del bloqueo, para la pantalla. */
export const TEXTO_BLOQUEO = {
  UNIDAD_INCOMPATIBLE_CON_LISTA:
    "La lista informa precio por unidad y este producto guarda el costo por kilo. No se puede convertir sin el peso real: cargalo a mano.",
};

/** Motivos por los que una línea no puede calcular su costo. */
export const ERROR_COSTO = {
  PRECIO_AUSENTE: "PRECIO_AUSENTE",
  PRECIO_INVALIDO: "PRECIO_INVALIDO",
  PRECIO_CERO: "PRECIO_CERO",
  PRECIO_NEGATIVO: "PRECIO_NEGATIVO",
  RECARGO_INVALIDO: "RECARGO_INVALIDO",
  FACTOR_FALTANTE: "FACTOR_FALTANTE",
};

// ── Dinero en centavos enteros ───────────────────────────────────────────────
//
// Mismo patrón que el resto del ERP (lib/caja, lib/transferencias) y misma
// expresión de redondeo que `costoLineaAMaestro`.

/**
 * Centavos enteros desde un importe en pesos. Lo que no es un importe → null.
 *
 * AUSENCIA NO ES CERO. `Number(null)` da 0 y `Number("")` también, así que un
 * producto sin costo cargado se leería como un producto que cuesta cero y la
 * variación saldría "de $0 a $1.200" en vez de "no hay con qué comparar". Son
 * dos cosas distintas y acá se distinguen: null, undefined, "" y los booleanos
 * son ausencia; el 0 explícito es un costo de cero.
 */
export function aCentavos(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "boolean") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.round((n + Number.EPSILON) * 100);
}

export function desdeCentavos(centavos) {
  if (!Number.isFinite(centavos)) return null;
  return centavos / 100;
}

/** El importe redondeado a moneda, pasando por centavos enteros. */
export function round2(valor) {
  const c = aCentavos(valor);
  return c === null ? null : desdeCentavos(c);
}

/** ¿Son el mismo importe? Se compara a DOS DECIMALES, que es la precisión en la
 *  que el costo maestro existe. 12.600 y 12.600,004 son el mismo costo. */
export function mismoCosto(a, b) {
  const ca = aCentavos(a);
  const cb = aCentavos(b);
  if (ca === null || cb === null) return false;
  return ca === cb;
}

// ── Naturaleza del producto ──────────────────────────────────────────────────

/** Unidades de medida que DECLARAN que el producto se maneja como bulto.
 *  Mismo conjunto que usa `defaultModoEnvio` en lib/conversiones/stock.js. */
// "caja" y "carton" no están en el enum `UnidadMedida`: eran ramas muertas.
const UNIDADES_BULTO = new Set(["pack", "cajon"]);

/**
 * ¿El costo maestro de este producto se guarda POR BULTO?
 *
 * Dos caminos, y alcanza con uno:
 *   · ya tiene `factor_pack > 1` — es lo que mira `naturalezaLinea`;
 *   · su unidad de medida declara un bulto (pack, cajón…) aunque el factor esté
 *     mal cargado. Este segundo caso es el que hace falta para poder detectar el
 *     factor dudoso: si solo miráramos el factor, un pack sin factor se vería
 *     como una unidad suelta y nadie se enteraría.
 *
 * Fiambre y kg quedan afuera SIEMPRE: su costo se guarda por kg, sin factor.
 */
export function requiereConversionABulto(base) {
  const naturaleza = naturalezaLinea(base);
  if (naturaleza === "FIAMBRE" || naturaleza === "KG") return false;
  if (naturaleza === "PACK") return true;
  const um = String(base?.unidad_medida ?? "").toLowerCase();
  return UNIDADES_BULTO.has(um);
}

/**
 * ¿La unidad que informa la lista es incompatible con la unidad en la que este
 * producto guarda su costo?
 *
 * Devuelve el motivo del bloqueo, o `null` si son compatibles. Es el predicado
 * que la clasificación consulta: no depende de ningún peso ni de ninguna
 * conversión aproximada, solo de qué unidad guarda cada cosa.
 *
 * @param base            producto del ERP
 * @param unidadLista     unidad en la que informa el proveedor. "UNIDAD" es lo
 *                        que manda Arcor y es el default.
 */
export function bloqueoPorUnidad(base, unidadLista = "UNIDAD") {
  if (String(unidadLista).toUpperCase() !== "UNIDAD") return null;
  const naturaleza = naturalezaLinea(base);
  // Los dos casos en los que `costoLineaAMaestro` guarda POR KILO.
  if (naturaleza === "FIAMBRE" || naturaleza === "KG") {
    return MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE;
  }
  return null;
}

/** ¿El factor sirve para convertir? Tiene que ser un entero mayor que 1. */
export function factorValido(factorPack) {
  const f = Number(factorPack);
  return Number.isFinite(f) && f > 1;
}

/**
 * ¿Le falta el factor a un producto que lo NECESITA?
 *
 * Un producto que se vende y se almacena por unidad NO es dudoso por tener el
 * factor nulo: no lo necesita para nada. Dudoso es el pack sin factor, que sí
 * tiene que convertir y no puede.
 */
export function factorDudoso(base) {
  return requiereConversionABulto(base) && !factorValido(base?.factor_pack);
}

// ── El cálculo ───────────────────────────────────────────────────────────────

/**
 * Precio unitario con el recargo aplicado, a PRECISIÓN COMPLETA.
 *
 * Sin redondear: este número es un paso intermedio y redondearlo acá es lo que
 * produce el peso de diferencia después de multiplicar por el factor.
 */
export function aplicarRecargo(precioLista, recargoPct = 0) {
  const precio = Number(precioLista);
  const recargo = Number(recargoPct);
  if (!Number.isFinite(precio) || !Number.isFinite(recargo)) return null;
  return precio * (1 + recargo / 100);
}

/**
 * El costo que la lista propone para un producto.
 *
 * @param base         producto del ERP: { unidad_medida, factor_pack,
 *                     modoCompraProveedor, … }
 * @param precioLista  precio POR UNIDAD informado por el proveedor
 * @param recargoPct   recargo del proveedor, en porcentaje (0 = sin recargo)
 * @param unidadLista  unidad en la que informa el proveedor (Arcor: "UNIDAD")
 *
 * Devuelve siempre la misma forma. `error` en null significa que el cálculo
 * pudo hacerse; con error, los costos vienen en null y nadie tiene que
 * inventarlos. `motivoBloqueo` es aparte: el cálculo salió, pero la línea no se
 * puede aplicar.
 */
export function calcularCostoPropuesto({
  base,
  precioLista,
  recargoPct = 0,
  unidadLista = "UNIDAD",
} = {}) {
  const naturaleza = naturalezaLinea(base);
  const requiereFactor = requiereConversionABulto(base);
  const factorOk = factorValido(base?.factor_pack);
  const factorAplicado = requiereFactor && factorOk ? Number(base.factor_pack) : 1;

  const vacio = {
    costoUnitarioCalculado: null,
    costoUnitarioExacto: null,
    costoNuevoPropuesto: null,
    costoNuevoPropuestoCentavos: null,
    naturaleza,
    requiereFactor,
    factorValido: factorOk,
    factorAplicado: null,
    // El costo se guarda en una unidad distinta de la que informa el proveedor:
    // kg contra unidad. Se informa como dato…
    unidadDistintaDeLaLista: naturaleza === "FIAMBRE" || naturaleza === "KG",
    // …y como MOTIVO DE BLOQUEO, que es lo que la clasificación mira. El costo
    // se sigue calculando —sirve para mostrar de dónde salía el número— pero la
    // línea no puede aplicarse. Ver MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE.
    motivoBloqueo: bloqueoPorUnidad(base, unidadLista),
    error: null,
  };

  if (precioLista === null || precioLista === undefined || precioLista === "") {
    return { ...vacio, error: ERROR_COSTO.PRECIO_AUSENTE };
  }
  const precio = Number(precioLista);
  if (!Number.isFinite(precio)) return { ...vacio, error: ERROR_COSTO.PRECIO_INVALIDO };
  if (precio === 0) return { ...vacio, error: ERROR_COSTO.PRECIO_CERO };
  if (precio < 0) return { ...vacio, error: ERROR_COSTO.PRECIO_NEGATIVO };

  const recargo = Number(recargoPct ?? 0);
  if (!Number.isFinite(recargo)) return { ...vacio, error: ERROR_COSTO.RECARGO_INVALIDO };

  const unitarioExacto = aplicarRecargo(precio, recargo);
  if (unitarioExacto === null || !Number.isFinite(unitarioExacto) || unitarioExacto <= 0) {
    return { ...vacio, error: ERROR_COSTO.PRECIO_INVALIDO };
  }

  // Un pack sin factor no puede convertir. No se asume 1 —asumir 1 guardaría el
  // costo de UNA unidad como si fuera el del bulto entero, que es un error de
  // varios cientos por ciento— y no se calcula nada.
  if (requiereFactor && !factorOk) {
    return {
      ...vacio,
      costoUnitarioCalculado: round2(unitarioExacto),
      costoUnitarioExacto: unitarioExacto,
      error: ERROR_COSTO.FACTOR_FALTANTE,
    };
  }

  // La conversión la decide el ERP, no este módulo. `unidad: "UNIDAD"` porque el
  // precio de la lista es por unidad; `costoLineaAMaestro` resuelve el resto:
  // fiambre y kg sin factor, pack por bulto, unidad suelta sin tocar.
  const maestro = costoLineaAMaestro({
    precioCosto: unitarioExacto,
    unidad: "UNIDAD",
    factorPack: base?.factor_pack,
    modoCompraProveedor: base?.modoCompraProveedor,
    unidadMedida: base?.unidad_medida,
  });

  if (maestro === null) return { ...vacio, error: ERROR_COSTO.PRECIO_INVALIDO };

  const centavos = aCentavos(maestro);
  return {
    ...vacio,
    costoUnitarioCalculado: round2(unitarioExacto),
    costoUnitarioExacto: unitarioExacto,
    costoNuevoPropuesto: desdeCentavos(centavos),
    costoNuevoPropuestoCentavos: centavos,
    factorAplicado,
    error: null,
  };
}

// ── Variación ────────────────────────────────────────────────────────────────

/**
 * Cuánto se mueve el costo, en pesos y en porcentaje.
 *
 * El umbral entra POR PARÁMETRO: esta función no sabe nada de Arcor. El 30 % es
 * el default de ese proveedor y vive en `UMBRAL_VARIACION_ARCOR`, para que otro
 * proveedor pueda tener el suyo sin tocar el cálculo.
 *
 * Una variación alta es una ADVERTENCIA: se marca y se sigue. Bloquear por
 * porcentaje obligaría a editar a mano cada aumento real del proveedor.
 *
 * Con costo anterior CERO no hay porcentaje posible —dividir por cero no da
 * infinito útil, da un número que nadie puede leer— así que se devuelve
 * `porcentajeIndefinido: true`, `diferenciaPct: null` y la diferencia en pesos,
 * que sí existe.
 */
export function calcularVariacion({ costoAnterior, costoNuevo, umbralPct } = {}) {
  const antesC = aCentavos(costoAnterior);
  const nuevoC = aCentavos(costoNuevo);
  const umbral = Number(umbralPct);

  const vacio = {
    diferencia: null,
    diferenciaCentavos: null,
    diferenciaPct: null,
    variacionAlta: false,
    porcentajeIndefinido: false,
    costoAnteriorCero: false,
    umbralAplicado: Number.isFinite(umbral) ? umbral : null,
  };

  if (antesC === null || nuevoC === null) return vacio;

  const difC = nuevoC - antesC;
  const diferencia = desdeCentavos(difC);

  if (antesC === 0) {
    // No hay base contra la cual medir. La diferencia en pesos sigue siendo
    // información válida; el porcentaje, no.
    return {
      ...vacio,
      diferencia,
      diferenciaCentavos: difC,
      diferenciaPct: null,
      porcentajeIndefinido: true,
      costoAnteriorCero: true,
      // Estrenar un costo desde cero merece que alguien mire, sea cual sea el
      // umbral: no es un aumento, es un alta.
      variacionAlta: difC !== 0,
    };
  }

  const diferenciaPct = (difC / antesC) * 100;
  const variacionAlta = Number.isFinite(umbral) && Math.abs(diferenciaPct) >= umbral;

  return {
    ...vacio,
    diferencia,
    diferenciaCentavos: difC,
    diferenciaPct,
    variacionAlta,
  };
}
