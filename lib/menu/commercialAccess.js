// ============================================================
// lib/menu/commercialAccess.js
//
// Helpers puros para evaluar la capa COMERCIAL del menú modular:
// módulos contratados, features activas, integraciones activas.
//
// Estos helpers reflejan EXACTAMENTE las reglas que ya implementa
// `canAccessMenuItem` en lib/menu/canAccess.js (Etapa 0). Existen
// como API pública para que cualquier capa (UI, APIs, guards) pueda
// consultar el estado comercial sin reimplementar la lógica.
//
// Reglas de fallback:
//   - Si `grupoConfig.modulosActivos` no es array, se cae al
//     `enabledByDefault` del registry para ese moduleKey.
//   - Si `grupoConfig.featuresActivas[X]` es undefined, se usa
//     `enabledByDefault` del registry. Si no hay entry, false.
//   - Si `grupoConfig.integracionesActivas` no es array, se trata
//     como [].
//
// Las funciones NO mutan argumentos, no acceden a red, BD ni
// storage, y son 100% determinísticas.
// ============================================================

/** @typedef {import("./types.js").RegistryEntry} RegistryEntry */
/** @typedef {import("./types.js").GrupoConfig}   GrupoConfig */

/**
 * Lista de moduleKey contratados por el grupo.
 *
 * - Si `modulosActivos` no es array, devuelve [].
 *
 * @param {GrupoConfig} [grupoConfig]
 * @returns {string[]}
 */
export function getActiveModules(grupoConfig) {
  return Array.isArray(grupoConfig?.modulosActivos)
    ? grupoConfig.modulosActivos
    : [];
}

/**
 * Mapa featureKey -> boolean con las features activas del grupo.
 *
 * - Si `featuresActivas` no es objeto, devuelve {}.
 *
 * @param {GrupoConfig} [grupoConfig]
 * @returns {Record<string, boolean>}
 */
export function getActiveFeatures(grupoConfig) {
  const f = grupoConfig?.featuresActivas;
  return f && typeof f === "object" && !Array.isArray(f) ? f : {};
}

/**
 * Lista de integrationKey activas en el grupo.
 *
 * - Si `integracionesActivas` no es array, devuelve [].
 *
 * @param {GrupoConfig} [grupoConfig]
 * @returns {string[]}
 */
export function getActiveIntegrations(grupoConfig) {
  return Array.isArray(grupoConfig?.integracionesActivas)
    ? grupoConfig.integracionesActivas
    : [];
}

/**
 * ¿El módulo está contratado por el grupo?
 *
 * - Si `modulosActivos` está definido como array, manda esa lista.
 * - Si no, se usa el `enabledByDefault` del entry del registry.
 *
 * @param {GrupoConfig}     [grupoConfig]
 * @param {string}          moduleKey
 * @param {RegistryEntry[]} [registry]
 * @returns {boolean}
 */
export function isModuleActive(grupoConfig, moduleKey, registry) {
  if (!moduleKey) return false;

  const modulosActivos = Array.isArray(grupoConfig?.modulosActivos)
    ? grupoConfig.modulosActivos
    : null;

  if (modulosActivos !== null) {
    return modulosActivos.includes(moduleKey);
  }

  const safeRegistry = Array.isArray(registry) ? registry : [];
  return (
    safeRegistry.find((r) => r.moduleKey === moduleKey)?.enabledByDefault ===
    true
  );
}

/**
 * ¿La feature está activa en el grupo?
 *
 * - Si `featuresActivas[featureKey]` es true → activa.
 * - Si es false → inactiva.
 * - Si es undefined → cae al `enabledByDefault` del registry.
 *   Si no existe entry para esa feature en el registry, devuelve
 *   false (no se asume activa por descuido).
 *
 * @param {GrupoConfig}     [grupoConfig]
 * @param {string}          featureKey
 * @param {RegistryEntry[]} [registry]
 * @returns {boolean}
 */
export function isFeatureActive(grupoConfig, featureKey, registry) {
  if (!featureKey) return false;

  const features = grupoConfig?.featuresActivas || {};
  const v = features[featureKey];

  if (v === true) return true;
  if (v === false) return false;

  const safeRegistry = Array.isArray(registry) ? registry : [];
  const entry = safeRegistry.find((r) => r.moduleKey === featureKey);
  return entry?.enabledByDefault === true;
}

/**
 * ¿La integración está activa en el grupo?
 *
 * - No usa fallback al registry: una integración no declarada en
 *   `integracionesActivas` se considera inactiva.
 *
 * @param {GrupoConfig} [grupoConfig]
 * @param {string}      integrationKey
 * @returns {boolean}
 */
export function isIntegrationActive(grupoConfig, integrationKey) {
  if (!integrationKey) return false;
  const integraciones = Array.isArray(grupoConfig?.integracionesActivas)
    ? grupoConfig.integracionesActivas
    : [];
  return integraciones.includes(integrationKey);
}

/**
 * ¿Multi-sucursal está habilitado como CAPACIDAD OPERATIVA?
 *
 * Requiere AMBAS condiciones:
 *   - feature `multiSucursal` activa.
 *   - `cantidadLocales` > 1.
 *
 * Esta es la misma regla que `canAccessMenuItem` aplica para
 * `multiSucursalOnly`. Existe como helper para que la UI pueda
 * preguntar la capacidad sin reimplementar la condición.
 *
 * @param {GrupoConfig} [grupoConfig]
 * @returns {boolean}
 */
export function isMultiSucursalEnabled(grupoConfig) {
  const features = grupoConfig?.featuresActivas || {};
  const multi = features.multiSucursal === true;
  const cantidad =
    typeof grupoConfig?.cantidadLocales === "number"
      ? grupoConfig.cantidadLocales
      : 1;
  return multi && cantidad > 1;
}
