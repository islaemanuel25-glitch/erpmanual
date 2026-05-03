// ============================================================
// lib/menu/permissions.js
//
// Helpers puros para evaluar permisos RBAC del usuario.
//
// Estos helpers son la fuente única para preguntar "¿este user
// tiene tal permiso?" desde cualquier capa (canAccess, UI futura,
// guards de API). NO acceden a red, BD, ni storage. NO mutan.
//
// Regla clave:
//   Admin (user.esAdmin === true) bypassa permisos RBAC, pero
//   esto NO significa bypass de módulos/features/integraciones
//   contratadas por el grupo. Esa lógica vive en commercialAccess.
// ============================================================

/** @typedef {import("./types.js").User} User */

/**
 * ¿El usuario tiene rol admin?
 *
 * @param {User} [user]
 * @returns {boolean}
 */
export function isAdmin(user) {
  return user?.esAdmin === true;
}

/**
 * ¿El admin (o cualquier user con esAdmin === true) bypassa los
 * checks de RBAC? Por contrato del sistema, sí.
 *
 * Existe como helper independiente para que la intención sea
 * legible en el call-site (`if (canBypassRbac(user)) ...`) y
 * para poder evolucionar la regla a futuro sin tocar consumidores.
 *
 * @param {User} [user]
 * @returns {boolean}
 */
export function canBypassRbac(user) {
  return isAdmin(user);
}

/**
 * ¿El usuario tiene un permiso específico?
 *
 * - Si `permission` es falsy/undefined, el chequeo se considera
 *   satisfecho (no había nada que validar).
 * - Admin NO bypassa este helper: es responsabilidad del caller
 *   decidir si llamar a `canBypassRbac` antes.
 *
 * @param {User}   [user]
 * @param {string} [permission]
 * @returns {boolean}
 */
export function hasPermission(user, permission) {
  if (!permission) return true;
  const permisos = Array.isArray(user?.permisos) ? user.permisos : [];
  return permisos.includes(permission);
}

/**
 * ¿El usuario tiene AL MENOS UNO de los permisos listados?
 *
 * - Si la lista es vacía o no es array, se considera satisfecho.
 *
 * @param {User}     [user]
 * @param {string[]} [permissions]
 * @returns {boolean}
 */
export function hasAnyPermission(user, permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return true;
  const permisos = Array.isArray(user?.permisos) ? user.permisos : [];
  return permissions.some((p) => permisos.includes(p));
}

/**
 * ¿El usuario tiene TODOS los permisos listados?
 *
 * - Si la lista es vacía o no es array, se considera satisfecho.
 *
 * @param {User}     [user]
 * @param {string[]} [permissions]
 * @returns {boolean}
 */
export function hasAllPermissions(user, permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return true;
  const permisos = Array.isArray(user?.permisos) ? user.permisos : [];
  return permissions.every((p) => permisos.includes(p));
}
