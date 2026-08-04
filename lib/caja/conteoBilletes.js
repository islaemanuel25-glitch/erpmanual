// lib/caja/conteoBilletes.js
//
// Contar el cajón por denominación y elegir QUÉ QUEDA COMO CAMBIO.
//
// EL SENTIDO DE LA OPERACIÓN
//
// El cajero no decide cuánto retirar: decide qué billetes y monedas deja en el
// cajón para poder seguir dando vuelto. Todo lo demás se retira. El importe del
// retiro es una CONSECUENCIA aritmética, no una elección:
//
//     retiro = efectivo contado − cambio que queda
//
// Por eso acá no hay "billetes a retirar". Pedirle a alguien que arme el fajo
// que se lleva es pedirle la resta mental que la máquina puede hacer sola, y
// además no es lo que hace físicamente: agarra el cambio, lo deja, y el resto
// sale. Tampoco existe un importe objetivo que haya que alcanzar exacto: si con
// los billetes que hay quedan $30.200 y no $30.000, queda $30.200.
//
// Es PURO: sin base, sin Prisma, sin HTTP. La aritmética que decide cuánta plata
// hay y cuánta se lleva se prueba sin levantar nada.
//
// NO redefine las fórmulas monetarias. El efectivo esperado sigue viviendo en
// efectivoEsperado.js y el retiro sugerido en retiroDinero.js —derivado del
// ESPERADO, no del contado—. Acá solo se traduce "cuántos billetes de cada uno"
// a un importe.
//
// ARITMÉTICA: todo en CENTAVOS ENTEROS. Las denominaciones son enteras, pero
// "Monedas / otros" se carga a mano y admite decimales.

import { aCentavos, desdeCentavos } from "./efectivoEsperado.js";

/**
 * Denominaciones en circulación en Argentina (BCRA), de mayor a menor.
 *
 * NO existe billete de $5.000: el BCRA emitió $2.000 (2023), $10.000 y $20.000
 * (2024), sobre la familia previa de $100/$200/$500/$1.000. Agregarlo sería
 * inventar una fila que el cajero nunca va a usar y que ensucia el conteo.
 *
 * Los billetes por debajo de $100 se agrupan en "Monedas / otros": con los
 * importes actuales, contar monedas de $10 una por una no aporta.
 */
export const DENOMINACIONES = [
  { valor: 20000, etiqueta: "$20.000" },
  { valor: 10000, etiqueta: "$10.000" },
  { valor: 2000, etiqueta: "$2.000" },
  { valor: 1000, etiqueta: "$1.000" },
  { valor: 500, etiqueta: "$500" },
  { valor: 200, etiqueta: "$200" },
  { valor: 100, etiqueta: "$100" },
];

/** Clave de la fila suelta: no es una denominación, es un importe libre. */
export const CLAVE_MONEDAS = "monedas";

/** Cantidad de billetes: entero >= 0. Cualquier otra cosa es 0. */
export function normalizarCantidad(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Subtotal de una fila de billetes. */
export function subtotalDenominacion(valor, cantidad) {
  return desdeCentavos(aCentavos(valor) * normalizarCantidad(cantidad));
}

/**
 * Total de un desglose `{ 20000: 2, 10000: 3, monedas: 350.50 }`.
 *
 * "Monedas / otros" entra como IMPORTE, no como cantidad: es la bolsa de todo
 * lo que no vale la pena contar por unidad.
 */
export function totalDesglose(desglose = {}) {
  let cent = 0;
  for (const { valor } of DENOMINACIONES) {
    cent += aCentavos(valor) * normalizarCantidad(desglose[valor]);
  }
  const sueltos = Number(desglose[CLAVE_MONEDAS]);
  if (Number.isFinite(sueltos) && sueltos > 0) cent += aCentavos(sueltos);
  return desdeCentavos(cent);
}

/** Filas listas para pintar, con su subtotal. */
export function filasDesglose(desglose = {}) {
  return DENOMINACIONES.map(({ valor, etiqueta }) => {
    const cantidad = normalizarCantidad(desglose[valor]);
    return { valor, etiqueta, cantidad, subtotal: subtotalDenominacion(valor, cantidad) };
  });
}

/** ¿Hay algo cargado? Sirve para saber si el desglose es real o está vacío. */
export function desgloseVacio(desglose = {}) {
  return aCentavos(totalDesglose(desglose)) === 0;
}

/** Importe suelto de "Monedas / otros": número >= 0, con decimales. */
export function normalizarMonedas(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * ¿El cambio elegido cabe en lo que se contó?
 *
 * Dos reglas, y la segunda es la que de verdad protege:
 *
 *  1. no puede quedar más plata de la que hay en el cajón;
 *  2. no pueden quedar 5 billetes de $10.000 si en el conteo se declararon 3.
 *     Dejar en el cajón un billete que no está es imposible. Esta regla SOLO
 *     aplica cuando el conteo se hizo billete por billete: si se cargó un monto
 *     total, no hay contra qué comparar por denominación y no se inventa una
 *     restricción — queda solo el tope del total.
 *
 * "Monedas / otros" se compara como importe, no como cantidad.
 */
export function validarCambioQueQueda({ desgloseContado, desgloseCambio, totalContado } = {}) {
  const excesos = [];
  const hayConteoDetallado = desgloseContado && !desgloseVacio(desgloseContado);

  if (hayConteoDetallado) {
    for (const { valor, etiqueta } of DENOMINACIONES) {
      const contadas = normalizarCantidad(desgloseContado[valor]);
      const quedan = normalizarCantidad(desgloseCambio?.[valor]);
      if (quedan > contadas) excesos.push({ valor, etiqueta, contadas, quedan });
    }
    const monedasContadas = normalizarMonedas(desgloseContado[CLAVE_MONEDAS]);
    const monedasQuedan = normalizarMonedas(desgloseCambio?.[CLAVE_MONEDAS]);
    if (aCentavos(monedasQuedan) > aCentavos(monedasContadas)) {
      excesos.push({
        valor: CLAVE_MONEDAS,
        etiqueta: "Monedas / otros",
        contadas: monedasContadas,
        quedan: monedasQuedan,
      });
    }
  }

  if (excesos.length) {
    const cuales = excesos
      .map((e) => `${e.etiqueta} (contaste ${e.contadas}, querés dejar ${e.quedan})`)
      .join("; ");
    return { valido: false, error: `No podés dejar más de lo que contaste: ${cuales}.`, excesos };
  }

  const totalCambio = totalDesglose(desgloseCambio);
  const tope = totalContado === undefined ? null : aCentavos(totalContado);
  if (tope !== null && aCentavos(totalCambio) > tope) {
    return {
      valido: false,
      error: "No puede quedar más cambio que el efectivo contado.",
      excesos: [],
    };
  }

  return { valido: true, error: null, excesos: [], totalCambio };
}

/**
 * Filas para la grilla del cambio: cuánto se contó y cuánto queda de cada una.
 *
 * Mostrar las dos columnas juntas es lo que hace evidente el tope. Sin la
 * cantidad contada al lado, "no podés dejar 5" es una regla que aparece de la
 * nada.
 */
export function filasCambio({ desgloseContado, desgloseCambio } = {}) {
  const hayConteoDetallado = desgloseContado && !desgloseVacio(desgloseContado);
  return DENOMINACIONES.map(({ valor, etiqueta }) => {
    const contadas = normalizarCantidad(desgloseContado?.[valor]);
    const quedan = normalizarCantidad(desgloseCambio?.[valor]);
    return {
      valor,
      etiqueta,
      contadas: hayConteoDetallado ? contadas : null,
      quedan,
      subtotalQueda: subtotalDenominacion(valor, quedan),
      excede: hayConteoDetallado && quedan > contadas,
    };
  });
}

/**
 * Recorta el cambio para que nunca supere el conteo.
 *
 * Se usa cuando el conteo cambia DESPUÉS de haber elegido el cambio: si alguien
 * contó 5 billetes de $10.000, dejó 4, y después corrige el conteo a 2, no puede
 * quedar un cambio de 4 billetes que ya no existen.
 */
export function limitarCambioAlConteo(desgloseCambio = {}, desgloseContado = {}) {
  if (desgloseVacio(desgloseContado)) return { ...desgloseCambio };
  const salida = { ...desgloseCambio };
  for (const { valor } of DENOMINACIONES) {
    const contadas = normalizarCantidad(desgloseContado[valor]);
    const quedan = normalizarCantidad(salida[valor]);
    if (quedan > contadas) salida[valor] = contadas;
  }
  const monedasContadas = normalizarMonedas(desgloseContado[CLAVE_MONEDAS]);
  const monedasQuedan = normalizarMonedas(salida[CLAVE_MONEDAS]);
  if (aCentavos(monedasQuedan) > aCentavos(monedasContadas)) {
    salida[CLAVE_MONEDAS] = monedasContadas;
  }
  return salida;
}

/** Suma o resta una unidad a una fila, sin bajar de cero. */
export function ajustarCantidad(desglose = {}, clave, delta) {
  const actual = normalizarCantidad(desglose[clave]);
  return { ...desglose, [clave]: Math.max(0, actual + delta) };
}

/**
 * Lo que se retira: todo lo contado menos el cambio que queda.
 *
 * Nunca negativo. Si el cambio elegido igualara o superara lo contado, no hay
 * recaudación para sacar y el retiro es cero — la pantalla bloquea ahí, no
 * registra un retiro vacío.
 */
export function calcularRetiroDesdeCambio({ efectivoContado, cambioQueQueda } = {}) {
  const contado = aCentavos(efectivoContado);
  const cambio = Math.max(0, aCentavos(cambioQueQueda));
  return desdeCentavos(Math.max(0, contado - cambio));
}

