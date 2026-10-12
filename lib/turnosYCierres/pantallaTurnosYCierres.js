// lib/turnosYCierres/pantallaTurnosYCierres.js
//
// QUÉ DICE LA PANTALLA DE "TURNOS Y CIERRES", sin dibujar nada. Puro: recibe lo
// que mandó el servidor y decide textos y tonos. No suma plata: la única cuenta
// que se hace acá es contar cajas.

import { ESTADO_TURNO, TEXTO_SIN_CONTAR } from "../caja/cierreRelevo.js";
import { diaMesAR } from "../fechas/formatearFechaHora.js";
import { formatearMoneda } from "../moneda.js";
import { franjaHoraria, textoFaltaSobra } from "../tesoreria/pantallaTesoreria.js";
import { RESULTADO_CAJA } from "./lecturaTurnosYCierres.js";

export const RUTA_TURNOS_Y_CIERRES = "/modulos/turnos-y-cierres";
export const URL_API_TURNOS_Y_CIERRES = "/api/turnos-y-cierres";

/** Los tonos, como clases semánticas del tema. */
export const CLASE_TONO = Object.freeze({
  success: "sunmi-text-success",
  danger: "sunmi-text-danger",
  warning: "sunmi-text-warning",
  muted: "sunmi-text-muted",
  strong: "sunmi-text-strong",
});

// Un día de calendario "AAAA-MM-DD" se ubica al mediodía argentino: a la
// medianoche UTC caería en el día anterior.
const alMediodia = (iso) => (iso ? `${iso}T12:00:00-03:00` : null);

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "Dom 11/10": el día de un turno o de una caja. */
export function rotuloDeDia(iso) {
  const instante = alMediodia(iso);
  if (!instante) return "";
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return "";
  // El día de la semana del calendario, sin zona: el ISO ya es el día argentino.
  const semana = DIAS_CORTOS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${semana} ${diaMesAR(instante)}`;
}

export const cantidadDeCajas = (n) => `${n} ${n === 1 ? "caja" : "cajas"}`;

/** "00:06 a 08:02", o "desde 16:00" mientras quede una caja abierta. */
export function horarioDelGrupo(g) {
  if (g?.abiertas > 0) return g.horario?.desde ? `desde ${franjaHoraria(g.horario.desde, null)}` : "";
  return franjaHoraria(g?.horario?.desde, g?.horario?.hasta);
}

/** El renglón de abajo del nombre del turno. Con varios días, el día va primero. */
export function subtituloDelGrupo(g, { conDia = false } = {}) {
  return [
    conDia ? rotuloDeDia(g.dia) : null,
    horarioDelGrupo(g) || null,
    cantidadDeCajas(g.cantidadCajas),
    g.abiertas > 0 ? `${g.abiertas} ${g.abiertas === 1 ? "abierta" : "abiertas"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Las diferencias de un turno: cuántas cajas faltan y cuántas sobran. Nunca un
 * importe: sumar un faltante con un sobrante escondería los dos.
 *
 * @returns {{texto:string, tono:string}|null} null si ninguna caja cerró
 */
export function diferenciasDelGrupo(g) {
  const d = g?.diferencias;
  if (!d || d.cerradas === 0) return null;
  const partes = [];
  if (d.faltan) partes.push(`${d.faltan} falta${d.faltan === 1 ? "" : "n"}`);
  if (d.sobran) partes.push(`${d.sobran} sobra${d.sobran === 1 ? "" : "n"}`);
  if (partes.length) return { texto: partes.join(" · "), tono: d.faltan ? "danger" : "warning" };
  if (d.sinConteo === d.cerradas) return { texto: TEXTO_SIN_CONTAR, tono: "muted" };
  return { texto: "Sin diferencia", tono: "success" };
}

/** La diferencia de UNA caja, con su signo en el texto. */
export function diferenciaDeCaja(c) {
  switch (c?.resultado) {
    case RESULTADO_CAJA.SIN_DIFERENCIA:
      return { texto: "Sin diferencia", tono: "success" };
    case RESULTADO_CAJA.FALTA:
      return { texto: textoFaltaSobra(c.diferencia), tono: "danger" };
    case RESULTADO_CAJA.SOBRA:
      return { texto: textoFaltaSobra(c.diferencia), tono: "warning" };
    case RESULTADO_CAJA.SIN_CONTEO:
      return { texto: TEXTO_SIN_CONTAR, tono: "muted" };
    default:
      return null;
  }
}

/** La diferencia grande del detalle: "−$1.500,00 · Falta" o "Sin diferencia". */
export function diferenciaGrande(c) {
  const d = diferenciaDeCaja(c);
  if (d) return d;
  return { texto: c?.estado === ESTADO_TURNO.CIERRE_EN_PREPARACION ? "En cierre" : "Caja abierta", tono: "muted" };
}

/** La insignia del estado de una caja. */
export function estadoDeCaja(c) {
  if (c?.estado === ESTADO_TURNO.CERRADO) return { texto: "Cerrada", tono: "success" };
  if (c?.estado === ESTADO_TURNO.CIERRE_EN_PREPARACION) return { texto: "En cierre", tono: "warning" };
  return { texto: "Abierta", tono: "warning" };
}

export const esCerrada = (c) => c?.estado === ESTADO_TURNO.CERRADO;

/** "Ganancia" en verde si es positiva; el resto, en el tono fuerte. */
export const tonoDeGanancia = (n) => (Number(n) > 0 ? "success" : Number(n) < 0 ? "danger" : "strong");

export const plata = (n) => formatearMoneda(n);

/** La dirección del detalle de una caja, con el período de la lista para volver. */
export function urlDeCaja(id, qs = "") {
  return `${RUTA_TURNOS_Y_CIERRES}/cajas/${id}${qs ? `?${qs}` : ""}`;
}

export function urlDelZ(id, qs = "") {
  return `${RUTA_TURNOS_Y_CIERRES}/cajas/${id}/z${qs ? `?${qs}` : ""}`;
}

export function urlDeLaLista(qs = "") {
  return qs ? `${RUTA_TURNOS_Y_CIERRES}?${qs}` : RUTA_TURNOS_Y_CIERRES;
}
