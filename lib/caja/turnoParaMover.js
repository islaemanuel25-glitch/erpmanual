// lib/caja/turnoParaMover.js
//
// ¿ESTE TURNO ADMITE QUE SE LE MUEVA PLATA DESDE EL POS? Una sola regla para
// "Caja +/−" y para "Pagar". Estaba escrita adentro de
// `caja-movimientos/crear`; se sacó acá cuando llegó la segunda ruta, para que
// las dos rechacen lo mismo y con las mismas palabras.
//
// Se aplica dos veces —afuera como respuesta rápida, adentro de la transacción
// con el turno tomado por `bloquearTurno`— y la que decide es la de adentro.

import { ERROR_CAJA_AJENA, ERROR_TURNO_EN_PREPARACION, puedeActuarSobreCaja } from "./cierreRelevo.js";

export const SELECT_TURNO = Object.freeze({
  id: true,
  localId: true,
  vendedorId: true,
  operadorId: true,
  operaLaCuenta: true,
  cierre: true,
  cierreEnPreparacionEn: true,
  anuladoEn: true,
});

/**
 * Por qué este turno no admite un movimiento, o null si lo admite.
 *
 * @returns {null | { status:number, cuerpo:object }}
 */
export function rechazoDelTurno(turno, localId, identidad) {
  if (!turno || turno.localId !== localId) {
    return { status: 404, cuerpo: { ok: false, error: "Turno no encontrado en este local" } };
  }
  if (!puedeActuarSobreCaja(turno, identidad)) {
    return { status: 403, cuerpo: { ok: false, error: ERROR_CAJA_AJENA, cajaAjena: true } };
  }
  if (turno.cierre !== null) {
    return { status: 400, cuerpo: { ok: false, error: "El turno ya esta cerrado" } };
  }
  // Un turno que tomó el corte de cierre tampoco admite movimientos, aunque
  // `cierre` siga en null. Su universo quedó congelado: un ingreso o un egreso
  // cargado ahora caería después de la frontera del corte y no lo vería el
  // cierre que se está confirmando. Es la misma regla que aplica a las ventas.
  if (turno.cierreEnPreparacionEn !== null) {
    return {
      status: 409,
      cuerpo: { ok: false, error: ERROR_TURNO_EN_PREPARACION, turnoEnPreparacionDeCierre: true },
    };
  }
  return null;
}
