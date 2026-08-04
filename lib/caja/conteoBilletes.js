// lib/caja/conteoBilletes.js
//
// Contar el cajón por denominación y elegir qué billetes salen.
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

export const MODO_TOTAL = "TOTAL";
export const MODO_BILLETES = "BILLETES";

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

/**
 * ¿El desglose de billetes coincide con el monto escrito a mano?
 *
 * Cuando el cajero pasa de "contar billetes" a "monto total" y edita el número,
 * los dos valores pueden divergir. Eso NO se puede sostener en silencio: o se
 * corrige, o se limpia el desglose. Esta función solo lo detecta.
 */
export function desgloseCoincide(desglose, montoTotal) {
  return aCentavos(totalDesglose(desglose)) === aCentavos(montoTotal);
}

/**
 * Validación del retiro por billetes contra lo contado.
 *
 * Dos reglas distintas, y la segunda es la que importa:
 *
 *  1. no se puede retirar más plata de la que hay;
 *  2. no se pueden retirar 5 billetes de $10.000 si en el conteo se declararon
 *     3. Sacar del cajón un billete que no está es imposible, y el sistema no
 *     debería dejar registrarlo. Esta regla SOLO aplica cuando los dos
 *     desgloses existen: si el conteo se hizo por monto total, no hay contra
 *     qué comparar y no se inventa una restricción.
 */
export function validarRetiroPorBilletes({ desgloseContado, desgloseRetiro, totalContado } = {}) {
  const excesos = [];
  const hayConteoDetallado = desgloseContado && !desgloseVacio(desgloseContado);

  if (hayConteoDetallado) {
    for (const { valor, etiqueta } of DENOMINACIONES) {
      const contados = normalizarCantidad(desgloseContado[valor]);
      const aRetirar = normalizarCantidad(desgloseRetiro?.[valor]);
      if (aRetirar > contados) {
        excesos.push({ valor, etiqueta, contados, aRetirar });
      }
    }
    const monedasContadas = Number(desgloseContado[CLAVE_MONEDAS]) || 0;
    const monedasRetiro = Number(desgloseRetiro?.[CLAVE_MONEDAS]) || 0;
    if (aCentavos(monedasRetiro) > aCentavos(monedasContadas)) {
      excesos.push({
        valor: CLAVE_MONEDAS,
        etiqueta: "Monedas / otros",
        contados: monedasContadas,
        aRetirar: monedasRetiro,
      });
    }
  }

  if (excesos.length) {
    const cuales = excesos
      .map((e) => `${e.etiqueta} (contaste ${e.contados}, querés retirar ${e.aRetirar})`)
      .join("; ");
    return {
      valido: false,
      error: `No podés retirar más billetes de los que contaste: ${cuales}.`,
      excesos,
    };
  }

  const totalRetiro = totalDesglose(desgloseRetiro);
  if (totalContado !== undefined && aCentavos(totalRetiro) > aCentavos(totalContado)) {
    return {
      valido: false,
      error: "No podés retirar más de lo que hay en el cajón.",
      excesos: [],
    };
  }

  return { valido: true, error: null, excesos: [], totalRetiro };
}

/** Suma o resta una unidad a una fila, sin bajar de cero. */
export function ajustarCantidad(desglose = {}, clave, delta) {
  const actual = normalizarCantidad(desglose[clave]);
  return { ...desglose, [clave]: Math.max(0, actual + delta) };
}

/** Fondo físico que queda: contado − retirado. Nunca negativo. */
export function fondoFisicoRestante(totalContado, totalRetiro) {
  return desdeCentavos(Math.max(0, aCentavos(totalContado) - aCentavos(totalRetiro)));
}
