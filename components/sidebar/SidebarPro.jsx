"use client";

import { useState } from "react";
import { useUser } from "@/app/context/UserContext";
import SidebarGroup from "./SidebarGroup";
import SidebarMobile from "./SidebarMobile";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { MENU_CONFIG, buildVisibleMenu } from "@/lib/menuConfig";
import { Home, Loader2 } from "lucide-react";

// ============================================================
// Componente principal
// ============================================================
export default function SidebarPro({ variant = "static", onClose }) {
  const { perfil, cargando, logout } = useUser();
  const { theme } = useSunmiTheme();

  // Hooks SIEMPRE antes de cualquier return
  const [openGroup, setOpenGroup] = useState(null);

  const isDrawer = variant === "drawer";

  // ========================================================
  // CARGANDO — placeholder en sidebar (solo static)
  // ========================================================
  if (cargando) {
    if (isDrawer) return null;
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
    if (isDrawer) return null;
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
  const menu = buildVisibleMenu(MENU_CONFIG, perfil);

  // Anti menú vacío: al menos Inicio siempre está
  const tieneAlgo = menu.length > 1;

  // ========================================================
  // DRAWER OVERLAY (modo topbar)
  // ========================================================
  if (isDrawer) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
        />

        {/* Sidebar drawer */}
        <aside
          className={`
            fixed top-0 left-0 h-screen
            flex flex-col items-center
            w-16 min-w-16
            ${theme.sidebar.bg}
            ${theme.sidebar.border} border-r
            shadow-[2px_0_10px_rgba(0,0,0,0.45)]
            py-4 gap-6
            z-50
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

  // ========================================================
  // STATIC (modo sidebarLeft — sin cambios)
  // ========================================================
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
