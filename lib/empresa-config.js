// ============================================================
// lib/empresa-config.js
//
// Mock inicial de la config comercial. Conceptualmente representa
// la `ConfiguracionGrupo` del `Grupo` activo (tenant). Más adelante
// se reemplazará por una lectura de BD vía Prisma.
//
// Etapa 3 del refactor modular/comercial:
//   - Shape normalizado al formato futuro:
//       { modules, features, integrations, limits, cantidadLocales }
//   - Aliases legacy (modulosActivos / featuresActivas /
//     integracionesActivas) coexisten apuntando a la MISMA data
//     por referencia.
//   - Los defaults se derivan de `lib/menu/capabilityCatalog.js`.
//
// Etapa 4.5 — perfiles paralelos para no romper el menú actual
// cuando Etapa 5 conecte canAccess + useMenu:
//
//   - DEFAULT_GRUPO_CONFIG  (single-local SaaS conservador):
//     modules sin transferencias, multiSucursal=false,
//     maxLocales=1, sin depositoCentral. Representa el target
//     comercial real para un cliente single-local nuevo.
//
//   - COMPAT_GRUPO_CONFIG   (compat de desarrollo):
//     modules + "transferencias", multiSucursal=true,
//     depositoCentral=true, cantidadLocales=2, todos los
//     límites null. Pensado para que cuando useMenu empiece a
//     evaluar capacidades comerciales, NINGÚN grupo o item
//     visible hoy quede oculto por la migración.
//
//   - ACTIVE_GRUPO_CONFIG   (puntero al perfil activo):
//     hoy = COMPAT. Cuando se decida cortar a la semántica
//     comercial real, basta con apuntarlo a DEFAULT.
//
// `getGrupoConfig()` y `getGrupoConfigAsync()` devuelven
// `ACTIVE_GRUPO_CONFIG`. La UI no consume todavía estas funciones;
// la conexión efectiva ocurre en Etapa 5.
// ============================================================

import {
  getDefaultModules,
  getDefaultFeatures,
  getDefaultIntegrations,
  getDefaultLimits,
} from "./menu/capabilityCatalog.js";

/** @typedef {import("./menu/types.js").GrupoConfig} GrupoConfig */

// Calculados una sola vez al cargar el módulo.
const _modules = getDefaultModules();
const _features = getDefaultFeatures();
const _integrations = getDefaultIntegrations();
const _limits = getDefaultLimits();

/**
 * Config por defecto: cliente single-local conservador (target
 * comercial para un grupo nuevo recién creado).
 *
 * Shape nuevo + aliases legacy (misma data por referencia).
 *
 * Defaults concretos (heredados del capabilityCatalog):
 *   - modules: pos, stock, compras, proveedores, reportes,
 *              auditoriaPos, clientes, administracion, configuracion.
 *              (transferencias y empleados apagados).
 *   - features: controlTurnos=true, controlCaja=true,
 *               stockPorLocal=true; multiSucursal=false,
 *               depositoCentral=false, reportesPorLocal=false,
 *               ventaACuentaCorriente=false, puntosFidelidad=false.
 *   - integrations: [] (todas apagadas).
 *   - limits: maxLocales=1; resto null (ilimitado).
 *   - cantidadLocales: 1.
 *
 * @type {GrupoConfig}
 */
export const DEFAULT_GRUPO_CONFIG = {
  // -------- Shape nuevo --------
  modules: _modules,
  features: _features,
  integrations: _integrations,
  limits: _limits,
  cantidadLocales: 1,

  // -------- Aliases legacy (misma data por referencia) --------
  modulosActivos: _modules,
  featuresActivas: _features,
  integracionesActivas: _integrations,
};

// ============================================================
// COMPAT_GRUPO_CONFIG
//
// Perfil de DESARROLLO/COMPATIBILIDAD: deja activas todas las
// capacidades necesarias para que el menú visible actual no
// pierda items cuando Etapa 5 enchufe el filtrado comercial real.
//
// Diferencias respecto a DEFAULT_GRUPO_CONFIG:
//   - modules: incluye además "transferencias".
//   - features.multiSucursal:    true   (habilita grupo Transferencias y Locales).
//   - features.depositoCentral:  true   (preserva "Ganancia Depósito" en Reportes).
//   - cantidadLocales:           2      (necesario junto con multiSucursal).
//   - limits:                    todos null (sin tope durante desarrollo).
//
// El resto de las features mantiene el default conservador
// (controlTurnos/controlCaja/stockPorLocal en true; el resto
// en false) que ya hoy preserva el comportamiento del menú.
// ============================================================

const _compatModules = [..._modules, "transferencias"];

const _compatFeatures = {
  ..._features,
  multiSucursal: true,
  depositoCentral: true,
  controlTurnos: true,
  controlCaja: true,
  stockPorLocal: true,
  reportesPorLocal: false,
  ventaACuentaCorriente: false,
  puntosFidelidad: false,
};

const _compatIntegrations = [];

const _compatLimits = {
  maxVentasMes: null,
  maxFacturasMes: null,
  maxUsuarios: null,
  maxLocales: null,
  maxOperadoresActivos: null,
};

/**
 * Config de compatibilidad para que el menú visible actual no
 * pierda módulos cuando Etapa 5 conecte el filtrado comercial.
 *
 * @type {GrupoConfig}
 */
export const COMPAT_GRUPO_CONFIG = {
  // -------- Shape nuevo --------
  modules: _compatModules,
  features: _compatFeatures,
  integrations: _compatIntegrations,
  limits: _compatLimits,
  cantidadLocales: 2,

  // -------- Aliases legacy (misma data por referencia) --------
  modulosActivos: _compatModules,
  featuresActivas: _compatFeatures,
  integracionesActivas: _compatIntegrations,
};

// ============================================================
// ACTIVE_GRUPO_CONFIG
//
// Puntero al perfil que `getGrupoConfig()` debe devolver hoy.
// En Etapa 4.5 apunta a COMPAT para no romper el menú visible.
// Cuando se decida cortar a comportamiento comercial real,
// alcanza con cambiar este puntero a DEFAULT_GRUPO_CONFIG.
//
// @type {GrupoConfig}
// ============================================================
export const ACTIVE_GRUPO_CONFIG = COMPAT_GRUPO_CONFIG;

/**
 * Devuelve la config comercial del grupo activo (síncrono).
 * Hoy: ACTIVE_GRUPO_CONFIG (= COMPAT_GRUPO_CONFIG).
 *
 * @returns {GrupoConfig}
 */
export function getGrupoConfig() {
  return ACTIVE_GRUPO_CONFIG;
}

/**
 * Versión async de `getGrupoConfig`. Hoy resuelve inmediatamente
 * con `ACTIVE_GRUPO_CONFIG`.
 *
 * @returns {Promise<GrupoConfig>}
 */
export function getGrupoConfigAsync() {
  return Promise.resolve(ACTIVE_GRUPO_CONFIG);
}
