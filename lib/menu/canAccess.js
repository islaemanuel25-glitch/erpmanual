// ============================================================
// lib/menu/canAccess.js
//
// Función pura para evaluar si una entrada del menú es visible
// para un usuario dado. Cruza:
//   - RBAC del usuario (permisos, admin)
//   - Capacidades comerciales del grupo (módulos, features,
//     integraciones, multi-sucursal) vía `commercialAccess.js`
//   - Scope estructural del item ("global" / "multiLocal" / "config")
//   - Reglas históricas: adminOnly y multiSucursalOnly
//   - Kill switch explícito: `item.enabled === false`
//
// Etapa 5.1 — separación de visibilidad y contexto operativo:
//   `localOnly` y `depositoOnly` se conservan como METADATA en el
//   registry pero NO afectan la visibilidad del menú. Son contexto
//   temporal del usuario (¿tiene un local seleccionado? ¿es
//   depósito?), no permisos ni contratación. La página/API es
//   responsable de decidir si puede operar; el menú se mantiene
//   estable para no esconder/mostrar items según el contexto activo.
//
// Esta función SÍ es invocada desde `hooks/useMenu.js` (Etapa 5).
//
// Regla clave sobre admin:
//   - Admin (user.esAdmin === true) BYPASSEA permisos RBAC.
//   - Admin NO BYPASSEA módulos, features, integraciones ni
//     scope multi-sucursal: si el grupo (tenant) no contrató
//     un módulo o no tiene una feature activa, ni siquiera el
//     admin del grupo lo ve. Eso es deliberado: la capa
//     comercial es del grupo, no del rol.
//
// La función es 100% determinística: no mutación, no red, no BD.
// ============================================================

import {
  isModuleActive,
  isFeatureActive,
  isIntegrationActive,
  isMultiSucursalEnabled,
  getCommercialAccess,
} from "./commercialAccess.js";

/** @typedef {import("./types.js").RegistryEntry} RegistryEntry */
/** @typedef {import("./types.js").User}          User */
/** @typedef {import("./types.js").GrupoConfig}   GrupoConfig */
/** @typedef {import("./types.js").CanAccessResult} CanAccessResult */

// ============================================================
// Helpers internos.
// ============================================================

/**
 * Devuelve el permiso requerido por un item, soportando todos
 * los nombres con los que el codebase puede declararlo:
 *   - `permission`  (English, usado por canAccess histórico)
 *   - `requiredPermission` (English, mencionado en el plan)
 *   - `permiso`     (Spanish, el que usa hoy `MENU_CONFIG`
 *                    en `lib/menu/registry.js`)
 *
 * Toma el primero que esté definido y no vacío.
 *
 * @param {object} item
 * @returns {string|undefined}
 */
function readItemPermission(item) {
  return item?.permission || item?.requiredPermission || item?.permiso;
}

/**
 * Devuelve true si la lista de permisos del usuario contiene `*`,
 * o si `user.esAdmin === true`. Acepta ambas señales para no
 * acoplarse a una única convención.
 *
 * @param {User} user
 * @returns {boolean}
 */
function isAdminUser(user) {
  if (user?.esAdmin === true) return true;
  const permisos = Array.isArray(user?.permisos) ? user.permisos : [];
  return permisos.includes("*");
}

// ============================================================
// API pública.
// ============================================================

/**
 * Evalúa si una entrada del menú (grupo o item) es visible para
 * el usuario y la config comercial del grupo.
 *
 * Orden de evaluación:
 *   A. Kill switch: `item.enabled === false` -> "disabled".
 *   B. Admin-only / scope "config":
 *        - `adminOnly` y no admin   -> "admin-only".
 *        - `scope === "config"` y no admin -> "config-admin-only".
 *   C. Scope "multiLocal" sin multi-sucursal -> "requires-multi-sucursal".
 *   D. `requiredModule` no contratado  -> "module-inactive:<key>".
 *      (admin NO bypassea)
 *   E. `requiredFeature` inactiva       -> "feature-inactive:<key>".
 *      (admin NO bypassea)
 *   F. `requiredIntegration` inactiva   -> "integration-inactive:<key>".
 *      (admin NO bypassea)
 *   G. RBAC (admin bypassea):
 *        - permission/requiredPermission/permiso      -> "sin-permiso:<p>".
 *        - requiredAnyPerms                           -> "sin-any-perms".
 *        - requiredAllPerms                           -> "sin-all-perms".
 *   H. Capacidad multi-sucursal heredada:
 *        - multiSucursalOnly + !multi                -> "no-multi-sucursal".
 *   Si todo pasa -> { visible: true }.
 *
 * NOTA Etapa 5.1: `localOnly` y `depositoOnly` permanecen en el
 *   registry pero NO se evalúan acá. Son contexto operativo
 *   temporal (no contratación ni permiso); la decisión de operar
 *   queda en la página/API consumidora del item.
 *
 * IMPORTANTE: `enabledByDefault` del item NO se consulta acá:
 *   no se debe ocultar un item por su default si las capacidades
 *   activas dicen lo contrario. `enabledByDefault` lo lee
 *   `commercialAccess` para construir el set de capacidades activas.
 *
 * Scope reconocido: "global" | "multiLocal" | "config".
 *   Cualquier otro valor (incluyendo `undefined`) NO bloquea por
 *   sí mismo: la visibilidad depende de las otras reglas.
 *
 * @param {User}             user
 * @param {GrupoConfig}      grupoConfig
 * @param {RegistryEntry}    item
 * @param {RegistryEntry[]}  registry
 * @returns {CanAccessResult}
 */
export function canAccessMenuItem(user, grupoConfig, item, registry) {
  const safeUser = user || {};
  const safeItem = item || {};
  const safeRegistry = Array.isArray(registry) ? registry : [];
  const safeConfig =
    grupoConfig === null || grupoConfig === undefined
      ? getCommercialAccess()
      : grupoConfig;

  const esAdmin = isAdminUser(safeUser);
  const permisos = Array.isArray(safeUser.permisos) ? safeUser.permisos : [];

  // ----------------------------------------------------------
  // A. Kill switch explícito.
  // ----------------------------------------------------------
  if (safeItem.enabled === false) {
    return { visible: false, reason: "disabled" };
  }

  // ----------------------------------------------------------
  // B. Admin / scope config.
  //    adminOnly tiene prioridad sobre scope-config para preservar
  //    el código de razón histórico ("admin-only").
  // ----------------------------------------------------------
  if (safeItem.adminOnly === true && !esAdmin) {
    return { visible: false, reason: "admin-only" };
  }
  if (safeItem.scope === "config" && !esAdmin) {
    return { visible: false, reason: "config-admin-only" };
  }

  // ----------------------------------------------------------
  // Items "core" (ej. Inicio) saltan el bloque comercial.
  // Sí se les sigue aplicando RBAC y la regla multiSucursalOnly.
  // ----------------------------------------------------------
  const isCore = safeItem.type === "core";

  if (!isCore) {
    // --------------------------------------------------------
    // C. Scope multiLocal.
    //    No se aplica a "global", "config" ni a undefined.
    // --------------------------------------------------------
    if (
      safeItem.scope === "multiLocal" &&
      !isMultiSucursalEnabled(safeConfig)
    ) {
      return { visible: false, reason: "requires-multi-sucursal" };
    }

    // --------------------------------------------------------
    // D. requiredModule. Admin NO bypassea.
    // --------------------------------------------------------
    if (safeItem.requiredModule) {
      if (!isModuleActive(safeConfig, safeItem.requiredModule, safeRegistry)) {
        return {
          visible: false,
          reason: "module-inactive:" + safeItem.requiredModule,
        };
      }
    }

    // --------------------------------------------------------
    // E. requiredFeature. Admin NO bypassea.
    // --------------------------------------------------------
    if (safeItem.requiredFeature) {
      if (
        !isFeatureActive(safeConfig, safeItem.requiredFeature, safeRegistry)
      ) {
        return {
          visible: false,
          reason: "feature-inactive:" + safeItem.requiredFeature,
        };
      }
    }

    // --------------------------------------------------------
    // F. requiredIntegration. Admin NO bypassea.
    // --------------------------------------------------------
    if (safeItem.requiredIntegration) {
      if (!isIntegrationActive(safeConfig, safeItem.requiredIntegration)) {
        return {
          visible: false,
          reason: "integration-inactive:" + safeItem.requiredIntegration,
        };
      }
    }
  }

  // ----------------------------------------------------------
  // G. RBAC. Admin bypassea estos chequeos.
  // ----------------------------------------------------------
  if (!esAdmin) {
    const perm = readItemPermission(safeItem);
    if (perm && !permisos.includes(perm)) {
      return { visible: false, reason: "sin-permiso:" + perm };
    }

    if (
      Array.isArray(safeItem.requiredAnyPerms) &&
      safeItem.requiredAnyPerms.length > 0 &&
      !safeItem.requiredAnyPerms.some((p) => permisos.includes(p))
    ) {
      return { visible: false, reason: "sin-any-perms" };
    }

    if (
      Array.isArray(safeItem.requiredAllPerms) &&
      safeItem.requiredAllPerms.length > 0 &&
      !safeItem.requiredAllPerms.every((p) => permisos.includes(p))
    ) {
      return { visible: false, reason: "sin-all-perms" };
    }
  }

  // ----------------------------------------------------------
  // H. Capacidad multi-sucursal heredada.
  //
  // `localOnly` y `depositoOnly` NO se evalúan (Etapa 5.1):
  // son contexto temporal del usuario, no permiso ni contratación.
  // Las páginas y APIs son las responsables de decidir si pueden
  // operar con el contexto activo.
  // ----------------------------------------------------------
  if (safeItem.multiSucursalOnly === true) {
    if (!isMultiSucursalEnabled(safeConfig)) {
      return { visible: false, reason: "no-multi-sucursal" };
    }
  }

  // ----------------------------------------------------------
  // Visible.
  // ----------------------------------------------------------
  return { visible: true };
}

/**
 * Atajo semántico para evaluar grupos del menú. Usa la misma
 * lógica que `canAccessMenuItem`. Existe para que el call-site
 * sea explícito al iterar la jerarquía (group + items).
 *
 * @param {User}             user
 * @param {GrupoConfig}      grupoConfig
 * @param {RegistryEntry}    group
 * @param {RegistryEntry[]}  registry
 * @returns {CanAccessResult}
 */
export function canAccessMenuGroup(user, grupoConfig, group, registry) {
  return canAccessMenuItem(user, grupoConfig, group, registry);
}

/**
 * Devuelve el código machine-readable que explica por qué un item
 * NO sería visible, o `null` si SÍ es visible. Útil para tracing
 * y para tests.
 *
 * @param {User}             user
 * @param {GrupoConfig}      grupoConfig
 * @param {RegistryEntry}    item
 * @param {RegistryEntry[]}  registry
 * @returns {string|null}
 */
export function getAccessReason(user, grupoConfig, item, registry) {
  const result = canAccessMenuItem(user, grupoConfig, item, registry);
  return result.visible ? null : result.reason ?? null;
}
