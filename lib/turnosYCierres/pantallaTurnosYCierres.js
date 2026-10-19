// lib/turnosYCierres/pantallaTurnosYCierres.js
//
// QUÉ DICE LA PANTALLA DE "TURNOS Y CIERRES", sin dibujar nada. Puro: recibe lo
// que mandó el servidor y decide textos y tonos. No suma plata: la única cuenta
// que se hace acá es contar cajas.

import { ESTADO_TURNO, TEXTO_SIN_CONTAR } from "../caja/cierreRelevo.js";
import { diaMesAR, horaAR } from "../fechas/formatearFechaHora.js";
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
 * CAJAS ABIERTAS A LA VEZ en un turno: el aviso de que dos cajones compartieron
 * horario —el caso en que una venta puede quedar en la caja de otro—. Barre las
 * aperturas y cierres y devuelve el máximo de cajas simultáneas y la franja
 * real en que hubo dos o más. Una caja abierta sigue hasta `ahora`.
 *
 * @returns {{texto:string, tono:string}|null} null si nunca hubo dos a la vez
 */
export function cajasSuperpuestas(cajas = [], ahora = new Date()) {
  const eventos = [];
  for (const c of cajas) {
    const a = new Date(c.apertura).getTime();
    const b = c.cierre ? new Date(c.cierre).getTime() : new Date(ahora).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    eventos.push([a, 1, false], [b, -1, !c.cierre]);
  }
  // A igual instante, primero el cierre: una que cierra cuando otra abre no
  // estuvieron abiertas a la vez.
  eventos.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let abiertas = 0;
  let maximo = 0;
  let desde = null;
  let hasta = null;
  let sigueAbierta = false;
  for (const [t, d, esAhora] of eventos) {
    abiertas += d;
    if (abiertas >= 2) {
      if (desde == null) desde = t;
      maximo = Math.max(maximo, abiertas);
    } else if (d < 0 && abiertas === 1 && desde != null) {
      hasta = t;
      sigueAbierta = esAhora;
    }
  }
  if (maximo < 2) return null;
  const franja = sigueAbierta
    ? `desde ${horaAR(new Date(desde))}`
    : `${horaAR(new Date(desde))}–${horaAR(new Date(hasta))}`;
  return { texto: `⚠ ${maximo} cajas abiertas a la vez · ${franja}`, tono: "warning" };
}

/**
 * "Este mes: 2 faltas · 1 sobra": el historial de la persona de una caja en el
 * mes en curso, con lo que contó el servidor. Rojo si faltó alguna vez, naranja
 * si solo sobró. Lo que da cero no se dice; si las dos dan cero, nada.
 */
export function textoDelHistorial(h) {
  const faltas = Number(h?.faltas) || 0;
  const sobras = Number(h?.sobras) || 0;
  if (!faltas && !sobras) return null;
  const partes = [];
  if (faltas) partes.push(`${faltas} ${faltas === 1 ? "falta" : "faltas"}`);
  if (sobras) partes.push(`${sobras} ${sobras === 1 ? "sobra" : "sobras"}`);
  return { texto: `Este mes: ${partes.join(" · ")}`, tono: faltas ? "danger" : "warning" };
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

/**
 * UNA DIFERENCIA DEL CAJÓN EN PALABRAS: "Falta $34.500,00" en rojo, "Sobra
 * $9.700,00" en ámbar, "Sin diferencia" en gris. Sirve para el tramo de cada
 * retiro y para el recuadro de la caja. Sin signo: la palabra ya lo dice. Null
 * si no se conoce.
 */
export function textoDeDiferencia(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const v = Number(n);
  if (formatearMoneda(Math.abs(v)) === formatearMoneda(0)) return { texto: "Sin diferencia", tono: "muted" };
  return v < 0
    ? { texto: `Falta ${formatearMoneda(-v)}`, tono: "danger" }
    : { texto: `Sobra ${formatearMoneda(v)}`, tono: "warning" };
}

/**
 * EL RECUADRO "DIFERENCIA DE LA CAJA" del cajón: la de la caja, la misma de la
 * cabecera del trabajador. Abierta, "Caja abierta" (o "En cierre"); cerrada sin
 * contar, que no se contó.
 */
export function diferenciaDelCajon(c) {
  if (!esCerrada(c)) return diferenciaGrande(c);
  if (c?.resultado === RESULTADO_CAJA.SIN_CONTEO || c?.diferencia == null) return { texto: TEXTO_SIN_CONTAR, tono: "muted" };
  return textoDeDiferencia(c.diferencia);
}

/** La diferencia grande del detalle: "−$1.500,00 · Falta" o "Sin diferencia". */
export function diferenciaGrande(c) {
  const d = diferenciaDeCaja(c);
  if (d) return d;
  return { texto: c?.estado === ESTADO_TURNO.CIERRE_EN_PREPARACION ? "En cierre" : "Caja abierta", tono: "muted" };
}

/**
 * CÓMO CERRÓ UNA CAJA, en palabras, para "Quién trabajó": "Sobra $5.000,00",
 * "Falta $113.900,00", "Cuadra", o "Abierta" mientras no cerró. El importe va
 * sin signo porque la palabra ya lo dice; el tono es el de `diferenciaDeCaja`.
 * No calcula nada: lee `resultado` y `diferencia` tal como vinieron.
 */
export function comoCerroLaCaja(c) {
  if (!esCerrada(c)) return estadoDeCaja(c);
  const n = Math.abs(Number(c?.diferencia));
  switch (c?.resultado) {
    case RESULTADO_CAJA.SIN_DIFERENCIA:
      return { texto: "Cuadra", tono: "success" };
    case RESULTADO_CAJA.FALTA:
      return { texto: `Falta ${formatearMoneda(n)}`, tono: "danger" };
    case RESULTADO_CAJA.SOBRA:
      return { texto: `Sobra ${formatearMoneda(n)}`, tono: "warning" };
    case RESULTADO_CAJA.SIN_CONTEO:
      return { texto: TEXTO_SIN_CONTAR, tono: "muted" };
    default:
      return estadoDeCaja(c);
  }
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

/** "Ventas de la Caja #N": todas sus ventas en orden de hora. */
export function urlDeVentas(id, qs = "") {
  return `${RUTA_TURNOS_Y_CIERRES}/cajas/${id}/ventas${qs ? `?${qs}` : ""}`;
}

/** El detalle de una venta, el que ya existe en Reportes de ventas. */
export function urlDeLaVenta(id) {
  return `/modulos/reportes-ventas/${id}`;
}

/**
 * Cuándo vendió la caja, para el recuadro de la tarjeta: "Primera venta 00:12 ·
 * Última venta 15:58" y "45 tickets", o "Sin ventas". Lee `horarioDeVentas`
 * tal como vino del servidor; no cuenta nada.
 */
export function textoDeHorarioDeVentas(h) {
  if (!h?.cantidad) return { sinVentas: true, horario: "Sin ventas", tickets: null };
  return {
    sinVentas: false,
    horario: `Primera venta ${horaAR(h.primera)} · Última venta ${horaAR(h.ultima)}`,
    tickets: `${h.cantidad} ${h.cantidad === 1 ? "ticket" : "tickets"}`,
  };
}

/** "abierta 00:06 a 16:05", o "abierta desde 00:06" mientras siga abierta. */
export const horarioDeLaCaja = (c) =>
  esCerrada(c) ? `abierta ${horaAR(c.apertura)} a ${horaAR(c.cierre)}` : `abierta desde ${horaAR(c.apertura)}`;

export function urlDelZ(id, qs = "") {
  return `${RUTA_TURNOS_Y_CIERRES}/cajas/${id}/z${qs ? `?${qs}` : ""}`;
}

export function urlDeLaLista(qs = "") {
  return qs ? `${RUTA_TURNOS_Y_CIERRES}?${qs}` : RUTA_TURNOS_Y_CIERRES;
}
