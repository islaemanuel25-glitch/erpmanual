// ============================================================
// lib/menu/commercialAccess.js
//
// Helpers puros para evaluar la capa COMERCIAL del menú modular:
// módulos contratados, features activas, integraciones activas y
// límites operativos del grupo (tenant).
//
// Etapa 3 del refactor modular/comercial:
//   - Los helpers leen PRIMERO el shape nuevo
//     (`modules` / `features` / `integrations` / `limits`) y caen
//     al legacy (`modulosActivos` / `featuresActivas` /
//     `integracionesActivas`) si el nuevo está ausente.
//   - Se preservan TODAS las firmas y exports previos.
//   - Se agregan: `getLimitValue`, `isLimitUnlimited`,
//     `getCommercialAccess` (shape normalizado).
//
// Reglas de fallback:
//   - `modules` y `modulosActivos` undefined → cae al
//     `enabledByDefault` del registry para ese moduleKey.
//   - `features[X]` y `featuresActivas[X]` undefined → cae al
//     `enabledByDefault` del registry. Si no existe entry, false.
//   - `integrations` y `integracionesActivas` undefined → [].
//   - `cantidadLocales` undefined → 1.
//
// Las funciones NO mutan argumentos, no acceden a red/BD/storage,
// son 100% determinísticas.
// ============================================================

import { DEFAULT_GRUPO_CONFIG } from "../empresa-config.js";

/** @typedef {import("./types.js").RegistryEntry} RegistryEntry */
/** @typedef {import("./types.js").GrupoConfig}   GrupoConfig */

// ============================================================
// Lectores internos: prefieren shape nuevo, caen al legacy.
// Devuelven null cuando no hay declaración explícita en ningún
// shape (para que los callers decidan el fallback definitivo).
// ============================================================

function readModulesArray(grupoConfig) {
  if (Array.isArray(grupoConfig?.modules)) return grupoConfig.modules;
  if (Array.isArray(grupoConfig?.modulosActivos)) return grupoConfig.modulosActivos;
  return null;
}

function readFeaturesObject(grupoConfig) {
  const newF = grupoConfig?.features;
  if (newF && typeof newF === "object" && !Array.isArray(newF)) return newF;
  const oldF = grupoConfig?.featuresActivas;
  if (oldF && typeof oldF === "object" && !Array.isArray(oldF)) return oldF;
  return null;
}

function readIntegrationsArray(grupoConfig) {
  if (Array.isArray(grupoConfig?.integrations)) return grupoConfig.integrations;
  if (Array.isArray(grupoConfig?.integracionesActivas)) {
    return grupoConfig.integracionesActivas;
  }
  return null;
}

function readLimitsObject(grupoConfig) {
  const l = grupoConfig?.limits;
  if (l && typeof l === "object" && !Array.isArray(l)) return l;
  return null;
}

function readCantidadLocales(grupoConfig) {
  const n = grupoConfig?.cantidadLocales;
  return typeof n === "number" ? n : 1;
}

// ============================================================
// API pública preservada (firmas idénticas a Etapa 2).
// ============================================================

/**
 * Lista de moduleKey contratados por el grupo.
 * Si no hay declaración explícita en ningún shape, devuelve [].
 *
 * @param {GrupoConfig} [grupoConfig]
 * @returns {string[]}
 */
export function getActiveModules(grupoConfig) {
  return readModulesArray(grupoConfig) ?? [];
}

/**
 * Mapa featureKey -> boolean con las features activas del grupo.
 * Si no hay declaración explícita en ningún shape, devuelve {}.
 *
 * @param {GrupoConfig} [grupoConfig]
 * @returns {Record<string, boolean>}
 */
export function getActiveFeatures(grupoConfig) {
  return readFeaturesObject(grupoConfig) ?? {};
}

/**
 * Lista de integrationKey activas en el grupo.
 * Si no hay declaración explícita en ningún shape, devuelve [].
 *
 * @param {GrupoConfig} [grupoConfig]
 * @returns {string[]}
 */
export function getActiveIntegrations(grupoConfig) {
  return readIntegrationsArray(grupoConfig) ?? [];
}

/**
 * ¿El módulo está contratado por el grupo?
 *
 * - Si hay declaración explícita (modules o modulosActivos), manda esa lista.
 * - Si no, se usa el `enabledByDefault` del entry del registry.
 *
 * @param {GrupoConfig}     [grupoConfig]
 * @param {string}          moduleKey
 * @param {RegistryEntry[]} [registry]
 * @returns {boolean}
 */
export function isModuleActive(grupoConfig, moduleKey, registry) {
  if (!moduleKey) return false;

  const modules = readModulesArray(grupoConfig);
  if (modules !== null) return modules.includes(moduleKey);

  const safeRegistry = Array.isArray(registry) ? registry : [];
  return (
    safeRegistry.find((r) => r.moduleKey === moduleKey)?.enabledByDefault ===
    true
  );
}

/**
 * ¿La feature está activa en el grupo?
 *
 * - Si está explícita en el shape nuevo o legacy:
 *     true  -> activa
 *     false -> inactiva
 * - Si está undefined en ambos -> cae al `enabledByDefault` del
 *   registry. Si no hay entry, false.
 *
 * @param {GrupoConfig}     [grupoConfig]
 * @param {string}          featureKey
 * @param {RegistryEntry[]} [registry]
 * @returns {boolean}
 */
export function isFeatureActive(grupoConfig, featureKey, registry) {
  if (!featureKey) return false;

  const features = readFeaturesObject(grupoConfig) ?? {};
  const v = features[featureKey];
  if (v === true) return true;
  if (v === false) return false;

  const safeRegistry = Array.isArray(registry) ? registry : [];
  return (
    safeRegistry.find((r) => r.moduleKey === featureKey)?.enabledByDefault ===
    true
  );
}

/**
 * ¿La integración está activa en el grupo?
 * No usa fallback al registry: una integración no declarada se
 * considera inactiva.
 *
 * @param {GrupoConfig} [grupoConfig]
 * @param {string}      integrationKey
 * @returns {boolean}
 */
export function isIntegrationActive(grupoConfig, integrationKey) {
  if (!integrationKey) return false;
  const integraciones = readIntegrationsArray(grupoConfig) ?? [];
  return integraciones.includes(integrationKey);
}

/**
 * ¿Multi-sucursal está habilitado como CAPACIDAD OPERATIVA?
 * Requiere AMBAS condiciones:
 *   - feature `multiSucursal` activa.
 *   - `cantidadLocales` > 1.
 *
 * @param {GrupoConfig} [grupoConfig]
 * @returns {boolean}
 */
export function isMultiSucursalEnabled(grupoConfig) {
  const features = readFeaturesObject(grupoConfig) ?? {};
  const multi = features.multiSucursal === true;
  const cantidad = readCantidadLocales(grupoConfig);
  return multi && cantidad > 1;
}

// ============================================================
// API nueva (Etapa 3): límites y shape normalizado.
// ============================================================

/**
 * Devuelve el valor numérico de un límite, o null si:
 *   - el límite no está declarado en `limits`
 *   - el valor declarado es null (ilimitado)
 *   - el valor declarado no es un número
 *
 * NOTA: este helper SOLO lee del shape nuevo `limits`. No hay
 * legacy equivalente para límites — son una incorporación de
 * Etapa 3.
 *
 * @param {GrupoConfig} [grupoConfig]
 * @param {string}      limitKey
 * @returns {number|null}
 */
export function getLimitValue(grupoConfig, limitKey) {
  if (!limitKey) return null;
  const limits = readLimitsObject(grupoConfig);
  if (!limits) return null;
  if (!Object.prototype.hasOwnProperty.call(limits, limitKey)) return null;
  const v = limits[limitKey];
  return typeof v === "number" ? v : null;
}

/**
 * True si el límite es ilimitado (null) o no está declarado.
 *
 * @param {GrupoConfig} [grupoConfig]
 * @param {string}      limitKey
 * @returns {boolean}
 */
export function isLimitUnlimited(grupoConfig, limitKey) {
  return getLimitValue(grupoConfig, limitKey) === null;
}

/**
 * Devuelve la config comercial NORMALIZADA al shape nuevo:
 *   { modules, features, integrations, limits, cantidadLocales }
 *
 * Reglas:
 *   - grupoConfig null/undefined          → DEFAULT_GRUPO_CONFIG.
 *   - modules undefined                   → DEFAULT.modules.
 *   - modules [] explícito                → respetado (devuelve []).
 *   - features undefined                  → DEFAULT.features.
 *   - integrations undefined              → DEFAULT.integrations.
 *   - limits undefined                    → DEFAULT.limits.
 *   - cantidadLocales undefined           → DEFAULT.cantidadLocales (1).
 *   - shape legacy presente               → tomado como nuevo (alias).
 *
 * No tira errores por keys desconocidas.
 *
 * @param {GrupoConfig} [grupoConfig]
 * @returns {{
 *   modules: string[],
 *   features: Record<string, boolean>,
 *   integrations: string[],
 *   limits: Record<string, number|null>,
 *   cantidadLocales: number
 * }}
 */
export function getCommercialAccess(grupoConfig) {
  if (grupoConfig === null || grupoConfig === undefined) {
    return {
      modules: DEFAULT_GRUPO_CONFIG.modules,
      features: DEFAULT_GRUPO_CONFIG.features,
      integrations: DEFAULT_GRUPO_CONFIG.integrations,
      limits: DEFAULT_GRUPO_CONFIG.limits,
      cantidadLocales: DEFAULT_GRUPO_CONFIG.cantidadLocales,
    };
  }

  const modules = readModulesArray(grupoConfig) ?? DEFAULT_GRUPO_CONFIG.modules;
  const features =
    readFeaturesObject(grupoConfig) ?? DEFAULT_GRUPO_CONFIG.features;
  const integrations =
    readIntegrationsArray(grupoConfig) ?? DEFAULT_GRUPO_CONFIG.integrations;
  const limits = readLimitsObject(grupoConfig) ?? DEFAULT_GRUPO_CONFIG.limits;
  const cantidadLocales =
    typeof grupoConfig.cantidadLocales === "number"
      ? grupoConfig.cantidadLocales
      : DEFAULT_GRUPO_CONFIG.cantidadLocales;

  return { modules, features, integrations, limits, cantidadLocales };
}
