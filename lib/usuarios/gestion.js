// lib/usuarios/gestion.js
//
// Lógica compartida de autorización y validación para la gestión de USUARIOS del
// sistema (crear/editar/eliminar). Soporta dos modos:
//  - Admin ("*"): gestiona cualquier usuario de cualquier local.
//  - usuarios.gestionar_local: gestiona SOLO usuarios de su propio local
//    (session.localId), no puede asignar Admin ni roles con "*", ni mover usuarios
//    a otro local, ni operar usuarios globales/sin local.

import prisma from "@/lib/prisma";
import { checkPerm } from "@/lib/authorize";
import { ROLES_REQUIEREN_LOCAL } from "@/lib/rbac/systemRoles";

// ¿Quién y con qué alcance puede gestionar usuarios?
export function autorizarGestionUsuarios(session) {
  if (!session) return { error: "No autenticado", status: 401 };
  if (session.esAdmin) return { ok: true, esAdmin: true, viaLocal: false, localId: null };
  if (checkPerm(session, "usuarios.gestionar_local").ok) {
    const localId = Number(session.localId) || 0;
    if (!localId) return { error: "Sin alcance autorizado.", status: 403 };
    return { ok: true, esAdmin: false, viaLocal: true, localId };
  }
  return { error: "Requiere administrador", status: 403 };
}

// Valida que el rol a asignar sea legítimo para el actor. Un no-admin NO puede
// asignar Admin ni ningún rol que contenga el comodín "*".
export async function validarRolAsignable(rolId, { esAdmin }) {
  const rol = await prisma.rol.findUnique({
    where: { id: Number(rolId) },
    select: { id: true, nombre: true, permisos: true, esSistema: true },
  });
  if (!rol) return { error: "Rol inválido.", status: 400 };

  const esUniversal = Array.isArray(rol.permisos) && rol.permisos.includes("*");
  if (!esAdmin && (esUniversal || rol.nombre === "Admin")) {
    return { error: "No podés asignar un rol administrador.", status: 403 };
  }
  return { ok: true, rol };
}

// Los roles de sistema por-local exigen localId en el usuario.
export function validarLocalObligatorio(rolNombre, localId) {
  if (ROLES_REQUIEREN_LOCAL.includes(rolNombre) && !localId) {
    return { error: `El rol ${rolNombre} requiere un local asignado.`, status: 400 };
  }
  return { ok: true };
}

// Un no-admin (viaLocal) solo puede operar usuarios de SU local.
export function dentroDeAlcance(actor, targetLocalId) {
  if (actor.esAdmin) return true;
  return Number(targetLocalId) === Number(actor.localId);
}
