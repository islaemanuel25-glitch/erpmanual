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

/**
 * EL COLOR DE CADA MEDIO en la barra de "Cómo se cobró": un token del tema por
 * medio, pintado con `bg-current`, así la barra cambia con los catorce temas.
 */
export const TONO_DE_MEDIO = Object.freeze({
  EFECTIVO: "sunmi-text-success",
  MERCADOPAGO: "sunmi-text-accent",
  DEBITO: "sunmi-text-link",
  CREDITO: "sunmi-text-warning",
  FIADO: "sunmi-text-muted",
});
export const tonoDeMedio = (medio) => TONO_DE_MEDIO[medio] || "sunmi-text-strong";

/**
 * Los medios con su porcentaje sobre el total que se pasa, redondeado a entero
 * y repartido para que sumen 100 (el resto va a los de mayor fracción).
 */
export function conPorcentajes(medios = []) {
  const lista = (medios || []).filter((m) => Number(m.monto) > 0);
  const total = lista.reduce((s, m) => s + Number(m.monto), 0);
  if (total <= 0) return [];
  const crudos = lista.map((m) => (Number(m.monto) * 100) / total);
  const enteros = crudos.map(Math.floor);
  let falta = 100 - enteros.reduce((s, n) => s + n, 0);
  const orden = crudos.map((c, i) => ({ i, f: c - Math.floor(c) })).sort((a, b) => b.f - a.f);
  for (const { i } of orden) {
    if (falta <= 0) break;
    enteros[i] += 1;
    falta -= 1;
  }
  return lista.map((m, i) => ({ ...m, porcentaje: enteros[i], ancho: crudos[i] }));
}

/** El tono del recuadro de la diferencia: verde sin diferencia, rojo falta, naranja sobra. */
export function tonoDelRecuadro(c) {
  if (c?.resultado === RESULTADO_CAJA.FALTA) return "danger";
  if (c?.resultado === RESULTADO_CAJA.SOBRA) return "warning";
  if (c?.resultado === RESULTADO_CAJA.SIN_DIFERENCIA) return "success";
  return "muted";
}

/** La clase de fondo suave de un recuadro, por tono. */
export const FONDO_DE_TONO = Object.freeze({
  success: "sunmi-btn-success-soft",
  danger: "sunmi-btn-danger-soft",
  warning: "sunmi-btn-warning-soft",
  muted: "sunmi-bg",
});

/**
 * "−$1.234,00": lo que resta en una cuenta lleva el signo en el texto. El
 * signo lo pone el formateador compartido sobre el valor negado, así que un
 * cero sale "$0,00" y nunca "−$0,00".
 */
export const menos = (n) => formatearMoneda(-Number(n));
export const mas = (n) => {
  const t = formatearMoneda(n);
  return Number(n) > 0 && t !== formatearMoneda(0) ? `+${t}` : t;
};

export const TEXTO_COMISION_SIN_CALCULAR = "Comisión sin calcular";

/** "horario · N cajas · N tickets" (con el día primero si el período tiene varios). */
export function renglonDelTurno(g, { conDia = false } = {}) {
  return [
    conDia ? rotuloDeDia(g.dia) : null,
    horarioDelGrupo(g) || null,
    cantidadDeCajas(g.cantidadCajas),
    `${g.tickets} ${g.tickets === 1 ? "ticket" : "tickets"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Ganancia" en verde si es positiva; el resto, en el tono fuerte. */
export const tonoDeGanancia = (n) => (Number(n) > 0 ? "success" : Number(n) < 0 ? "danger" : "strong");

export const plata = (n) => formatearMoneda(n);

/** La dirección del detalle de una caja, con el período de la lista para volver. */
export function urlDeCaja(id, qs = "") {
  return `${RUTA_TURNOS_Y_CIERRES}/cajas/${id}${qs ? `?${qs}` : ""}`;
}

export function urlDeMovimientos(id, qs = "") {
  return `${RUTA_TURNOS_Y_CIERRES}/cajas/${id}/movimientos${qs ? `?${qs}` : ""}`;
}

export function urlDelZ(id, qs = "") {
  return `${RUTA_TURNOS_Y_CIERRES}/cajas/${id}/z${qs ? `?${qs}` : ""}`;
}

export function urlDeLaLista(qs = "") {
  return qs ? `${RUTA_TURNOS_Y_CIERRES}?${qs}` : RUTA_TURNOS_Y_CIERRES;
}
