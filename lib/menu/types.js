// ============================================================
// lib/menu/types.js
//
// Definición de tipos del nuevo registry de menú modular comercial.
//
// Este archivo NO contiene código ejecutable: solo bloques JSDoc.
// JavaScript no tiene sistema de tipos en runtime; usamos JSDoc
// para que el IDE (VS Code, WebStorm, etc.) ofrezca IntelliSense
// y para que el contrato de los datos quede documentado en un
// único lugar consumible por humanos y por el editor.
//
// Esta capa convive en paralelo con `lib/menuConfig.js` (RBAC
// clásico). NO reemplaza nada todavía.
// ============================================================

/**
 * Tipo de entrada del registry.
 *
 * - "core":         módulo nucleo siempre visible (ej. Inicio).
 * - "module":       módulo comercial gateado por contratación
 *                   (`grupoConfig.modulosActivos`).
 * - "feature":      flag funcional dentro de un módulo
 *                   (`grupoConfig.featuresActivas[X]`).
 * - "integration":  integración externa opcional
 *                   (`grupoConfig.integracionesActivas`).
 *
 * @typedef {"core" | "module" | "feature" | "integration"} RegistryEntryType
 */

/**
 * Entrada del registry de menú.
 *
 * @typedef {Object} RegistryEntry
 * @property {string}            moduleKey          Identificador único de la entrada.
 * @property {string}            label              Etiqueta visible al usuario.
 * @property {RegistryEntryType} type               Tipo de entrada.
 * @property {boolean}           enabledByDefault   Si está activo cuando no hay config explícita.
 * @property {string}            [requiredModule]      Módulo del que depende esta entrada.
 * @property {string}            [requiredFeature]     Feature del que depende esta entrada.
 * @property {string}            [requiredIntegration] Integración de la que depende esta entrada.
 * @property {string}            [permission]          Permiso único requerido (RBAC).
 * @property {string[]}          [requiredAnyPerms]    Lista: alcanza con tener UNO de estos permisos.
 * @property {string[]}          [requiredAllPerms]    Lista: necesita TODOS estos permisos.
 * @property {boolean}           [adminOnly]           Solo visible para usuarios admin.
 * @property {string}            [href]                Ruta de navegación.
 * @property {RegistryEntry[]}   [items]               Sub-entradas (mismo contrato).
 * @property {boolean}           [localOnly]           Solo si el usuario tiene local asignado y NO es depósito.
 * @property {boolean}           [depositoOnly]        Solo si el usuario es operador de depósito.
 * @property {boolean}           [multiSucursalOnly]   Solo si el grupo tiene multi-sucursal y >1 local.
 * @property {string}            [description]         Texto largo para UI de configuración.
 * @property {*}                 [icon]                Componente de ícono (lucide-react u otro).
 * @property {string}            [color]               Token de color (blue, teal, purple, etc.).
 */

/**
 * Usuario activo (perfil minimal usado por canAccessMenuItem).
 *
 * @typedef {Object} User
 * @property {string|number}   id
 * @property {boolean}         esAdmin       True si tiene rol admin (bypassa permisos RBAC).
 * @property {string[]}        permisos      Lista de permisos del usuario.
 * @property {string|null}     [localId]     Id del local asignado (null si no tiene).
 * @property {boolean}         [esDeposito]  True si el local del usuario es depósito.
 */

/**
 * Configuración comercial del grupo (tenant).
 *
 * Conceptualmente representa lo que vivirá en `ConfiguracionGrupo`
 * cuando se haga la migración. Por ahora se mockea desde
 * `lib/empresa-config.js`.
 *
 * @typedef {Object} GrupoConfig
 * @property {string[]}                 modulosActivos        Lista de moduleKey contratados.
 * @property {Record<string, boolean>}  featuresActivas       Mapa featureKey -> activo.
 * @property {string[]}                 integracionesActivas  Lista de integrationKey activas.
 * @property {number}                   cantidadLocales       Cantidad de locales del grupo.
 */

/**
 * Resultado de evaluar visibilidad de una entrada del menú.
 *
 * @typedef {Object} CanAccessResult
 * @property {boolean}  visible    True si el usuario puede ver el item.
 * @property {string}   [reason]   Código machine-readable explicando por qué fue ocultado.
 */

export {};
