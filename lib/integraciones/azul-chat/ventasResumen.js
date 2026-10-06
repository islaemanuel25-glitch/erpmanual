// lib/integraciones/azul-chat/ventasResumen.js
//
// LA CAPACIDAD `ventas_resumen`: CUÁNTO SE VENDIÓ EN UN LOCAL Y CON QUÉ SE COBRÓ.
//
// ── DE DÓNDE SALE CADA NÚMERO ──────────────────────────────────────────────
//
// De `lib/reportes-ventas/resumenVentas.js`, la MISMA pieza que usa el reporte
// general del ERP. Acá no hay una fórmula propia: el `where` del período (con la
// condición comercial y el día argentino), el `select`, el total y el desglose
// son los del reporte. Si el reporte cambia, esto cambia con él.
//
// Lo que esta pieza agrega es solo lo de la integración: el período por nombre
// —hoy, ayer, un rango corto—, un local por consulta, y la forma de la
// respuesta.
//
// ── LO QUE NO DEVUELVE, A PROPÓSITO ────────────────────────────────────────
//
// Ni comisiones, ni neto, ni costo, ni ganancia: dependen de
// `comisionPendiente` y de costos que pueden estar sin cargar, y un número que
// puede ser un hueco no se le pasa a una aplicación que lo va a repetir sin el
// rótulo. Ni productos, ni detalles de venta, ni clientes, ni vendedores.
//
// ── EL TOTAL Y EL DESGLOSE ─────────────────────────────────────────────────
//
// `totalVendido` es la suma de `Venta.total`. El desglose suma cada `VentaPago`
// en su medio: un pago mixto aporta a dos medios, y FIADO es su propio medio —es
// venta, pero no entró efectivo—. Las dos sumas tienen que coincidir; si no
// coinciden, se dice con una advertencia y no se corrige ninguna.

import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { TZ_AR } from "@/lib/fechas/formatearFechaHora";
import { ORDEN_MEDIO, etiquetaMedio, aCentavos } from "@/lib/pos-ventas/pagos";
import {
  whereVentasDelPeriodo,
  SELECT_RESUMEN_VENTA,
  resumirVentas,
  desglosarPorMedio,
} from "@/lib/reportes-ventas/resumenVentas";

export const VERSION_CONTRATO = 1;

/** El rango explícito más largo que se acepta, contando los dos extremos. */
export const MAX_DIAS_RANGO = 31;

export const TIPOS_PERIODO = Object.freeze(["hoy", "ayer", "rango"]);

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const rechazo = (codigo, error) => ({ ok: false, status: 400, codigo, error });

/** ¿Es una fecha de calendario real? "2026-02-30" no lo es. */
function esFechaReal(texto) {
  if (typeof texto !== "string" || !SOLO_FECHA.test(texto)) return false;
  const d = new Date(`${texto}T12:00:00.000Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

/** El día argentino anterior a uno dado. Argentina no tiene horario de verano. */
function diaAnterior(fecha) {
  return fechaArgentinaISO(new Date(Date.parse(`${fecha}T12:00:00.000-03:00`) - UN_DIA_MS));
}

function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T12:00:00.000Z`) - Date.parse(`${desde}T12:00:00.000Z`)) / UN_DIA_MS) + 1;
}

/**
 * Traduce el período pedido a dos días argentinos.
 *
 * @param {unknown} periodo `{tipo:"hoy"}` | `{tipo:"ayer"}` | `{tipo:"rango", desde, hasta}`
 * @param {{ahora?: number}} [opciones]
 * @returns {{ok:true, periodo:{tipo:string, desde:string, hasta:string}, hoy:string} | {ok:false, status:number, codigo:string, error:string}}
 */
export function resolverPeriodo(periodo, { ahora = Date.now() } = {}) {
  if (!periodo || typeof periodo !== "object" || Array.isArray(periodo)) {
    return rechazo("PERIODO_INVALIDO", "Falta el período: hoy, ayer o un rango.");
  }
  const { tipo } = periodo;
  if (!TIPOS_PERIODO.includes(tipo)) {
    return rechazo("PERIODO_INVALIDO", "El período tiene que ser hoy, ayer o rango.");
  }
  const permitidas = tipo === "rango" ? ["tipo", "desde", "hasta"] : ["tipo"];
  if (Object.keys(periodo).some((k) => !permitidas.includes(k))) {
    return rechazo("PERIODO_INVALIDO", `El período ${tipo} no acepta más datos que ${permitidas.join(", ")}.`);
  }

  const hoy = fechaArgentinaISO(new Date(ahora));
  if (tipo === "hoy") return { ok: true, periodo: { tipo, desde: hoy, hasta: hoy }, hoy };
  if (tipo === "ayer") {
    const ayer = diaAnterior(hoy);
    return { ok: true, periodo: { tipo, desde: ayer, hasta: ayer }, hoy };
  }

  const { desde, hasta } = periodo;
  if (!esFechaReal(desde) || !esFechaReal(hasta)) {
    return rechazo("PERIODO_INVALIDO", "El rango necesita desde y hasta como fechas YYYY-MM-DD.");
  }
  if (desde > hasta) {
    return rechazo("PERIODO_INVALIDO", "El rango empieza después de terminar.");
  }
  if (hasta > hoy) {
    return rechazo("PERIODO_INVALIDO", `El rango termina en el futuro: hoy es ${hoy} en Argentina.`);
  }
  if (diasEntre(desde, hasta) > MAX_DIAS_RANGO) {
    return rechazo("PERIODO_DEMASIADO_LARGO", `El rango no puede pasar de ${MAX_DIAS_RANGO} días.`);
  }
  return { ok: true, periodo: { tipo, desde, hasta }, hoy };
}

const posicionDelMedio = (medio) => {
  const i = ORDEN_MEDIO.indexOf(medio);
  return i === -1 ? ORDEN_MEDIO.length : i;
};

/**
 * La respuesta, armada sobre ventas ya leídas. Pura.
 *
 * @param {object} args
 * @param {{id:number, nombre:string, activo:boolean}} args.local
 * @param {number} args.grupoId
 * @param {{tipo:string, desde:string, hasta:string}} args.periodo
 * @param {string} args.hoy día argentino de la consulta.
 * @param {Array} args.ventas con la forma de `SELECT_RESUMEN_VENTA`.
 */
export function armarVentasResumen({ local, grupoId, periodo, hoy, ventas }) {
  const resumen = resumirVentas(ventas);
  const mediosDePago = desglosarPorMedio(ventas)
    .map((d) => {
      const medio = d.formaPago.toUpperCase();
      return { medio, etiqueta: etiquetaMedio(medio), total: d.total.toFixed(2), cantidadPagos: d.cantidad };
    })
    .sort((a, b) => posicionDelMedio(a.medio) - posicionDelMedio(b.medio));

  const advertencias = [];
  if (periodo.hasta >= hoy) {
    advertencias.push({
      codigo: "DIA_EN_CURSO",
      mensaje: "El período incluye el día de hoy, que todavía no terminó: el total puede crecer.",
    });
  }
  const centavosDesglose = mediosDePago.reduce((acc, m) => acc + aCentavos(m.total), 0);
  const centavosTotal = aCentavos(resumen.totalBruto.toFixed(2));
  if (centavosDesglose !== centavosTotal) {
    advertencias.push({
      codigo: "DESGLOSE_NO_CUADRA",
      mensaje: `La suma por medio de pago (${(centavosDesglose / 100).toFixed(2)}) no coincide con el total vendido (${resumen.totalBruto.toFixed(2)}).`,
    });
  }
  if (local.activo === false) {
    advertencias.push({ codigo: "LOCAL_INACTIVO", mensaje: "El local está marcado como inactivo en el ERP." });
  }

  return {
    capacidad: "ventas_resumen",
    version: VERSION_CONTRATO,
    local: { id: local.id, nombre: local.nombre },
    grupoId,
    periodo: { tipo: periodo.tipo, desde: periodo.desde, hasta: periodo.hasta, zonaHoraria: TZ_AR },
    cantidadVentas: resumen.cantidadVentas,
    totalVendido: resumen.totalBruto.toFixed(2),
    mediosDePago,
    advertencias,
  };
}

/**
 * Ejecuta la capacidad para una autorización ya concedida.
 *
 * El local y el grupo salen de la AUTORIZACIÓN, no del cuerpo de la solicitud.
 *
 * @param {{localId:number, grupoId:number}} autorizacion
 * @param {{periodo:unknown}} parametros
 * @param {{db:object, ahora?:number}} deps `db` es el cliente Prisma.
 */
export async function ventasResumen(autorizacion, parametros, { db, ahora = Date.now() }) {
  const resuelto = resolverPeriodo(parametros?.periodo, { ahora });
  if (!resuelto.ok) return resuelto;
  const { periodo, hoy } = resuelto;

  const local = await db.local.findUnique({
    where: { id: autorizacion.localId },
    select: { id: true, nombre: true, activo: true },
  });
  if (!local) {
    return { ok: false, status: 403, codigo: "LOCAL_SIN_GRUPO", error: "El local pedido no existe." };
  }

  const ventas = await db.venta.findMany({
    where: whereVentasDelPeriodo({ fechaDesde: periodo.desde, fechaHasta: periodo.hasta, localId: local.id }),
    select: SELECT_RESUMEN_VENTA,
  });

  return { ok: true, datos: armarVentasResumen({ local, grupoId: autorizacion.grupoId, periodo, hoy, ventas }) };
}
