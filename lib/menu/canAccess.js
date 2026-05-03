// ============================================================
// lib/menu/canAccess.js
//
// Función pura para evaluar si una entrada del menú es visible
// para un usuario dado, considerando:
//   1. Contratación del módulo (grupoConfig.modulosActivos).
//   2. Features activas (grupoConfig.featuresActivas).
//   3. Integraciones activas (grupoConfig.integracionesActivas).
//   4. Reglas adminOnly.
//   5. Permisos RBAC del usuario.
//   6. Contexto operativo (local, depósito, multi-sucursal).
//
// Reglas de fallback (todas documentadas inline en el flujo):
//   - Si `grupoConfig` viene undefined o sin un campo, se usa el
//     `enabledByDefault` de cada entry del registry.
//   - Si `featuresActivas[X]` es undefined, se usa el
//     `enabledByDefault` del registry para esa feature. Si no
//     existe entry de feature, se trata como `false`.
//   - Si `integracionesActivas` es undefined, se trata como `[]`.
//   - Admin (`user.esAdmin === true`) bypassa permisos RBAC pero
//     NO bypassa módulos/features/integraciones (un admin de un
//     grupo que no contrató X no puede ver X).
//
// La función NO realiza efectos secundarios: no logguea, no
// muta argumentos, no toca red ni storage. Es 100% determinística.
// ============================================================

/** @typedef {import("./types.js").RegistryEntry} RegistryEntry */
/** @typedef {import("./types.js").User} User */
/** @typedef {import("./types.js").GrupoConfig} GrupoConfig */
/** @typedef {import("./types.js").CanAccessResult} CanAccessResult */

/**
 * Evalúa si una entrada del menú es visible para el usuario.
 *
 * @param {User}             user
 * @param {GrupoConfig}      grupoConfig
 * @param {RegistryEntry}    item
 * @param {RegistryEntry[]}  registry
 * @returns {CanAccessResult}
 */
export function canAccessMenuItem(user, grupoConfig, item, registry) {
  // Normalizamos entradas opcionales para no romper si vienen
  // parcialmente definidas. NO mutamos los argumentos originales.
  const safeUser = user || {};
  const safeConfig = grupoConfig || {};
  const safeRegistry = Array.isArray(registry) ? registry : [];

  const permisos = Array.isArray(safeUser.permisos) ? safeUser.permisos : [];
  const esAdmin = safeUser.esAdmin === true;

  // ----------------------------------------------------------
  // 1. Tipo "core": saltea checks de módulo/feature/integración.
  // ----------------------------------------------------------
  if (item.type !== "core") {
    // ------------------------------------------------------
    // 2. Módulo activo.
    //    - Si la propia entrada es type "module", chequeamos
    //      que su moduleKey esté en modulosActivos. Si no
    //      está, se permite cuando enabledByDefault === true.
    //    - Si tiene `requiredModule`, mismo chequeo contra
    //      ese moduleKey.
    // ------------------------------------------------------
    if (item.type === "module") {
      const modulosActivos = Array.isArray(safeConfig.modulosActivos)
        ? safeConfig.modulosActivos
        : null;

      const contratado =
        modulosActivos !== null
          ? modulosActivos.includes(item.moduleKey)
          : safeRegistry.find((r) => r.moduleKey === item.moduleKey)
              ?.enabledByDefault === true;

      if (!contratado) {
        return {
          visible: false,
          reason: "modulo-no-contratado:" + item.moduleKey,
        };
      }
    }

    if (item.requiredModule) {
      const modulosActivos = Array.isArray(safeConfig.modulosActivos)
        ? safeConfig.modulosActivos
        : null;

      const contratado =
        modulosActivos !== null
          ? modulosActivos.includes(item.requiredModule)
          : safeRegistry.find((r) => r.moduleKey === item.requiredModule)
              ?.enabledByDefault === true;

      if (!contratado) {
        return {
          visible: false,
          reason: "modulo-no-contratado:" + item.requiredModule,
        };
      }
    }

    // ------------------------------------------------------
    // 3. Feature requerida.
    //    Si está explícitamente en featuresActivas usamos ese
    //    valor; si no, caemos al enabledByDefault del registry.
    // ------------------------------------------------------
    if (item.requiredFeature) {
      const features = safeConfig.featuresActivas || {};
      const f = features[item.requiredFeature];
      const fallback =
        safeRegistry.find((r) => r.moduleKey === item.requiredFeature)
          ?.enabledByDefault ?? false;

      if (f === false || (f === undefined && !fallback)) {
        return {
          visible: false,
          reason: "feature-inactiva:" + item.requiredFeature,
        };
      }
    }

    // ------------------------------------------------------
    // 3b. Integración requerida.
    //     integracionesActivas undefined -> []
    // ------------------------------------------------------
    if (item.requiredIntegration) {
      const integraciones = Array.isArray(safeConfig.integracionesActivas)
        ? safeConfig.integracionesActivas
        : [];

      if (!integraciones.includes(item.requiredIntegration)) {
        return {
          visible: false,
          reason: "integracion-inactiva:" + item.requiredIntegration,
        };
      }
    }
  }

  // ----------------------------------------------------------
  // 4. adminOnly.
  // ----------------------------------------------------------
  if (item.adminOnly && !esAdmin) {
    return { visible: false, reason: "admin-only" };
  }

  // ----------------------------------------------------------
  // 5. Permisos RBAC (admin bypassa).
  // ----------------------------------------------------------
  if (!esAdmin) {
    if (item.permission && !permisos.includes(item.permission)) {
      return { visible: false, reason: "sin-permiso:" + item.permission };
    }

    if (
      Array.isArray(item.requiredAnyPerms) &&
      item.requiredAnyPerms.length > 0 &&
      !item.requiredAnyPerms.some((p) => permisos.includes(p))
    ) {
      return { visible: false, reason: "sin-any-perms" };
    }

    if (
      Array.isArray(item.requiredAllPerms) &&
      item.requiredAllPerms.length > 0 &&
      !item.requiredAllPerms.every((p) => permisos.includes(p))
    ) {
      return { visible: false, reason: "sin-all-perms" };
    }
  }

  // ----------------------------------------------------------
  // 6. Contexto operativo.
  // ----------------------------------------------------------
  if (item.localOnly && (!safeUser.localId || safeUser.esDeposito)) {
    return { visible: false, reason: "no-local" };
  }

  if (item.depositoOnly && (!safeUser.localId || !safeUser.esDeposito)) {
    return { visible: false, reason: "no-deposito" };
  }

  if (item.multiSucursalOnly) {
    const features = safeConfig.featuresActivas || {};
    const multi = features.multiSucursal;
    const cantidad =
      typeof safeConfig.cantidadLocales === "number"
        ? safeConfig.cantidadLocales
        : 1;

    if (!multi || cantidad <= 1) {
      return { visible: false, reason: "no-multi-sucursal" };
    }
  }

  // ----------------------------------------------------------
  // 7. Visible.
  // ----------------------------------------------------------
  return { visible: true };
}
