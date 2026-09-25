// lib/semanaOperativa/textos.js
//
// LO QUE LA PANTALLA DICE DE UNA SEMANA, EN CASTELLANO. Puro.
//
// La pregunta que la pantalla hace es "¿qué día empieza tu semana?", así que acá
// nunca aparece un `diaDeCorte` con su número: sale siempre como nombre de día
// ("Domingo a sábado", "domingo 04/10/2026").
//
// No hay un calendario propio. Los días salen de `nombreDelDia` y `diaDeLaSemana`
// (`lib/transferencias/periodoDePago.js`), los rangos de `rangoEnLargo`
// (`lib/transferencias/descripcionDelPeriodo.js`) y la fecha de `diaLegible`
// (`lib/fechas/diaISO.js`): las tres trabajan sobre el día ISO sin pasar por
// `Date`, así que la zona argentina no puede correr un domingo al sábado.

import { DIAS, diaDeLaSemana, nombreDelDia, abreviaturaDelDia } from "@/lib/transferencias/periodoDePago";
import { rangoEnLargo } from "@/lib/transferencias/descripcionDelPeriodo";
import { diaLegible } from "@/lib/fechas/diaISO";

/** Las siete opciones del selector, en el orden de la semana. */
export const OPCIONES_DE_DIA = Object.freeze(
  DIAS.map((d) => ({ clave: String(d.valor), texto: abreviaturaDelDia(d.valor) }))
);

/** "Domingo a sábado": la semana que empieza ese día, de punta a punta. */
export function nombreDeLaSemana(diaDeCorte) {
  const inicio = Number(diaDeCorte);
  return `${nombreDelDia(inicio)} a ${nombreDelDia((inicio + 6) % 7).toLowerCase()}`;
}

/** "domingo 04/10/2026". */
export function diaConFecha(iso) {
  if (!iso) return "";
  return `${nombreDelDia(diaDeLaSemana(iso)).toLowerCase()} ${diaLegible(iso)}`;
}

/** "Esta semana: dom 20 al sáb 26 de septiembre". */
export function textoDeEstaSemana(semana) {
  return semana ? `Esta semana: ${rangoEnLargo(semana)}` : "";
}

/**
 * Lo que dice la tarjeta de un cambio programado:
 *   { titulo: "Desde el domingo 04/10/2026",
 *     detalle: "Transición: dom 4 al mar 13 de octubre · Después: miércoles a martes" }
 */
export function textoDelProgramado(programado) {
  if (!programado) return null;
  const despues = `Después: ${nombreDeLaSemana(programado.diaDeCorte).toLowerCase()}`;
  return {
    semana: nombreDeLaSemana(programado.diaDeCorte),
    titulo: `Desde el ${diaConFecha(programado.desde)}`,
    detalle: programado.transicion ? `Transición: ${rangoEnLargo(programado.transicion)} · ${despues}` : despues,
  };
}

/**
 * LA CONFIRMACIÓN, renglón por renglón, a partir de `previsualizarCambio`.
 * Nada escrito a mano: cada día y cada fecha salen del cálculo.
 *
 * @param {object} previa   el resultado ok de `previsualizarCambio`
 * @param {string} nombre   la ubicación, para el título
 * @param {object|null} programado  el cambio que se va a reemplazar, si hay
 */
export function confirmacionDelCambio(previa, nombre, programado = null) {
  if (!previa?.ok) return null;
  if (previa.accion === "PRIMERA") {
    return {
      titulo: `¿Configurar la semana de ${nombre}?`,
      puntos: [
        `La semana va a ir de ${nombreDeLaSemana(previa.despues.diaDeCorte).toLowerCase()}.`,
        `Esta semana queda: ${rangoEnLargo(previa.despues)}.`,
        "Rige desde ya: esta ubicación todavía no tenía su semana configurada.",
      ],
    };
  }
  const puntos = [`Hoy tu semana va de ${nombreDeLaSemana(previa.actual.diaDeCorte).toLowerCase()}.`];
  if (programado) {
    puntos.push(
      `Reemplaza el cambio que ya estaba programado: la semana de ${nombreDeLaSemana(programado.diaDeCorte).toLowerCase()} desde el ${diaConFecha(programado.desde)}.`
    );
  }
  puntos.push(`El cambio empieza el ${diaConFecha(previa.desde)}.`);
  if (previa.transicion) {
    puntos.push(`La semana de transición será del ${rangoEnLargo(previa.transicion)}.`);
  }
  puntos.push(`Después será de ${nombreDeLaSemana(previa.despues.diaDeCorte).toLowerCase()}.`);
  puntos.push("Las semanas anteriores no cambian.");
  return { titulo: `¿Cambiar la semana de ${nombre}?`, puntos };
}

/** La confirmación de cancelar: dice qué se cancela y qué queda. */
export function confirmacionDeCancelar(programado, semanaActual) {
  if (!programado) return null;
  return {
    titulo: "¿Cancelar el cambio programado?",
    puntos: [
      `Se cancela el cambio a la semana de ${nombreDeLaSemana(programado.diaDeCorte).toLowerCase()} que empezaba el ${diaConFecha(programado.desde)}.`,
      `Tu semana sigue siendo de ${nombreDeLaSemana(semanaActual.diaDeCorte).toLowerCase()}.`,
      "No se toca ninguna semana que ya empezó: solo se cancela algo que todavía no pasó.",
    ],
  };
}
