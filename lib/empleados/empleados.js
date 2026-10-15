// lib/empleados/empleados.js
//
// Lo que no toca la base de Operadores y Empleados: leer el pedido de alta o de
// edición y decidir si un registro es del local donde se opera.
//
// Regla de Emanuel (2026-10-15): un operador y un empleado son de UN local, el
// que los contrata. Se dan de alta en el local activo, se ven y se editan solo
// desde ahí, y no se mudan: si alguien trabaja en dos locales, son dos
// registros. El local activo lo resuelve `resolveLocalAndGrupo`, el mismo para
// un admin (el selector de arriba) y para un encargado (el de su sesión).

export const ERROR_NOMBRE = "El nombre debe tener al menos 2 caracteres.";
export const ERROR_LOCAL_AJENO = "Es de otro local.";
export const ERROR_NO_SE_MUDA = "Se da de alta en el local activo y no se cambia de local.";
export const ERROR_OPERADOR_OCUPADO = "Ese operador ya es de otro empleado.";
export const ERROR_OPERADOR_INEXISTENTE = "Ese operador no existe.";
export const ERROR_EMPLEADO_INEXISTENTE = "Empleado no encontrado.";
export const ERROR_EMPLEADO_DE_OTRO_LOCAL = "Ese empleado es de otro local.";
export const ERROR_OPERADOR_REPETIDO = "Ya existe un operador con ese nombre en este local.";
export const ERROR_EMPLEADO_REPETIDO = "Ya existe un empleado con ese nombre en este local.";

/** ¿El registro —operador o empleado— es de este local? */
export function esDelLocal(registro, localId) {
  const local = Number(localId);
  return Number.isInteger(local) && local > 0 && Number(registro?.localId) === local;
}

/**
 * ¿El pedido intenta elegir o cambiar el local? El local no viaja: es el
 * activo. Un `localId` o `localIds` en el cuerpo se rechaza, no se ignora.
 */
export function pideOtroLocal(body) {
  return Boolean(body) && (Object.prototype.hasOwnProperty.call(body, "localIds") || Object.prototype.hasOwnProperty.call(body, "localId"));
}

/** El nombre, recortado, o un error. */
export function leerNombre(nombre) {
  const n = String(nombre ?? "").trim();
  if (n.length < 2) return { error: ERROR_NOMBRE };
  return { nombre: n.slice(0, 120) };
}

/** El operador a asociar: un id, `null` para desasociar, o `undefined` si no viene. */
export function leerOperadorId(valor) {
  if (valor === undefined) return { operadorId: undefined };
  if (valor === null || valor === "") return { operadorId: null };
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) return { error: ERROR_OPERADOR_INEXISTENTE };
  return { operadorId: id };
}
