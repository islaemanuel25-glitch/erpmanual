"use client";

import { useState } from "react";
import { useUser } from "@/app/context/UserContext";
import SidebarGroup from "./SidebarGroup";
import SidebarMobile from "./SidebarMobile";

import {
  Home,
  Package,
  Package2,
  Layers,
  Layers3,
  Users,
  Users2,
  Store,
  ArrowRightLeft,
} from "lucide-react";

export default function SidebarPro() {
  const { perfil } = useUser();

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

    {
      key: "productos",
      label: "Productos",
      icon: Package,
      iconFilled: Package2,
      items: [
        { label: "Productos", href: "/modulos/productos" },
        { label: "Nuevo Producto", href: "/modulos/productos/nuevo" },
        { label: "Categorías", href: "/modulos/categorias" },
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

        // 🔥 POS TRANSFERENCIAS — NUEVO
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
  ];

  return (
    <>
      {/* Mobile */}
      <SidebarMobile menu={menu} perfil={perfil} />

      {/* Desktop */}
      <aside className="sidebar-pro hidden md:flex">
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
