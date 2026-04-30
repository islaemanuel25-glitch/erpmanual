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
} from "lucide-react";

// ============================================================
// FASE 1 — Menú declarativo: máximo 8 módulos principales.
// Auditoría POS vive dentro de Reportes.
// Auditoría sistema/logs (futura) irá dentro de Administración o Configuración.
// Sub-items se filtran por `permiso`, `localOnly`, `depositoOnly`.
// ============================================================
export const MENU_CONFIG = [
  // 1. INICIO
  {
    key: "inicio",
    label: "Inicio",
    icon: Home,
    iconFilled: Home,
    href: "/modulos/dashboard",
    color: "gray",
    items: [{ label: "Dashboard", href: "/modulos/dashboard" }],
  },

  // 2. POS VENTAS (incluye Turnos y Pedidos)
  {
    key: "pos-ventas",
    label: "POS Ventas",
    icon: ShoppingCart,
    iconFilled: ShoppingCart,
    href: "/modulos/pos-ventas",
    color: "blue",
    requiredAnyPerms: ["pos.usar", "pedidos.ver"],
    items: [
      { label: "POS Ventas", href: "/modulos/pos-ventas", permiso: "pos.usar" },
      { label: "Turnos", href: "/modulos/turnos", permiso: "pos.usar" },
      { label: "Pedidos", href: "/modulos/pedidos", permiso: "pedidos.ver", localOnly: true },
      { label: "Historial Pedidos", href: "/modulos/pedidos/historial", permiso: "pedidos.ver", localOnly: true },
    ],
  },

  // 3. STOCK (incluye Productos, Categorías, POS Transferencias)
  {
    key: "stock",
    label: "Stock",
    icon: Layers,
    iconFilled: Layers3,
    href: "/modulos/stock_locales",
    color: "teal",
    requiredAnyPerms: ["stock.ver", "productos.ver", "pos_transferencias.ver"],
    items: [
      { label: "Stock Locales", href: "/modulos/stock_locales", permiso: "stock.ver" },
      { label: "POS Transferencias", href: "/modulos/pos-transferencias", permiso: "pos_transferencias.ver" },
      { label: "Productos", href: "/modulos/productos", permiso: "productos.ver" },
      { label: "Nuevo Producto", href: "/modulos/productos/nuevo", permiso: "productos.crear" },
      { label: "Categorías", href: "/modulos/categorias", permiso: "productos.ver" },
      // RUTAS PENDIENTES (no existen page.jsx — revisar Fase 2):
      // { label: "Faltantes", href: "/modulos/faltantes", permiso: "stock.ver" },
      // { label: "Combos", href: "/modulos/combos", permiso: "productos.ver" },
      // { label: "Áreas Físicas", href: "/modulos/areas", permiso: "productos.ver" },
    ],
  },

  // 4. TRANSFERENCIAS
  {
    key: "transferencias",
    label: "Transferencias",
    icon: ArrowLeftRight,
    iconFilled: ArrowLeftRight,
    href: "/modulos/transferencias",
    color: "purple",
    requiredAnyPerms: ["transferencias.ver"],
    items: [
      { label: "Transferencias", href: "/modulos/transferencias", permiso: "transferencias.ver" },
    ],
  },

  // 5. COMPRAS (incluye Proveedores)
  {
    key: "compras",
    label: "Compras",
    icon: Truck,
    iconFilled: Truck,
    href: "/modulos/compras-proveedor",
    color: "amber",
    requiredAnyPerms: ["compras.ver", "proveedores.ver"],
    items: [
      { label: "Compras a Proveedor", href: "/modulos/compras-proveedor", permiso: "compras.ver" },
      { label: "Ganancia depósito", href: "/modulos/compras-proveedor/ganancia", permiso: "compras.ver" },
      { label: "Proveedores", href: "/modulos/proveedores", permiso: "proveedores.ver" },
    ],
  },

  // 6. REPORTES (incluye Auditoría POS)
  {
    key: "reportes",
    label: "Reportes",
    icon: BarChart3,
    iconFilled: BarChart3,
    href: "/modulos/reportes-ventas",
    color: "green",
    requiredAnyPerms: ["reportes.ver"],
    items: [
      { label: "Reportes Ventas", href: "/modulos/reportes-ventas" },
      { label: "Auditoría POS", href: "/modulos/auditoria-pos-ventas" },
      { label: "Clientes Analytics", href: "/modulos/clientes/analytics", permiso: "clientes.ver" },
    ],
  },

  // 7. ADMINISTRACIÓN (Usuarios, Operadores, Roles, Clientes)
  {
    key: "administracion",
    label: "Administración",
    icon: ShieldCheck,
    iconFilled: ShieldCheck,
    href: "/modulos/usuarios",
    color: "coral",
    requiredAnyPerms: ["usuarios.ver", "roles.editar", "clientes.ver"],
    items: [
      { label: "Usuarios", href: "/modulos/usuarios", permiso: "usuarios.ver" },
      { label: "Operadores", href: "/modulos/operadores", permiso: "usuarios.gestionar" },
      { label: "Roles", href: "/modulos/roles", permiso: "roles.editar" },
      { label: "Clientes", href: "/modulos/clientes", permiso: "clientes.ver" },
    ],
  },

  // 8. CONFIGURACIÓN (admin) — Apariencia, Stock, Ticket, Locales, Grupos
  {
    key: "configuracion",
    label: "Configuración",
    icon: Settings,
    iconFilled: Settings,
    href: "/modulos/configuracion",
    color: "pink",
    adminOnly: true,
    items: [
      { label: "Apariencia", href: "/modulos/configuracion/apariencia" },
      { label: "Stock", href: "/modulos/configuracion/stock" },
      { label: "Ticket", href: "/modulos/configuracion/ticket" },
      { label: "Locales", href: "/modulos/locales" },
      { label: "Grupos", href: "/modulos/grupos" },
    ],
  },
];

// ============================================================
// canSeeGroup: ¿el usuario puede ver este grupo de menú?
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
// filterItems: filtrar sub-items por permiso, localOnly y depositoOnly
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
// buildVisibleMenu: devuelve solo grupos e ítems visibles
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
