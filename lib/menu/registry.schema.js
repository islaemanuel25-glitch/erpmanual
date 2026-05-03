// ============================================================
// lib/menu/registry.schema.js
//
// Registry extendido del menú comercial.
//
// Convive en PARALELO con `lib/menuConfig.js` (MENU_CONFIG).
// Aún NO se consume desde la UI: solo es la fuente declarativa
// que vamos a usar en etapas siguientes para gatear módulos por
// contratación, features e integraciones del grupo (tenant).
//
// Reglas:
// - Las rutas (`href`) son IDÉNTICAS a las de MENU_CONFIG.
// - Los permisos son IDÉNTICOS a los de MENU_CONFIG.
// - Los íconos se importan de la misma fuente (`lucide-react`).
// - Los colores son los mismos tokens de tema.
// ============================================================

import {
  Home,
  ShoppingCart,
  Layers,
  Layers3,
  ArrowLeftRight,
  Truck,
  BarChart3,
  ShieldCheck,
  Settings,
  LayoutDashboard,
  ClipboardList,
  Receipt,
  History,
  Boxes,
  Repeat,
  Package,
  PackagePlus,
  Tags,
  Building2,
  TrendingUp,
  Users,
  ScanSearch,
  UserCircle2,
  ShieldUser,
  Palette,
  Warehouse,
  Printer,
  MapPin,
} from "lucide-react";

/** @typedef {import("./types.js").RegistryEntry} RegistryEntry */

/**
 * Registry extendido del menú comercial.
 * @type {RegistryEntry[]}
 */
export const MENU_REGISTRY = [
  // ----------------------------------------------------------
  // CORES — siempre visibles, no se gatean por contratación.
  // ----------------------------------------------------------
  {
    moduleKey: "inicio",
    label: "Inicio",
    type: "core",
    enabledByDefault: true,
    href: "/modulos/dashboard",
    color: "gray",
    icon: Home,
    items: [
      {
        moduleKey: "dashboard",
        label: "Dashboard",
        type: "core",
        enabledByDefault: true,
        href: "/modulos/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },

  // ----------------------------------------------------------
  // MODULES — gateados por `grupoConfig.modulosActivos`.
  // ----------------------------------------------------------

  // POS Ventas (incluye Turnos y Pedidos).
  {
    moduleKey: "pos-ventas",
    label: "POS Ventas",
    type: "module",
    enabledByDefault: true,
    href: "/modulos/pos-ventas",
    color: "blue",
    icon: ShoppingCart,
    requiredAnyPerms: ["pos.usar", "pedidos.ver"],
    items: [
      {
        moduleKey: "pos-ventas.pos",
        label: "POS Ventas",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/pos-ventas",
        permission: "pos.usar",
        icon: ShoppingCart,
      },
      {
        moduleKey: "pos-ventas.turnos",
        label: "Turnos",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/turnos",
        permission: "pos.usar",
        icon: ClipboardList,
      },
      {
        moduleKey: "pos-ventas.pedidos",
        label: "Pedidos",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/pedidos",
        permission: "pedidos.ver",
        localOnly: true,
        icon: Receipt,
      },
      {
        moduleKey: "pos-ventas.pedidos-historial",
        label: "Historial Pedidos",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/pedidos/historial",
        permission: "pedidos.ver",
        localOnly: true,
        icon: History,
      },
    ],
  },

  // Stock (incluye Productos, Categorías, POS Transferencias).
  {
    moduleKey: "stock",
    label: "Stock",
    type: "module",
    enabledByDefault: true,
    href: "/modulos/stock_locales",
    color: "teal",
    icon: Layers,
    requiredAnyPerms: ["stock.ver", "productos.ver", "pos_transferencias.ver"],
    items: [
      {
        moduleKey: "stock.locales",
        label: "Stock Locales",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/stock_locales",
        permission: "stock.ver",
        icon: Boxes,
      },
      {
        moduleKey: "stock.pos-transferencias",
        label: "POS Transferencias",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/pos-transferencias",
        permission: "pos_transferencias.ver",
        requiredFeature: "multiSucursal",
        icon: Repeat,
      },
      {
        moduleKey: "stock.productos",
        label: "Productos",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/productos",
        permission: "productos.ver",
        icon: Package,
      },
      {
        moduleKey: "stock.productos-nuevo",
        label: "Nuevo Producto",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/productos/nuevo",
        permission: "productos.crear",
        icon: PackagePlus,
      },
      {
        moduleKey: "stock.categorias",
        label: "Categorías",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/categorias",
        permission: "productos.ver",
        icon: Tags,
      },
    ],
  },

  // Transferencias entre locales — solo multi-sucursal.
  {
    moduleKey: "transferencias",
    label: "Transferencias",
    type: "module",
    enabledByDefault: false,
    href: "/modulos/transferencias",
    color: "purple",
    icon: ArrowLeftRight,
    requiredFeature: "multiSucursal",
    requiredAnyPerms: ["transferencias.ver"],
    items: [
      {
        moduleKey: "transferencias.lista",
        label: "Transferencias",
        type: "module",
        enabledByDefault: false,
        href: "/modulos/transferencias",
        permission: "transferencias.ver",
        requiredFeature: "multiSucursal",
        icon: ArrowLeftRight,
      },
    ],
  },

  // Compras (incluye Proveedores).
  {
    moduleKey: "compras",
    label: "Compras",
    type: "module",
    enabledByDefault: true,
    href: "/modulos/compras-proveedor",
    color: "amber",
    icon: Truck,
    requiredAnyPerms: ["compras.ver", "proveedores.ver"],
    items: [
      {
        moduleKey: "compras.proveedor",
        label: "Compras a Proveedor",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/compras-proveedor",
        permission: "compras.ver",
        icon: Truck,
      },
      {
        moduleKey: "compras.ganancia-deposito",
        label: "Ganancia depósito",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/compras-proveedor/ganancia",
        permission: "compras.ver",
        icon: TrendingUp,
      },
      {
        moduleKey: "compras.proveedores",
        label: "Proveedores",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/proveedores",
        permission: "proveedores.ver",
        icon: Building2,
      },
    ],
  },

  // Reportes (incluye Auditoría POS).
  {
    moduleKey: "reportes",
    label: "Reportes",
    type: "module",
    enabledByDefault: true,
    href: "/modulos/reportes-ventas",
    color: "green",
    icon: BarChart3,
    requiredAnyPerms: ["reportes.ver"],
    items: [
      {
        moduleKey: "reportes.ventas",
        label: "Reportes Ventas",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/reportes-ventas",
        icon: BarChart3,
      },
      {
        moduleKey: "reportes.auditoria-pos",
        label: "Auditoría POS",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/auditoria-pos-ventas",
        icon: ScanSearch,
      },
      {
        moduleKey: "reportes.clientes-analytics",
        label: "Clientes Analytics",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/clientes/analytics",
        permission: "clientes.ver",
        icon: TrendingUp,
      },
    ],
  },

  // Administración (Usuarios, Operadores, Roles, Clientes).
  {
    moduleKey: "administracion",
    label: "Administración",
    type: "module",
    enabledByDefault: true,
    href: "/modulos/usuarios",
    color: "coral",
    icon: ShieldCheck,
    requiredAnyPerms: ["usuarios.ver", "roles.editar", "clientes.ver"],
    items: [
      {
        moduleKey: "administracion.usuarios",
        label: "Usuarios",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/usuarios",
        permission: "usuarios.ver",
        icon: Users,
      },
      {
        moduleKey: "administracion.operadores",
        label: "Operadores",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/operadores",
        permission: "usuarios.gestionar",
        icon: UserCircle2,
      },
      {
        moduleKey: "administracion.roles",
        label: "Roles",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/roles",
        permission: "roles.editar",
        icon: ShieldUser,
      },
      {
        moduleKey: "administracion.clientes",
        label: "Clientes",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/clientes",
        permission: "clientes.ver",
        icon: Users,
      },
    ],
  },

  // Configuración (admin) — Apariencia, Stock, Ticket, Locales, Grupos.
  {
    moduleKey: "configuracion",
    label: "Configuración",
    type: "module",
    enabledByDefault: true,
    href: "/modulos/configuracion",
    color: "pink",
    icon: Settings,
    adminOnly: true,
    items: [
      {
        moduleKey: "configuracion.apariencia",
        label: "Apariencia",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/configuracion/apariencia",
        icon: Palette,
      },
      {
        moduleKey: "configuracion.stock",
        label: "Stock",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/configuracion/stock",
        icon: Warehouse,
      },
      {
        moduleKey: "configuracion.ticket",
        label: "Ticket",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/configuracion/ticket",
        icon: Printer,
      },
      {
        moduleKey: "configuracion.locales",
        label: "Locales",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/locales",
        requiredFeature: "multiSucursal",
        icon: MapPin,
      },
      {
        moduleKey: "configuracion.grupos",
        label: "Grupos",
        type: "module",
        enabledByDefault: true,
        href: "/modulos/grupos",
        icon: Layers,
      },
    ],
  },

  // ----------------------------------------------------------
  // FEATURES — flags funcionales del grupo.
  // No se renderizan como módulos del menú; son referenciables
  // por `requiredFeature` desde otras entradas. Más adelante se
  // expondrán en la UI de configuración del grupo.
  // ----------------------------------------------------------
  {
    moduleKey: "multiSucursal",
    label: "Multi-sucursal",
    type: "feature",
    enabledByDefault: false,
    description:
      "Habilita múltiples locales, depósitos, transferencias entre sucursales y selector de contexto.",
  },
  {
    moduleKey: "puntosFidelidad",
    label: "Puntos de fidelidad",
    type: "feature",
    enabledByDefault: false,
    description:
      "Programa de fidelización de clientes basado en puntos canjeables por descuentos o productos.",
  },
  {
    moduleKey: "cuentaCorriente",
    label: "Cuenta corriente",
    type: "feature",
    enabledByDefault: false,
    description:
      "Permite ventas a cuenta corriente con seguimiento de saldos por cliente y resúmenes periódicos.",
  },

  // ----------------------------------------------------------
  // INTEGRATIONS — conexiones a servicios externos.
  // Placeholders: aún no se exponen en UI.
  // ----------------------------------------------------------
  {
    moduleKey: "afip",
    label: "Facturación AFIP",
    type: "integration",
    enabledByDefault: false,
    description:
      "Emisión de comprobantes electrónicos (factura A/B/C) vía web service de AFIP.",
  },
  {
    moduleKey: "mercadoPago",
    label: "MercadoPago",
    type: "integration",
    enabledByDefault: false,
    description:
      "Cobros con QR y link de pago a través de MercadoPago, conciliación automática.",
  },
];

// ============================================================
// NOTA: este registry es PARALELO a `lib/menuConfig.js` y todavía
// no se consume desde la UI. La UI sigue leyendo MENU_CONFIG y
// `buildVisibleMenu`. Etapas posteriores van a ir migrando la
// renderización del menú para que se base en MENU_REGISTRY +
// canAccessMenuItem + getGrupoConfig().
// ============================================================
