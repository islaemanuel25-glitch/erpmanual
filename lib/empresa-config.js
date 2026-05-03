// ============================================================
// lib/empresa-config.js
//
// Mock inicial de la config comercial. Conceptualmente representa
// la `ConfiguracionGrupo` del `Grupo` activo (tenant). Más adelante
// se reemplazará por una lectura de BD vía Prisma. Por ahora
// hardcoded para que el sistema funcione sin migración.
// ============================================================

/** @typedef {import("./menu/types.js").GrupoConfig} GrupoConfig */

/**
 * Config por defecto: cliente single-local conservador.
 *
 * Incluye los módulos comerciales básicos contratados, multi-sucursal
 * apagado (no ve "Locales", "Transferencias entre locales", ni el
 * selector multi-local) y sin integraciones externas.
 *
 * @type {GrupoConfig}
 */
export const DEFAULT_GRUPO_CONFIG = {
  modulosActivos: [
    "inicio",
    "pos-ventas",
    "stock",
    "compras",
    "reportes",
    "administracion",
    "configuracion",
  ],
  featuresActivas: {
    multiSucursal: false,
    puntosFidelidad: false,
    cuentaCorriente: false,
  },
  integracionesActivas: [],
  cantidadLocales: 1,
};

/**
 * Devuelve la config comercial del grupo activo (síncrono).
 *
 * Por ahora estático. Más adelante leerá de ConfiguracionGrupo.
 *
 * @returns {GrupoConfig}
 */
export function getGrupoConfig() {
  return DEFAULT_GRUPO_CONFIG;
}

/**
 * Versión async de `getGrupoConfig` para cuando migremos al endpoint
 * (lectura desde BD). Hoy resuelve inmediatamente con el mismo objeto.
 *
 * @returns {Promise<GrupoConfig>}
 */
export function getGrupoConfigAsync() {
  return Promise.resolve(DEFAULT_GRUPO_CONFIG);
}
