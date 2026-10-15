// lib/empleados/empleados.js
//
// Lo que no toca la base de Empleados: leer el pedido de alta o de edición y
// decidir el alcance de quien lo hace. Es la regla de Operadores
// (app/api/operador/crear y editar): un no-admin solo asigna SU local.

export const ERROR_NOMBRE = "El nombre debe tener al menos 2 caracteres.";
export const ERROR_SIN_LOCAL = "Seleccioná al menos un local.";
export const ERROR_SIN_ALCANCE = "Sin alcance autorizado.";
export const ERROR_LOCAL_AJENO = "Local fuera de tu alcance.";
export const ERROR_OPERADOR_OCUPADO = "Ese operador ya es de otro empleado.";
export const ERROR_OPERADOR_INEXISTENTE = "Ese operador no existe.";
export const ERROR_EMPLEADO_INEXISTENTE = "Empleado no encontrado.";
export const ERROR_EMPLEADO_AJENO = "No autorizado para este empleado.";

/**
 * Los locales que se van a asignar, ya acotados al alcance, o un error.
 * Un admin asigna cualquiera; un no-admin, solo el suyo.
 */
export function localesEnAlcance(localIds, session) {
  if (!Array.isArray(localIds) || localIds.length === 0) return { error: ERROR_SIN_LOCAL, status: 400 };
  const ids = [...new Set(localIds.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return { error: ERROR_SIN_LOCAL, status: 400 };
  if (session?.esAdmin) return { localIds: ids };
  const propio = Number(session?.localId) || 0;
  if (!propio) return { error: ERROR_SIN_ALCANCE, status: 403 };
  if (ids.some((id) => id !== propio)) return { error: ERROR_LOCAL_AJENO, status: 403 };
  return { localIds: [propio] };
}

/** El nombre, recortado, o un error. */
export function leerNombre(nombre) {
  const n = String(nombre ?? "").trim();
  if (n.length < 2) return { error: ERROR_NOMBRE };
  return { nombre: n.slice(0, 120) };
}

/** ¿Quien edita puede asociar este operador? Un no-admin, solo uno de su local. */
export function operadorEnAlcance(operador, session) {
  if (session?.esAdmin) return true;
  const propio = Number(session?.localId) || 0;
  return Boolean(propio) && (operador?.locales || []).some((l) => l.localId === propio);
}

/** El operador a asociar: un id, `null` para desasociar, o `undefined` si no viene. */
export function leerOperadorId(valor) {
  if (valor === undefined) return { operadorId: undefined };
  if (valor === null || valor === "") return { operadorId: null };
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) return { error: ERROR_OPERADOR_INEXISTENTE };
  return { operadorId: id };
}
