// lib/ofertas/notificaciones.js
//
// QUÉ AVISOS CORRESPONDE EMITIR. Función pura: decide, no escribe.
//
// ── EL PROBLEMA REAL NO ES AVISAR, ES NO AVISAR DOS MIL VECES ───────────────
//
// El barrido corre cada vez que alguien abre la pantalla de ofertas. Si emitiera
// una notificación por cada corrida, en una mañana habría cuarenta avisos de la
// misma oferta y la gente aprendería a ignorar la campanita — que es la forma de
// romper un aviso sin tocar una línea de código.
//
// Cada tipo se hace idempotente de una forma distinta, y a propósito:
//
//   OFERTA_REVISAR      se emite SOLO en la transición: cuando una línea pasa de
//                       no marcada a marcada. La marca se persiste, así que la
//                       segunda corrida ya no encuentra transición. No necesita
//                       registro extra: el registro ES la marca.
//
//   OFERTA_POR_VENCER   no tiene una transición persistida donde apoyarse —el
//                       "faltan menos de 24 h" es cierto durante 24 horas
//                       seguidas—, así que se mira si YA HAY una notificación de
//                       esa oferta emitida dentro de esta misma ventana de
//                       vencimiento. Si la oferta se renueva y su `finEn` se
//                       corre, la ventana es otra y vuelve a avisar, que es lo
//                       correcto.

import { estadoOferta, ESTADO_OFERTA, estaPorVencer } from "./estados.js";
import { textoCambioDeCosto } from "./revision.js";
import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora.js";

export const TIPO_NOTIFICACION = {
  POR_VENCER: "OFERTA_POR_VENCER",
  REVISAR: "OFERTA_REVISAR",
};

/** Cuántas horas antes del final se avisa. Definido UNA vez, acá. */
export const HORAS_AVISO_VENCIMIENTO = 24;

function ms(horas) {
  return horas * 60 * 60 * 1000;
}

/**
 * ¿Corresponde avisar que esta oferta está por vencer, y no se avisó ya?
 *
 * @param {object} oferta
 * @param {Array<{entidadId:number, createdAt:Date|string}>} notificacionesPrevias
 *   Notificaciones de tipo POR_VENCER ya emitidas para estas ofertas.
 */
export function debeAvisarVencimiento(oferta, notificacionesPrevias = [], ahora = new Date()) {
  if (!estaPorVencer(oferta, { horas: HORAS_AVISO_VENCIMIENTO, ahora })) return false;

  const fin = new Date(oferta.finEn).getTime();
  const arranqueVentana = fin - ms(HORAS_AVISO_VENCIMIENTO);

  const yaAvisada = notificacionesPrevias.some((n) => {
    if (Number(n.entidadId) !== Number(oferta.id)) return false;
    const t = new Date(n.createdAt).getTime();
    // Dentro de ESTA ventana de vencimiento. Una notificación de una vigencia
    // anterior de la misma oferta no cuenta.
    return t >= arranqueVentana && t <= fin;
  });

  return !yaAvisada;
}

/**
 * Los avisos a emitir en una corrida del barrido.
 *
 * @param {object} args
 * @param {Array} args.ofertas ofertas del local con sus líneas
 * @param {Array<number>} args.lineasReciénMarcadas ids de OfertaLinea que ACABAN de marcarse
 * @param {Array} args.notificacionesPrevias  las de tipo POR_VENCER ya emitidas
 * @param {Record<number, {nombre:string, resumen:object}>} args.detalleLineas
 *   por ofertaLineaId: nombre del producto y el resumen del cambio de costo
 * @returns {Array<{tipo, ofertaId, titulo, cuerpo}>}
 */
export function avisosDelBarrido({
  ofertas = [],
  lineasRecienMarcadas = [],
  notificacionesPrevias = [],
  detalleLineas = {},
  ahora = new Date(),
} = {}) {
  const avisos = [];
  const marcadas = new Set(lineasRecienMarcadas.map(Number));

  for (const oferta of ofertas) {
    const estado = estadoOferta(oferta, ahora);

    // ── Cambio de costo ──────────────────────────────────────────────────
    // Un aviso por OFERTA y no uno por línea: cinco productos que cambiaron de
    // costo el mismo día son un solo problema para quien lo tiene que mirar.
    const lineasDeEsta = (oferta.lineas || []).filter((l) => marcadas.has(Number(l.id)));
    if (lineasDeEsta.length > 0) {
      const detalles = lineasDeEsta
        .map((l) => detalleLineas[l.id])
        .filter(Boolean)
        .map((d) => textoCambioDeCosto(d.nombre, d.resumen));

      avisos.push({
        tipo: TIPO_NOTIFICACION.REVISAR,
        ofertaId: oferta.id,
        titulo:
          lineasDeEsta.length === 1
            ? `Revisá "${oferta.nombre}": cambió un costo`
            : `Revisá "${oferta.nombre}": cambiaron ${lineasDeEsta.length} costos`,
        // El cuerpo lleva los números, no un "entrá a ver". Un aviso que obliga
        // a entrar para saber si es urgente se termina posponiendo siempre.
        cuerpo: detalles.join("\n"),
      });
    }

    // ── Vencimiento ──────────────────────────────────────────────────────
    if (
      (estado === ESTADO_OFERTA.ACTIVA || estado === ESTADO_OFERTA.REVISAR) &&
      debeAvisarVencimiento(oferta, notificacionesPrevias, ahora)
    ) {
      avisos.push({
        tipo: TIPO_NOTIFICACION.POR_VENCER,
        ofertaId: oferta.id,
        titulo: `La oferta "${oferta.nombre}" vence pronto`,
        cuerpo: `Termina el ${formatearFinCorto(oferta.finEn)}. Podés renovarla, modificarla o dejar que finalice.`,
      });
    }
  }

  return avisos;
}

/**
 * Fecha corta en horario argentino, para el cuerpo del aviso: "11/09 23:00".
 *
 * Sale del kit de fechas y no de un `Intl` propio. La versión anterior pedía
 * `es-AR` sin `hour12:false`, que es justo lo que prohíbe
 * `lib/fechas/horaUnica.test.mjs`: hay entornos donde eso imprime "11:00 p. m."
 * en un aviso que dice cuándo termina una oferta. Un aviso de vencimiento con la
 * hora ambigua es peor que no avisar.
 */
export function formatearFinCorto(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "—";
  return `${diaMesAR(d)} ${horaAR(d)}`;
}
