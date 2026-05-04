// ============================================================
// lib/menu/capabilityCatalog.js
//
// Catálogo central de CAPACIDADES posibles del ERP Azul.
//
// Qué define este archivo:
//   - El universo de módulos, features, integraciones y límites
//     que el producto puede ofrecer.
//   - El estado conceptual de cada uno (active / future).
//   - El default conservador con el que arranca un grupo nuevo
//     cuando todavía no tiene config explícita en BD.
//
// Qué NO define este archivo:
//   - NO define precios. Cualquier estructura de planes/billing
//     vive en otra capa (fuera del menú).
//   - NO define permisos RBAC. Eso vive en `lib/menu/permissions.js`
//     y en los roles del usuario.
//   - NO declara la estructura del menú. Eso vive en `lib/menu/registry.js`.
//   - NO decide qué ve un usuario concreto. Eso lo cruzan
//     `canAccessMenuItem` + `useMenu` en etapas posteriores.
//
// Consumidores futuros (todavía no enchufados, no romper):
//   - `lib/menu/commercialAccess.js`: tomará los defaults de acá
//     cuando el grupo no tenga config explícita.
//   - `lib/menu/registry.js`: sus campos `requiredModule` /
//     `requiredFeature` / `requiredIntegration` deberán referirse
//     a keys declaradas en este catálogo.
//   - UI de configuración del grupo (futura): listará estas
//     capacidades para que un super-admin las active/desactive.
// ============================================================

// ------------------------------------------------------------
// Tipos de capacidad
// ------------------------------------------------------------
export const CAPABILITY_TYPES = {
  MODULE: "module",
  FEATURE: "feature",
  INTEGRATION: "integration",
  LIMIT: "limit",
};

// ------------------------------------------------------------
// Módulos: servicios funcionales contratables.
// `enabledByDefault: true` => activo automáticamente para un
//   grupo recién creado sin config explícita.
// `status: "active"`  => existe y es usable hoy.
// `status: "future"`  => declarado pero todavía sin pantallas
//                        implementadas; nunca renderizar hasta
//                        que la página exista.
// ------------------------------------------------------------
export const MODULE_CAPABILITIES = {
  pos: {
    key: "pos",
    type: "module",
    label: "Punto de venta",
    description: "POS de mostrador con turnos, pedidos y tickets.",
    enabledByDefault: true,
    status: "active",
  },
  stock: {
    key: "stock",
    type: "module",
    label: "Inventario",
    description: "Stock de productos, categorías y altas/bajas.",
    enabledByDefault: true,
    status: "active",
  },
  compras: {
    key: "compras",
    type: "module",
    label: "Compras",
    description: "Compras a proveedor y márgenes asociados.",
    enabledByDefault: true,
    status: "active",
  },
  proveedores: {
    key: "proveedores",
    type: "module",
    label: "Proveedores",
    description: "Gestión de proveedores; sub-módulo de compras.",
    enabledByDefault: true,
    status: "active",
  },
  reportes: {
    key: "reportes",
    type: "module",
    label: "Reportes",
    description: "Reportes de ventas y panel de métricas.",
    enabledByDefault: true,
    status: "active",
  },
  auditoriaPos: {
    key: "auditoriaPos",
    type: "module",
    label: "Auditoría POS",
    description: "Trazabilidad detallada de ventas y operadores en POS.",
    enabledByDefault: true,
    status: "active",
  },
  clientes: {
    key: "clientes",
    type: "module",
    label: "Clientes",
    description: "Padrón de clientes y analytics asociadas.",
    enabledByDefault: true,
    status: "active",
  },
  transferencias: {
    key: "transferencias",
    type: "module",
    label: "Transferencias entre locales",
    description:
      "Movimiento de mercadería entre locales y depósitos. Requiere multi-sucursal activa.",
    // Existe como módulo real, pero por defecto queda apagado:
    // depende operativamente de la feature `multiSucursal`, que
    // también arranca apagada.
    enabledByDefault: false,
    status: "active",
  },
  administracion: {
    key: "administracion",
    type: "module",
    label: "Administración",
    description: "Usuarios, operadores, roles y administración del grupo.",
    enabledByDefault: true,
    status: "active",
  },
  configuracion: {
    key: "configuracion",
    type: "module",
    label: "Configuración",
    description: "Apariencia, ticket, locales, integraciones y grupos.",
    enabledByDefault: true,
    status: "active",
  },
  empleados: {
    key: "empleados",
    type: "module",
    label: "Empleados",
    description:
      "RRHH: legajo, sueldos, asistencia y pagos. Pendiente de implementación.",
    enabledByDefault: false,
    status: "future",
  },
};

// ------------------------------------------------------------
// Features: flags de comportamiento dentro de uno o más módulos.
// ------------------------------------------------------------
export const FEATURE_CAPABILITIES = {
  multiSucursal: {
    key: "multiSucursal",
    type: "feature",
    label: "Multi-sucursal",
    description:
      "Habilita múltiples locales y depósitos, selector de contexto, transferencias y stock segregado.",
    enabledByDefault: false,
    status: "active",
  },
  depositoCentral: {
    key: "depositoCentral",
    type: "feature",
    label: "Depósito central",
    description:
      "Activa el concepto de depósito central para compras y reportes de ganancia.",
    enabledByDefault: false,
    status: "active",
  },
  controlTurnos: {
    key: "controlTurnos",
    type: "feature",
    label: "Control de turnos",
    description: "Apertura y cierre de turnos en POS, con operador asignado.",
    enabledByDefault: true,
    status: "active",
  },
  controlCaja: {
    key: "controlCaja",
    type: "feature",
    label: "Control de caja",
    description: "Arqueo de caja por turno y diferencias auditadas.",
    enabledByDefault: true,
    status: "active",
  },
  stockPorLocal: {
    key: "stockPorLocal",
    type: "feature",
    label: "Stock por local",
    description: "Stock segregado por local en lugar de stock global compartido.",
    enabledByDefault: true,
    status: "active",
  },
  reportesPorLocal: {
    key: "reportesPorLocal",
    type: "feature",
    label: "Reportes por local",
    description: "Reportes desglosados por local. Pendiente de implementación.",
    enabledByDefault: false,
    status: "future",
  },
  ventaACuentaCorriente: {
    key: "ventaACuentaCorriente",
    type: "feature",
    label: "Venta a cuenta corriente",
    description:
      "Permite ventas a cuenta corriente con saldo por cliente. Pendiente de implementación.",
    enabledByDefault: false,
    status: "future",
  },
  puntosFidelidad: {
    key: "puntosFidelidad",
    type: "feature",
    label: "Puntos de fidelidad",
    description:
      "Programa de puntos canjeables para clientes. Pendiente de implementación.",
    enabledByDefault: false,
    status: "future",
  },
};

// ------------------------------------------------------------
// Integraciones: conexiones a servicios externos.
// Todas arrancan apagadas y declaradas como future hasta que
// existan endpoints/UI propios.
// ------------------------------------------------------------
export const INTEGRATION_CAPABILITIES = {
  afip: {
    key: "afip",
    type: "integration",
    label: "AFIP / ARCA",
    description:
      "Facturación electrónica vía web service de AFIP/ARCA (factura A/B/C).",
    enabledByDefault: false,
    status: "future",
  },
  mercadoPago: {
    key: "mercadoPago",
    type: "integration",
    label: "Mercado Pago",
    description: "Cobros con QR y link de pago, conciliación automática.",
    enabledByDefault: false,
    status: "future",
  },
  whatsapp: {
    key: "whatsapp",
    type: "integration",
    label: "WhatsApp Business",
    description: "Envío de comprobantes y notificaciones por WhatsApp.",
    enabledByDefault: false,
    status: "future",
  },
  balanza: {
    key: "balanza",
    type: "integration",
    label: "Balanza comercial",
    description: "Lectura directa de balanzas comerciales en POS.",
    enabledByDefault: false,
    status: "future",
  },
  impresora: {
    key: "impresora",
    type: "integration",
    label: "Impresora térmica",
    description: "Impresión directa de tickets en impresora térmica.",
    enabledByDefault: false,
    status: "future",
  },
  ecommerce: {
    key: "ecommerce",
    type: "integration",
    label: "E-commerce",
    description: "Sincronización con tienda online (catálogo, stock, pedidos).",
    enabledByDefault: false,
    status: "future",
  },
};

// ------------------------------------------------------------
// Límites: cuotas operativas del grupo.
// `defaultValue` se usa cuando el grupo no tiene config explícita.
// `unlimitedValue` documenta el sentinel para "sin límite": null.
// Los límites NO afectan la VISIBILIDAD del menú; afectan a la
// UI de creación (ej. al alcanzar maxUsuarios la pantalla de
// alta bloquea, pero "Usuarios" sigue listado).
// ------------------------------------------------------------
export const LIMIT_CAPABILITIES = {
  maxVentasMes: {
    key: "maxVentasMes",
    type: "limit",
    label: "Ventas por mes",
    description: "Tope de ventas registradas por mes calendario. null = ilimitado.",
    defaultValue: null,
    unlimitedValue: null,
    status: "active",
  },
  maxFacturasMes: {
    key: "maxFacturasMes",
    type: "limit",
    label: "Facturas por mes",
    description: "Tope de comprobantes fiscales emitidos por mes. null = ilimitado.",
    defaultValue: null,
    unlimitedValue: null,
    status: "active",
  },
  maxUsuarios: {
    key: "maxUsuarios",
    type: "limit",
    label: "Usuarios",
    description: "Cantidad máxima de usuarios activos. null = ilimitado.",
    defaultValue: null,
    unlimitedValue: null,
    status: "active",
  },
  maxLocales: {
    key: "maxLocales",
    type: "limit",
    label: "Locales",
    description: "Cantidad máxima de locales habilitados. null = ilimitado.",
    defaultValue: 1,
    unlimitedValue: null,
    status: "active",
  },
  maxOperadoresActivos: {
    key: "maxOperadoresActivos",
    type: "limit",
    label: "Operadores activos",
    description:
      "Cantidad máxima de operadores activos simultáneamente. null = ilimitado.",
    defaultValue: null,
    unlimitedValue: null,
    status: "active",
  },
};

// ------------------------------------------------------------
// Catálogo unificado por categoría.
// ------------------------------------------------------------
export const CAPABILITY_CATALOG = {
  modules: MODULE_CAPABILITIES,
  features: FEATURE_CAPABILITIES,
  integrations: INTEGRATION_CAPABILITIES,
  limits: LIMIT_CAPABILITIES,
};

// ------------------------------------------------------------
// Mapa plano por key.
// Todas las keys del catálogo son únicas a lo largo de las
// cuatro categorías (verificado al diseñar). Si en el futuro
// se introduce una colisión, este merge la oculta — mantener
// las keys únicas por contrato.
// ------------------------------------------------------------
export const ALL_CAPABILITIES = {
  ...MODULE_CAPABILITIES,
  ...FEATURE_CAPABILITIES,
  ...INTEGRATION_CAPABILITIES,
  ...LIMIT_CAPABILITIES,
};

// ============================================================
// Helpers puros — todos read-only sobre las constantes de arriba.
// Devuelven null/false para keys desconocidas, NUNCA tiran error.
// ============================================================

/**
 * Busca una capacidad por key en cualquier categoría.
 * @param {string} key
 * @returns {object|null}
 */
export function getCapability(key) {
  if (typeof key !== "string" || key.length === 0) return null;
  if (Object.prototype.hasOwnProperty.call(ALL_CAPABILITIES, key)) {
    return ALL_CAPABILITIES[key];
  }
  return null;
}

/**
 * Busca un módulo por key.
 * @param {string} key
 * @returns {object|null}
 */
export function getModuleCapability(key) {
  if (typeof key !== "string" || key.length === 0) return null;
  return Object.prototype.hasOwnProperty.call(MODULE_CAPABILITIES, key)
    ? MODULE_CAPABILITIES[key]
    : null;
}

/**
 * Busca una feature por key.
 * @param {string} key
 * @returns {object|null}
 */
export function getFeatureCapability(key) {
  if (typeof key !== "string" || key.length === 0) return null;
  return Object.prototype.hasOwnProperty.call(FEATURE_CAPABILITIES, key)
    ? FEATURE_CAPABILITIES[key]
    : null;
}

/**
 * Busca una integración por key.
 * @param {string} key
 * @returns {object|null}
 */
export function getIntegrationCapability(key) {
  if (typeof key !== "string" || key.length === 0) return null;
  return Object.prototype.hasOwnProperty.call(INTEGRATION_CAPABILITIES, key)
    ? INTEGRATION_CAPABILITIES[key]
    : null;
}

/**
 * Busca un límite por key.
 * @param {string} key
 * @returns {object|null}
 */
export function getLimitCapability(key) {
  if (typeof key !== "string" || key.length === 0) return null;
  return Object.prototype.hasOwnProperty.call(LIMIT_CAPABILITIES, key)
    ? LIMIT_CAPABILITIES[key]
    : null;
}

/**
 * True si la key existe en cualquier categoría del catálogo.
 * @param {string} key
 * @returns {boolean}
 */
export function isKnownCapability(key) {
  return getCapability(key) !== null;
}

/**
 * Lista de keys de módulos cuyo `enabledByDefault === true`.
 * @returns {string[]}
 */
export function getDefaultModules() {
  return Object.values(MODULE_CAPABILITIES)
    .filter((m) => m.enabledByDefault === true)
    .map((m) => m.key);
}

/**
 * Mapa featureKey -> enabledByDefault para TODAS las features
 * conocidas. Útil como base de `featuresActivas` cuando un grupo
 * todavía no tiene config explícita.
 * @returns {Record<string, boolean>}
 */
export function getDefaultFeatures() {
  const out = {};
  for (const f of Object.values(FEATURE_CAPABILITIES)) {
    out[f.key] = f.enabledByDefault === true;
  }
  return out;
}

/**
 * Lista de keys de integraciones cuyo `enabledByDefault === true`.
 * Hoy devuelve [] porque ninguna integración arranca activa.
 * @returns {string[]}
 */
export function getDefaultIntegrations() {
  return Object.values(INTEGRATION_CAPABILITIES)
    .filter((i) => i.enabledByDefault === true)
    .map((i) => i.key);
}

/**
 * Mapa limitKey -> defaultValue para TODOS los límites conocidos.
 * Útil como base de `limites` cuando un grupo todavía no tiene
 * config explícita.
 * @returns {Record<string, number|null>}
 */
export function getDefaultLimits() {
  const out = {};
  for (const l of Object.values(LIMIT_CAPABILITIES)) {
    out[l.key] = l.defaultValue ?? null;
  }
  return out;
}
