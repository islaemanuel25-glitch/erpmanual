"use client";

// ============================================================
// hooks/usePermisos.js
//
// Wrapper de React sobre los helpers puros de
// `lib/menu/permissions.js`. Lee el perfil activo del
// `UserContext` y expone una API ergonómica para preguntar
// permisos desde cualquier componente.
//
// Reglas (heredadas de lib/menu/permissions.js):
//   - Admin (perfil.esAdmin === true) bypassa RBAC.
//   - El bypass de admin NO se aplica a módulos/features/
//     integraciones contratadas: para esos casos hay que usar
//     `lib/menu/commercialAccess.js`.
// ============================================================

import { useUser } from "@/app/context/UserContext";
import {
  isAdmin as isAdminFn,
  canBypassRbac as canBypassRbacFn,
  hasPermission as hasPermissionFn,
  hasAnyPermission as hasAnyPermissionFn,
  hasAllPermissions as hasAllPermissionsFn,
} from "@/lib/menu/permissions";

export function usePermisos() {
  const ctx = useUser();
  const perfil = ctx?.perfil ?? null;
  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];

  return {
    perfil,
    permisos,
    isAdmin: isAdminFn(perfil),
    canBypassRbac: canBypassRbacFn(perfil),
    hasPermission: (permission) => hasPermissionFn(perfil, permission),
    hasAnyPermission: (list) => hasAnyPermissionFn(perfil, list),
    hasAllPermissions: (list) => hasAllPermissionsFn(perfil, list),
  };
}
