"use client";

import { useState } from "react";
import { useUser } from "@/app/context/UserContext";
import SidebarGroup from "./SidebarGroup";
import SidebarMobile from "./SidebarMobile";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

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
  Settings,
  LogOut,
  Loader2,
} from "lucide-react";

// ============================================================
// Menú declarativo: cada grupo/item define sus requisitos
// ============================================================
const MENU_CONFIG = [
  {
    key: "inicio",
    label: "Inicio",
    icon: Home,
    iconFilled: Home,
    items: [{ label: "Dashboard", href: "/modulos/dashboard" }],
    // Siempre visible — sin restricción
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

  // Admin ve todo
  if (esAdmin) return true;

  // adminOnly → solo admin
  if (group.adminOnly) return false;

  // localOnly → solo locales (no depósito)
  if (group.localOnly) {
    if (!perfil?.localId || perfil?.esDeposito) return false;
  }

  // depositoOnly → solo depósitos
  if (group.depositoOnly) {
    if (!perfil?.localId || !perfil?.esDeposito) return false;
  }

  // requiredAnyPerms → al menos uno
  if (group.requiredAnyPerms && group.requiredAnyPerms.length > 0) {
    const tieneAlguno = group.requiredAnyPerms.some((p) => permisos.includes(p));
    if (!tieneAlguno) return false;
  }

  // requiredAllPerms → todos
  if (group.requiredAllPerms && group.requiredAllPerms.length > 0) {
    const tieneTodos = group.requiredAllPerms.every((p) => permisos.includes(p));
    if (!tieneTodos) return false;
  }

  return true;
}

// ============================================================
// Filtrar items dentro de un grupo (sub-items con permiso)
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
// Componente principal
// ============================================================
export default function SidebarPro() {
  const { perfil, cargando, logout } = useUser();
  const { theme } = useSunmiTheme();

  // Hooks SIEMPRE antes de cualquier return
  const [openGroup, setOpenGroup] = useState(null);

  // ========================================================
  // CARGANDO — placeholder en sidebar
  // ========================================================
  if (cargando) {
    return (
      <>
        <aside
          className={`
            hidden md:flex flex-col items-center justify-center
            w-16 min-w-16
            ${theme.sidebar.bg}
            ${theme.sidebar.border} border-r
            shadow-[2px_0_10px_rgba(0,0,0,0.45)]
            py-4 z-40
          `}
        >
          <Loader2 size={20} className="animate-spin text-slate-400" />
          <span className="text-[8px] text-slate-500 mt-1">Menú</span>
        </aside>
      </>
    );
  }

  // ========================================================
  // SIN SESIÓN — mínimo Inicio + Cerrar sesión
  // ========================================================
  if (!perfil) {
    const menuMinimo = [
      {
        key: "inicio",
        label: "Inicio",
        icon: Home,
        iconFilled: Home,
        items: [{ label: "Dashboard", href: "/modulos/dashboard" }],
      },
    ];

    return (
      <>
        <SidebarMobile menu={menuMinimo} perfil={null} />
        <aside
          className={`
            hidden md:flex flex-col items-center
            w-16 min-w-16
            ${theme.sidebar.bg}
            ${theme.sidebar.border} border-r
            shadow-[2px_0_10px_rgba(0,0,0,0.45)]
            py-4 gap-6 z-40
          `}
        >
          {menuMinimo.map((grupo) => (
            <SidebarGroup
              key={grupo.key}
              id={grupo.key}
              icon={grupo.icon}
              iconFilled={grupo.iconFilled}
              label={grupo.label}
              items={grupo.items}
              perfil={null}
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
            />
          ))}
        </aside>
      </>
    );
  }

  // ========================================================
  // PERFIL CARGADO — armar menú filtrando por permisos
  // ========================================================
  const menu = MENU_CONFIG
    .filter((group) => canSeeGroup(group, perfil))
    .map((group) => {
      const itemsFiltrados = filterItems(group.items, perfil);
      if (itemsFiltrados.length === 0) return null;
      return { ...group, items: itemsFiltrados };
    })
    .filter(Boolean);

  // Anti menú vacío: al menos Inicio siempre está
  const tieneAlgo = menu.length > 1;

  return (
    <>
      <SidebarMobile menu={menu} perfil={perfil} />

      <aside
        className={`
          hidden md:flex flex-col items-center
          w-16 min-w-16

          ${theme.sidebar.bg}
          ${theme.sidebar.border} border-r
          shadow-[2px_0_10px_rgba(0,0,0,0.45)]

          py-4 gap-6
          z-40
        `}
      >
        {menu.map((grupo) => (
          <SidebarGroup
            key={grupo.key}
            id={grupo.key}
            icon={grupo.icon}
            iconFilled={grupo.iconFilled}
            label={grupo.label}
            items={grupo.items}
            perfil={perfil}
            openGroup={openGroup}
            setOpenGroup={setOpenGroup}
          />
        ))}

        {!tieneAlgo && (
          <div className="px-2 text-center">
            <span className="text-[8px] text-slate-500 leading-tight block">
              Sin permisos asignados.
              Contactar admin.
            </span>
          </div>
        )}
      </aside>
    </>
  );
}
