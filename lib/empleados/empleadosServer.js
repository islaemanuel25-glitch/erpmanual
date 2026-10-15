// lib/empleados/empleadosServer.js
//
// EMPLEADOS: quien trabaja en el local. Regla de Emanuel (2026-10-15): el
// OPERADOR maneja la caja y entra al POS con PIN; el EMPLEADO trabaja. Todo
// operador es empleado —`Empleado.operadorId` los asocia—, no todo empleado es
// operador. Sueldo y consumo del personal eligen SIEMPRE de acá.
//
// Las consultas que deciden quién es empleado de un local viven acá y en
// ningún otro lado: la lista que se ofrece y la que el servidor acepta son la
// misma función.

/** Los empleados activos de un local, para elegir en Sueldo y en Consumo. */
export function empleadosDelLocal(db, localId) {
  return db.empleado.findMany({
    where: { activo: true, locales: { some: { localId: Number(localId) } } },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}

/**
 * El empleado activo que trabaja en ese local, o null. Es la misma condición
 * que `empleadosDelLocal`: lo que no se ofrece, no se acepta.
 */
export function empleadoActivoDelLocal(db, { empleadoId, localId }) {
  const id = Number(empleadoId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.empleado.findFirst({
    where: { id, activo: true, locales: { some: { localId: Number(localId) } } },
    select: { id: true, nombre: true, operadorId: true },
  });
}

/**
 * EL EMPLEADO DE UN OPERADOR NUEVO. Todo operador es empleado: nace con su
 * mismo nombre, estado y locales, asociado. Recibe `tx` porque va en la misma
 * transacción que el operador: no puede quedar uno sin el otro.
 */
export function crearEmpleadoDeOperador(tx, { operadorId, nombre, activo = true, localIds = [] }) {
  return tx.empleado.create({
    data: {
      nombre,
      activo,
      operadorId,
      locales: { create: localIds.map((localId) => ({ localId: Number(localId) })) },
    },
    select: { id: true },
  });
}

export const SELECT_EMPLEADO = Object.freeze({
  id: true,
  nombre: true,
  activo: true,
  operadorId: true,
  operador: { select: { id: true, nombre: true } },
  locales: { select: { local: { select: { id: true, nombre: true } } } },
});

export function serializarEmpleado(e) {
  return {
    id: e.id,
    nombre: e.nombre,
    activo: e.activo,
    operador: e.operador ? { id: e.operador.id, nombre: e.operador.nombre } : null,
    locales: (e.locales || []).map((l) => l.local),
  };
}
