import {
  Home,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  ContactRound,
  Package,
  Package2,
  Layers,
  Layers3,
  Users,
  Users2,
  Store,
  Truck,
  Settings,
} from "lucide-react";

// ============================================================
// Menú declarativo: cada grupo/item define sus requisitos
// ============================================================
export const MENU_CONFIG = [
  {
    key: "inicio",
    label: "Inicio",
    icon: Home,
    iconFilled: Home,
    items: [{ label: "Dashboard", href: "/modulos/dashboard" }],
  },
  {
    key: "pos-ventas",
    label: "POS Ventas",
    icon: ShoppingCart,
    iconFilled: ShoppingCart,
    requiredAnyPerms: ["pos.usar"],
    items: [{ label: "POS Ventas", href: "/modulos/pos-ventas" }],
  },
  {
    key: "pedidos",
    label: "Pedidos",
    icon: ClipboardList,
    iconFilled: ClipboardList,
    localOnly: true,
    requiredAnyPerms: ["pedidos.ver"],
    items: [
      { label: "Catálogo de Pedido", href: "/modulos/pedidos" },
      { label: "Historial", href: "/modulos/pedidos/historial" },
    ],
  },
  {
    key: "reportes",
    label: "Reportes",
    icon: BarChart3,
    iconFilled: BarChart3,
    requiredAnyPerms: ["reportes.ver"],
    items: [{ label: "Reportes Ventas", href: "/modulos/reportes-ventas" }],
  },
  {
    key: "clientes",
    label: "Clientes",
    icon: ContactRound,
    iconFilled: ContactRound,
    requiredAnyPerms: ["clientes.ver"],
    items: [
      { label: "Clientes", href: "/modulos/clientes" },
      { label: "Analytics", href: "/modulos/clientes/analytics" },
    ],
  },
  {
    key: "productos",
    label: "Productos",
    icon: Package,
    iconFilled: Package2,
    requiredAnyPerms: ["productos.ver"],
    items: [
      { label: "Productos", href: "/modulos/productos" },
      { label: "Nuevo Producto", href: "/modulos/productos/nuevo" },
      { label: "Categorías", href: "/modulos/categorias" },
      { label: "Proveedores", href: "/modulos/proveedores", permiso: "proveedores.ver" },
      { label: "Combos", href: "/modulos/combos" },
      { label: "Áreas Físicas", href: "/modulos/areas" },
    ],
  },
  {
    key: "estructura",
    label: "Locales & Grupos",
    icon: Store,
    iconFilled: Store,
    adminOnly: true,
    items: [
      { label: "Locales", href: "/modulos/locales" },
      { label: "Nuevo Local", href: "/modulos/locales/nuevo" },
      { label: "Grupos", href: "/modulos/grupos" },
      { label: "Nuevo Grupo", href: "/modulos/grupos/nuevo" },
    ],
  },
  {
    key: "stock",
    label: "Stock y Depósito",
    icon: Layers,
    iconFilled: Layers3,
    requiredAnyPerms: ["stock.ver", "pos_transferencias.ver", "transferencias.crear"],
    items: [
      { label: "Stock Locales", href: "/modulos/stock_locales", permiso: "stock.ver" },
      { label: "Faltantes", href: "/modulos/faltantes", permiso: "stock.ver" },
      { label: "POS Transferencias", href: "/modulos/pos-transferencias", permiso: "pos_transferencias.ver" },
      { label: "Transferencias", href: "/modulos/transferencias", permiso: "transferencias.crear" },
    ],
  },
  {
    key: "compras-proveedor",
    label: "Compras",
    icon: Truck,
    iconFilled: Truck,
    requiredAnyPerms: ["compras.ver"],
    items: [
      { label: "Compras a Proveedor", href: "/modulos/compras-proveedor" },
      { label: "Ganancia depósito", href: "/modulos/compras-proveedor/ganancia" },
    ],
  },
  {
    key: "usuarios",
    label: "Usuarios",
    icon: Users,
    iconFilled: Users2,
    requiredAnyPerms: ["usuarios.ver", "roles.editar"],
    items: [
      { label: "Usuarios", href: "/modulos/usuarios", permiso: "usuarios.ver" },
      { label: "Roles", href: "/modulos/roles", permiso: "roles.editar" },
    ],
  },
  {
    key: "configuracion",
    label: "Configuración",
    icon: Settings,
    iconFilled: Settings,
    adminOnly: true,
    items: [{ label: "Configuración", href: "/modulos/configuracion/apariencia" }],
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
// filterItems: filtrar sub-items por permiso individual
// ============================================================
function filterItems(items, perfil) {
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  if (esAdmin) return items;

  return items.filter((item) => {
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
