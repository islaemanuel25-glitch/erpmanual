"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import SidebarPro from "@/components/sidebar/SidebarPro";
import TopbarNav from "@/components/layout/TopbarNav";
import SidebarMobile from "@/components/sidebar/SidebarMobile";
import Header from "./Header";
import { useLayoutSettings } from "@/app/context/LayoutSettingsContext";
import { useUser } from "@/app/context/UserContext";
import { MENU_CONFIG, buildVisibleMenu } from "@/lib/menuConfig";

export default function LayoutBase({ children }) {
  const pathname = usePathname();
  const { menuMode } = useLayoutSettings();
  const { perfil } = useUser();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tituloMobile =
    pathname.includes("usuarios")
      ? "Usuarios"
      : pathname.includes("roles")
      ? "Roles"
      : pathname.includes("locales")
      ? "Locales"
      : pathname.includes("proveedores")
      ? "Proveedores"
      : pathname.includes("productos")
      ? "Productos"
      : pathname.includes("stock")
      ? "Stock"
      : pathname.includes("transferencias")
      ? "Transferencias"
      : pathname.includes("pos-ventas")
      ? "POS Ventas"
      : pathname.includes("pos-transferencias")
      ? "POS Transferencias"
      : pathname.includes("pos")
      ? "POS"
      : "Panel";

  const isSidebar = menuMode === "sidebarLeft";
  const menu = !isSidebar && perfil ? buildVisibleMenu(MENU_CONFIG, perfil) : null;

  return (
    <div className={`${isSidebar ? "flex" : "flex flex-col"} min-h-full w-full overflow-x-hidden`}>

      {/* SIDEBAR (solo en modo sidebarLeft) */}
      {isSidebar && <SidebarPro />}

      {/* MOBILE DRAWER (solo en modo topbar) */}
      {!isSidebar && perfil && menu && <SidebarMobile menu={menu} perfil={perfil} />}

      {/* DESKTOP DRAWER (solo en modo topbar, al clickear Menú) */}
      {!isSidebar && drawerOpen && (
        <SidebarPro variant="drawer" onClose={() => setDrawerOpen(false)} />
      )}

      {/* CONTENT AREA */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        <Header />

        {/* TOPBAR desktop (solo en modo topbar) */}
        {!isSidebar && <TopbarNav onOpenMenu={() => setDrawerOpen(true)} />}

        {/* TITULO MOBILE */}
        <div className="md:hidden px-4 py-3 text-xl font-semibold">
          {tituloMobile}
        </div>

        {/* MAIN CONTENT */}
        <main
          className="flex-1 min-h-0 p-4 overflow-auto transition-colors duration-200"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
