// lib/empleados/empleadosServer.js
//
// EMPLEADOS: quien trabaja en el local. Regla de Emanuel (2026-10-15): el
// OPERADOR maneja la caja y entra al POS con PIN; el EMPLEADO trabaja. Todo
// operador es empleado —`Empleado.operadorId` los asocia—, no todo empleado es
// operador. Sueldo y consumo del personal eligen SIEMPRE de acá.
//
// Y los dos son de UN local (`localId`): lo de un empleado —sueldo, adelanto,
// consumo— es de ese local y de ningún otro.
//
// Las consultas que deciden quién es empleado de un local viven acá y en
// ningún otro lado: la lista que se ofrece y la que el servidor acepta son la
// misma condición.

import { esDelLocal } from "@/lib/empleados/empleados";

/** Los empleados activos de un local, para elegir en Sueldo y en Consumo. */
export function empleadosDelLocal(db, localId) {
  return db.empleado.findMany({
    where: { activo: true, localId: Number(localId) },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}

/**
 * El empleado activo de ese local. Es la misma condición que
 * `empleadosDelLocal`: lo que no se ofrece, no se acepta.
 *
 * `deOtroLocal` separa el caso que no es un error de carga sino un cruce: el
 * empleado existe y es de otro local. Quien llama lo rechaza con 403.
 *
 * @returns {Promise<{ empleado: {id:number, nombre:string, operadorId:number|null} | null, deOtroLocal: boolean }>}
 */
export async function empleadoActivoDelLocal(db, { empleadoId, localId }) {
  const id = Number(empleadoId);
  if (!Number.isInteger(id) || id <= 0) return { empleado: null, deOtroLocal: false };
  const e = await db.empleado.findUnique({
    where: { id },
    select: { id: true, nombre: true, operadorId: true, activo: true, localId: true },
  });
  if (!e) return { empleado: null, deOtroLocal: false };
  if (!esDelLocal(e, localId)) return { empleado: null, deOtroLocal: true };
  if (!e.activo) return { empleado: null, deOtroLocal: false };
  return { empleado: { id: e.id, nombre: e.nombre, operadorId: e.operadorId }, deOtroLocal: false };
}

/**
 * EL EMPLEADO DE UN OPERADOR NUEVO. Todo operador es empleado: nace en el mismo
 * local, con su nombre y estado, asociado. Recibe `tx` porque va en la misma
 * transacción que el operador: no puede quedar uno sin el otro.
 *
 * Si en ese local ya hay un empleado con ese nombre y sin operador, ES esa
 * persona —el nombre es único en el local—: se le asocia el operador en vez de
 * crear otro. Si ya tiene otro operador, devuelve null y quien llama rechaza.
 */
export async function crearEmpleadoDeOperador(tx, { operadorId, nombre, activo = true, localId }) {
  const existente = await tx.empleado.findUnique({
    where: { localId_nombre: { localId: Number(localId), nombre } },
    select: { id: true, operadorId: true },
  });
  if (existente) {
    if (existente.operadorId != null) return null;
    return tx.empleado.update({ where: { id: existente.id }, data: { operadorId }, select: { id: true } });
  }
  return tx.empleado.create({
    data: { nombre, activo, operadorId, localId: Number(localId) },
    select: { id: true },
  });
}

export const SELECT_EMPLEADO = Object.freeze({
  id: true,
  nombre: true,
  activo: true,
  operadorId: true,
  localId: true,
  operador: { select: { id: true, nombre: true } },
});

export function serializarEmpleado(e) {
  return {
    id: e.id,
    nombre: e.nombre,
    activo: e.activo,
    localId: e.localId,
    operador: e.operador ? { id: e.operador.id, nombre: e.operador.nombre } : null,
  };
}
