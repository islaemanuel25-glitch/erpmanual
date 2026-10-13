// lib/turnosYCierres/alcance.js
//
// QUIÉN VE QUÉ CAJAS EN "TURNOS Y CIERRES". Puro.
//
//   · `reportes.ver`, `tesoreria.ver` o `turnos.ver_todos` → todas las cajas
//     del local.
//   · el dueño (Admin, o DUEÑO_LOCAL en su local: `puedeOperarSinOperador`)
//     → todas las cajas del local.
//   · solo `pos.usar` → SUS cajas y ninguna otra: la de hoy y las anteriores.
//     "Sus" es la regla de siempre (`whereCajaPropia` / `esCajaPropia`): con
//     operador del PIN, las de ese operador; sin él, las de la cuenta sin
//     operador. Nunca la de otro operador, aunque comparta la cuenta.
//   · ninguno de los tres → nada.
//
// El servidor decide con esto y la pantalla solo dibuja lo que llegó.

import { esCajaPropia, whereCajaPropia } from "../caja/cierreRelevo.js";

// `turnos.ver_todos` entra el 2026-10-13, por pedido de Emanuel: es el permiso
// que ya abría las cajas ajenas en el módulo viejo, y en el nuevo tiene que
// abrir lo mismo.
export const PERMISOS_VER_TODO = Object.freeze(["reportes.ver", "tesoreria.ver", "turnos.ver_todos"]);
export const PERMISO_CAJERO = "pos.usar";

export const ALCANCE = Object.freeze({
  LOCAL: "LOCAL",
  PROPIAS: "PROPIAS",
});

/**
 * @param {{ esAdmin?:boolean, permisos?:string[] }} session
 * @param {{ esDueno?:boolean }} extra  `puedeOperarSinOperador` ya resuelto para el local
 * @returns {string|null} ALCANCE.LOCAL, ALCANCE.PROPIAS o null
 */
export function alcanceDeCajas(session, { esDueno = false } = {}) {
  if (!session) return null;
  const permisos = Array.isArray(session.permisos) ? session.permisos : [];
  if (session.esAdmin === true || permisos.includes("*") || esDueno === true) return ALCANCE.LOCAL;
  if (PERMISOS_VER_TODO.some((p) => permisos.includes(p))) return ALCANCE.LOCAL;
  if (permisos.includes(PERMISO_CAJERO)) return ALCANCE.PROPIAS;
  return null;
}

/**
 * La condición Prisma de las cajas que esta identidad puede ver en el local.
 * Va junto con el resto del `where`; con PROPIAS agrega la de caja propia.
 */
export function whereCajasDelAlcance({ localId, alcance, identidad }) {
  if (alcance === ALCANCE.LOCAL) return { localId };
  if (alcance === ALCANCE.PROPIAS) return { localId, ...whereCajaPropia(identidad) };
  throw new Error("whereCajasDelAlcance: sin alcance");
}

/** El mismo predicado sobre una fila ya leída. */
export function puedeVerCajaDelModulo(caja, { localId, alcance, identidad }) {
  if (!caja || caja.localId !== localId) return false;
  if (alcance === ALCANCE.LOCAL) return true;
  if (alcance === ALCANCE.PROPIAS) return esCajaPropia(caja, identidad);
  return false;
}
