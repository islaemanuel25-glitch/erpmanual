// ============================================================
// FUENTE DE VERDAD ACTIVA del menú actual de ERP Azul.
//
// Este archivo contiene `MENU_CONFIG` y `buildVisibleMenu`, que
// son los que la UI consume hoy (vía el shim `lib/menuConfig.js`).
//
// Etapa 2 del refactor modular/comercial:
//   - Se agregó METADATA INFORMATIVA a grupos e items:
//       type, scope, requiredModule, requiredFeature,
//       requiredIntegration, enabledByDefault.
//   - La metadata todavía NO se evalúa: `buildVisibleMenu`
//     ignora estos campos. El filtrado real (canAccess + commercial)
//     se conecta en etapas posteriores.
//   - POS Transferencias se reubicó de Stock al grupo Transferencias,
//     que ahora declara `requiredFeature: "multiSucursal"`.
//   - El item "Stock" dentro de Configuración pasó a llamarse
//     "Configuración Stock" para no colisionar con el grupo Stock.
//
// Convivencia:
//   - `lib/menu/registry.schema.js`: registry paralelo que se va
//     a deprecar al cierre del refactor. No tocado en esta etapa.
//   - `lib/menu/capabilityCatalog.js` (Etapa 1): catálogo de
//     capacidades referenciables desde aquí. Tampoco se consume
//     todavía; los strings de `requiredModule`/`requiredFeature`
//     deben coincidir con keys de ese catálogo.
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
  Wrench,
} from "lucide-react";

// ============================================================
// MENU_CONFIG — orden y contenido visibles del menú principal.
// Los campos clásicos (key, label, icon, href, color, permisos,
// localOnly, depositoOnly, adminOnly) se siguen evaluando como
// hasta hoy. Los campos nuevos (type/scope/requiredModule/
// requiredFeature/requiredIntegration/enabledByDefault) son
// informativos hasta que canAccess los consuma.
// ============================================================
export const MENU_CONFIG = [
  // ----------------------------------------------------------
  // 1. INICIO — núcleo, siempre visible.
  // ----------------------------------------------------------
  {
    key: "inicio",
    label: "Inicio",
    icon: Home,
    iconFilled: Home,
    href: "/modulos/dashboard",
    color: "gray",
    type: "core",
    scope: "global",
    enabledByDefault: true,
    items: [
      {
        label: "Dashboard",
        href: "/modulos/dashboard",
        icon: LayoutDashboard,
        type: "core",
        scope: "global",
        enabledByDefault: true,
      },
    ],
  },

  // ----------------------------------------------------------
  // 2. POS VENTAS (incluye Cajas y Pedidos).
  // ----------------------------------------------------------
  {
    key: "pos-ventas",
    label: "POS Ventas",
    icon: ShoppingCart,
    iconFilled: ShoppingCart,
    href: "/modulos/pos-ventas",
    color: "blue",
    type: "module",
    scope: "global",
    requiredModule: "pos",
    enabledByDefault: true,
    requiredAnyPerms: ["pos.usar", "pedidos.ver"],
    items: [
      {
        label: "POS Ventas",
        href: "/modulos/pos-ventas",
        permiso: "pos.usar",
        icon: ShoppingCart,
        type: "module",
        scope: "global",
        requiredModule: "pos",
        enabledByDefault: true,
      },
      {
        label: "Cajas",
        href: "/modulos/turnos",
        permiso: "pos.usar",
        icon: ClipboardList,
        type: "module",
        scope: "global",
        requiredModule: "pos",
        requiredFeature: "controlTurnos",
        enabledByDefault: true,
      },
      {
        label: "Pedidos",
        href: "/modulos/pedidos",
        permiso: "pedidos.ver",
        localOnly: true,
        icon: Receipt,
        type: "module",
        scope: "global",
        requiredModule: "pos",
        enabledByDefault: true,
      },
      {
        label: "Historial Pedidos",
        href: "/modulos/pedidos/historial",
        permiso: "pedidos.ver",
        localOnly: true,
        icon: History,
        type: "module",
        scope: "global",
        requiredModule: "pos",
        enabledByDefault: true,
      },
    ],
  },

  // ----------------------------------------------------------
  // 3. STOCK — Productos y categorías. POS Transferencias se
  // movió al grupo Transferencias (Etapa 2).
  // ----------------------------------------------------------
  {
    key: "stock",
    label: "Stock",
    icon: Layers,
    iconFilled: Layers3,
    href: "/modulos/stock_locales",
    color: "teal",
    type: "module",
    scope: "global",
    requiredModule: "stock",
    enabledByDefault: true,
    requiredAnyPerms: ["stock.ver", "productos.ver"],
    items: [
      {
        label: "Stock Locales",
        href: "/modulos/stock_locales",
        permiso: "stock.ver",
        icon: Boxes,
        type: "module",
        scope: "global",
        requiredModule: "stock",
        requiredFeature: "stockPorLocal",
        enabledByDefault: true,
      },
      {
        label: "Productos",
        href: "/modulos/productos",
        permiso: "productos.ver",
        icon: Package,
        type: "module",
        scope: "global",
        requiredModule: "stock",
        enabledByDefault: true,
      },
      {
        label: "Categorías",
        href: "/modulos/categorias",
        permiso: "productos.ver",
        icon: Tags,
        type: "module",
        scope: "global",
        requiredModule: "stock",
        enabledByDefault: true,
      },
    ],
  },

  // ----------------------------------------------------------
  // 4. COMPRAS (incluye Proveedores).
  // ----------------------------------------------------------
  {
    key: "compras",
    label: "Compras",
    icon: Truck,
    iconFilled: Truck,
    href: "/modulos/compras-proveedor",
    color: "amber",
    type: "module",
    scope: "global",
    requiredModule: "compras",
    enabledByDefault: true,
    requiredAnyPerms: ["compras.ver", "proveedores.ver"],
    items: [
      {
        label: "Compras a Proveedor",
        href: "/modulos/compras-proveedor",
        permiso: "compras.ver",
        icon: Truck,
        type: "module",
        scope: "global",
        requiredModule: "compras",
        enabledByDefault: true,
      },
      {
        label: "Proveedores",
        href: "/modulos/proveedores",
        permiso: "proveedores.ver",
        icon: Building2,
        type: "module",
        scope: "global",
        requiredModule: "proveedores",
        enabledByDefault: true,
      },
    ],
  },

  // ----------------------------------------------------------
  // 5. TRANSFERENCIAS — depende de multiSucursal.
  // POS Transferencias vive aquí desde Etapa 2.
  // ----------------------------------------------------------
  {
    key: "transferencias",
    label: "Transferencias",
    icon: ArrowLeftRight,
    iconFilled: ArrowLeftRight,
    href: "/modulos/transferencias",
    color: "purple",
    type: "module",
    scope: "multiLocal",
    requiredModule: "transferencias",
    requiredFeature: "multiSucursal",
    enabledByDefault: false,
    requiredAnyPerms: ["transferencias.ver", "pos_transferencias.ver"],
    items: [
      {
        label: "Transferencias",
        href: "/modulos/transferencias",
        permiso: "transferencias.ver",
        icon: ArrowLeftRight,
        type: "module",
        scope: "multiLocal",
        requiredModule: "transferencias",
        requiredFeature: "multiSucursal",
        enabledByDefault: false,
      },
      {
        label: "POS Transferencias",
        href: "/modulos/pos-transferencias",
        permiso: "pos_transferencias.ver",
        icon: Repeat,
        type: "module",
        scope: "multiLocal",
        requiredModule: "transferencias",
        requiredFeature: "multiSucursal",
        enabledByDefault: false,
      },
    ],
  },

  // ----------------------------------------------------------
  // 6. REPORTES (incluye Auditoría POS y Analytics).
  // ----------------------------------------------------------
  {
    key: "reportes",
    label: "Reportes",
    icon: BarChart3,
    iconFilled: BarChart3,
    href: "/modulos/reportes-ventas",
    color: "green",
    type: "module",
    scope: "global",
    requiredModule: "reportes",
    enabledByDefault: true,
    requiredAnyPerms: ["reportes.ver"],
    items: [
      {
        label: "Ventas",
        href: "/modulos/reportes-ventas",
        icon: BarChart3,
        type: "module",
        scope: "global",
        requiredModule: "reportes",
        enabledByDefault: true,
      },
      {
        label: "Auditoría POS",
        href: "/modulos/auditoria-pos-ventas",
        icon: ScanSearch,
        type: "module",
        scope: "global",
        requiredModule: "auditoriaPos",
        enabledByDefault: true,
      },
      {
        label: "Análisis de Clientes",
        href: "/modulos/clientes/analytics",
        permiso: "clientes.ver",
        icon: TrendingUp,
        type: "module",
        scope: "global",
        requiredModule: "clientes",
        enabledByDefault: true,
      },
      {
        // Reubicado desde el grupo Compras al grupo Reportes
        // (mismo href, permiso y metadata). Cuando se active el
        // filtrado de feature, la default del catálogo
        // (depositoCentral=false) ocultará este item salvo que
        // el grupo lo tenga activo en su config.
        label: "Ganancia Depósito",
        href: "/modulos/compras-proveedor/ganancia",
        permiso: "compras.ver",
        icon: TrendingUp,
        type: "module",
        scope: "global",
        requiredModule: "compras",
        requiredFeature: "depositoCentral",
        enabledByDefault: false,
      },
    ],
  },

  // ----------------------------------------------------------
  // 7. ADMINISTRACIÓN (Usuarios, Operadores, Roles, Clientes).
  // ----------------------------------------------------------
  {
    key: "administracion",
    label: "Administración",
    icon: ShieldCheck,
    iconFilled: ShieldCheck,
    href: "/modulos/usuarios",
    color: "coral",
    type: "module",
    scope: "global",
    requiredModule: "administracion",
    enabledByDefault: true,
    requiredAnyPerms: ["usuarios.ver", "roles.editar", "clientes.ver"],
    items: [
      {
        label: "Usuarios",
        href: "/modulos/usuarios",
        permiso: "usuarios.ver",
        icon: Users,
        type: "module",
        scope: "global",
        requiredModule: "administracion",
        enabledByDefault: true,
      },
      {
        label: "Operadores",
        href: "/modulos/operadores",
        permiso: "usuarios.gestionar",
        icon: UserCircle2,
        type: "module",
        scope: "global",
        requiredModule: "administracion",
        enabledByDefault: true,
      },
      {
        label: "Roles",
        href: "/modulos/roles",
        permiso: "roles.editar",
        icon: ShieldUser,
        type: "module",
        scope: "global",
        requiredModule: "administracion",
        enabledByDefault: true,
      },
      {
        label: "Clientes",
        href: "/modulos/clientes",
        permiso: "clientes.ver",
        icon: Users,
        type: "module",
        scope: "global",
        requiredModule: "clientes",
        enabledByDefault: true,
      },
    ],
  },

  // ----------------------------------------------------------
  // 8. CONFIGURACIÓN (admin) — Apariencia, Stock, Ticket,
  // Locales, Grupos.
  // ----------------------------------------------------------
  {
    key: "configuracion",
    label: "Configuración",
    icon: Settings,
    iconFilled: Settings,
    href: "/modulos/configuracion",
    color: "pink",
    type: "config",
    scope: "config",
    requiredModule: "configuracion",
    enabledByDefault: true,
    adminOnly: true,
    items: [
      {
        label: "Apariencia",
        href: "/modulos/configuracion/apariencia",
        icon: Palette,
        type: "config",
        scope: "config",
        requiredModule: "configuracion",
        enabledByDefault: true,
      },
      {
        // Renombrado en Etapa 2 ("Stock" -> "Configuración Stock")
        // para no colisionar con el grupo principal Stock al
        // resolver títulos vía useMenu.
        label: "Configuración Stock",
        href: "/modulos/configuracion/stock",
        icon: Warehouse,
        type: "config",
        scope: "config",
        requiredModule: "configuracion",
        enabledByDefault: true,
      },
      {
        label: "Configuración POS Ventas",
        href: "/modulos/configuracion/pos-ventas",
        icon: ShoppingCart,
        type: "config",
        scope: "config",
        requiredModule: "configuracion",
        enabledByDefault: true,
      },
      {
        label: "Ticket",
        href: "/modulos/configuracion/ticket",
        icon: Printer,
        type: "config",
        scope: "config",
        requiredModule: "configuracion",
        enabledByDefault: true,
      },
      {
        label: "Locales",
        href: "/modulos/locales",
        icon: MapPin,
        type: "config",
        scope: "multiLocal",
        requiredModule: "configuracion",
        requiredFeature: "multiSucursal",
        enabledByDefault: false,
      },
      {
        label: "Grupos",
        href: "/modulos/grupos",
        icon: Layers,
        type: "config",
        scope: "config",
        requiredModule: "configuracion",
        enabledByDefault: true,
      },
      {
        label: "Listas de precios",
        href: "/modulos/configuracion/listas-precios",
        permiso: "listas_precios.ver",
        icon: Tags,
        type: "config",
        scope: "config",
        requiredModule: "configuracion",
        enabledByDefault: true,
      },
      {
        label: "Mantenimiento",
        href: "/modulos/configuracion/mantenimiento",
        icon: Wrench,
        type: "config",
        scope: "config",
        requiredModule: "configuracion",
        enabledByDefault: true,
      },
    ],
  },
];

// ============================================================
// canSeeGroup: ¿el usuario puede ver este grupo de menú?
// Etapa 2: NO se evalúa metadata comercial nueva. Se mantiene
// la lógica histórica (adminOnly + requiredAnyPerms +
// requiredAllPerms + localOnly + depositoOnly).
// ============================================================
function canSeeGroup(group, perfil) {
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  if (esAdmin) return true;
  if (group.adminOnly) return false;

  if (group.localOnly) {
    if (!perfil?.localId || perfil?.esDeposito) return false;
  }

  if (group.depositoOnly) {
    if (!perfil?.localId || !perfil?.esDeposito) return false;
  }

  if (group.requiredAnyPerms && group.requiredAnyPerms.length > 0) {
    const tieneAlguno = group.requiredAnyPerms.some((p) => permisos.includes(p));
    if (!tieneAlguno) return false;
  }

  if (group.requiredAllPerms && group.requiredAllPerms.length > 0) {
    const tieneTodos = group.requiredAllPerms.every((p) => permisos.includes(p));
    if (!tieneTodos) return false;
  }

  return true;
}

// ============================================================
// filterItems: filtrar sub-items por permiso, localOnly y
// depositoOnly. Ignora la metadata comercial nueva (Etapa 2).
// ============================================================
function filterItems(items, perfil) {
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  if (esAdmin) return items;

  return items.filter((item) => {
    if (item.localOnly) {
      if (!perfil?.localId || perfil?.esDeposito) return false;
    }
    if (item.depositoOnly) {
      if (!perfil?.localId || !perfil?.esDeposito) return false;
    }
    if (!item.permiso) return true;
    return permisos.includes(item.permiso);
  });
}

// ============================================================
// buildVisibleMenu: devuelve solo grupos e ítems visibles.
// ============================================================
export function buildVisibleMenu(menuConfig, perfil) {
  return menuConfig
    .filter((group) => canSeeGroup(group, perfil))
    .map((group) => {
      const itemsFiltrados = filterItems(group.items, perfil);
      if (itemsFiltrados.length === 0) return null;
      return { ...group, items: itemsFiltrados };
    })
    .filter(Boolean);
}
