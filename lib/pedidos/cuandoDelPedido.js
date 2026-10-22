// lib/pedidos/cuandoDelPedido.js
//
// CUÁNDO SE PIDIÓ, EN CORTO: "hoy 14:05", "ayer 18:30" o "21/10 09:15".
//
// Para el lado del depósito (la entrada de "Pedidos de locales" y la pantalla
// de preparar, 2026-10-22). El día es el de Argentina, no el del navegador ni
// el de UTC: un pedido de las 22:30 no puede decir "mañana".

import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string|Date|null} fecha
 * @param {Date} [ahora] para los candados; por defecto, ahora.
 * @returns {string|null}
 */
export function cuandoDelPedido(fecha, ahora = new Date()) {
  if (!fecha) return null;
  const dia = fechaArgentinaISO(new Date(fecha));
  // Argentina no tiene horario de verano: el día de ayer es el de hace 24 h.
  if (dia === fechaArgentinaISO(ahora)) return `hoy ${horaAR(fecha)}`;
  if (dia === fechaArgentinaISO(new Date(ahora.getTime() - UN_DIA_MS))) return `ayer ${horaAR(fecha)}`;
  return `${diaMesAR(fecha)} ${horaAR(fecha)}`;
}
