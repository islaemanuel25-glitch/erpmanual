"use client";

import { useState } from "react";
import { useUser } from "@/app/context/UserContext";
import SidebarGroup from "./SidebarGroup";
import SidebarMobile from "./SidebarMobile";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

import {
  Home,
  ShoppingCart,
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
} from "lucide-react";

export default function SidebarPro() {
  const { perfil } = useUser();
  const { theme } = useSunmiTheme();

  if (!perfil) return null;

  const [openGroup, setOpenGroup] = useState(null);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const puede = (perm) => {
    if (esAdmin) return true;
    if (!Array.isArray(permisos)) return false;
    return permisos.includes(perm);
  };

  const menu = [
    {
      key: "inicio",
      label: "Inicio",
      icon: Home,
      iconFilled: Home,
      items: [{ label: "Dashboard", href: "/modulos/dashboard" }],
    },

    puede("pos.usar") || esAdmin
      ? {
          key: "pos-ventas",
          label: "POS Ventas",
          icon: ShoppingCart,
          iconFilled: ShoppingCart,
          items: [
            { label: "POS Ventas", href: "/modulos/pos-ventas" },
          ],
        }
      : null,

    esAdmin
      ? {
          key: "reportes",
          label: "Reportes",
          icon: BarChart3,
          iconFilled: BarChart3,
          items: [
            { label: "Reportes Ventas", href: "/modulos/reportes-ventas" },
          ],
        }
      : null,

    {
      key: "clientes",
      label: "Clientes",
      icon: ContactRound,
      iconFilled: ContactRound,
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
      items: [
        { label: "Productos", href: "/modulos/productos" },
        { label: "Nuevo Producto", href: "/modulos/productos/nuevo" },
        { label: "Categorías", href: "/modulos/categorias" },
        { label: "Proveedores", href: "/modulos/proveedores" },
        { label: "Combos", href: "/modulos/combos" },
        { label: "Áreas Físicas", href: "/modulos/areas" },
      ],
    },

    {
      key: "estructura",
      label: "Locales & Grupos",
      icon: Store,
      iconFilled: Store,
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
      items: [
        { label: "Stock Locales", href: "/modulos/stock_locales" },
        { label: "Faltantes", href: "/modulos/faltantes" },
        puede("pos.usar") || esAdmin
          ? {
              label: "POS Transferencias",
              href: "/modulos/pos-transferencias",
            }
          : null,
        { label: "Transferencias", href: "/modulos/transferencias" },
      ].filter(Boolean),
    },

    {
      key: "usuarios",
      label: "Usuarios",
      icon: Users,
      iconFilled: Users2,
      items: [
        { label: "Usuarios", href: "/modulos/usuarios" },
        { label: "Roles", href: "/modulos/roles" },
      ],
    },

    {
      key: "configuracion",
      label: "Configuración",
      icon: Settings,
      iconFilled: Settings,
      items: [{ label: "Configuración", href: "/modulos/configuracion/apariencia" }],
    },
  ].filter(Boolean);

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
      </aside>
    </>
  );
}
