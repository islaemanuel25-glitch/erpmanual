"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import SidebarPro from "@/components/sidebar/SidebarPro";
import TopbarNav from "@/components/layout/TopbarNav";
import MobileNav from "@/components/layout/MobileNav";
import AppLauncher from "@/components/layout/AppLauncher";
import Header from "./Header";
import { useLayoutSettings } from "@/app/context/LayoutSettingsContext";
import { useUser } from "@/app/context/UserContext";
import { useMenu } from "@/hooks/useMenu";
import { usePageTitle } from "@/hooks/usePageTitle";
import { LEGACY_LAYOUTBASE_TITLES } from "@/lib/menu/legacyTitles";

export default function LayoutBase({ children }) {
  const pathname = usePathname();
  const { menuMode } = useLayoutSettings();
  const { perfil } = useUser();
  const { menu: fullMenu } = useMenu();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const tituloMobile = usePageTitle({ overrides: LEGACY_LAYOUTBASE_TITLES });

  const isSidebar = menuMode === "sidebarLeft";
  const isTopbar = menuMode === "topbar";
  const isLauncher = menuMode === "launcher";
  const menu = isTopbar && perfil ? fullMenu : null;

  // El launcher solo aparece en Inicio/Dashboard. En otras rutas (POS, Stock,
  // etc.) no se renderiza arriba del contenido.
  const showLauncher = isLauncher && pathname.startsWith("/modulos/dashboard");

  // En launcher el menú ya queda visible inline → la hamburguesa duplicaría
  // navegación, por eso no se monta.
  const headerMobileHandler = isTopbar
    ? () => setMobileDrawerOpen(true)
    : undefined;

  return (
    <div className={`${isSidebar ? "flex" : "flex flex-col"} h-dvh w-full overflow-x-hidden`}>

      {/* SIDEBAR (solo en modo sidebarLeft) */}
      {isSidebar && <SidebarPro />}

      {/* MOBILE: BottomNav + Drawer "Más" (solo en modo topbar) */}
      {isTopbar && perfil && menu && (
        <MobileNav menu={menu} drawerOpen={mobileDrawerOpen} setDrawerOpen={setMobileDrawerOpen} />
      )}

      {/* DESKTOP DRAWER (solo en modo topbar, al clickear Menú) */}
      {isTopbar && drawerOpen && (
        <SidebarPro variant="drawer" onClose={() => setDrawerOpen(false)} />
      )}

      {/* CONTENT AREA */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        <Header onOpenMobileMenu={headerMobileHandler} />

        {/* TOPBAR desktop (solo en modo topbar) */}
        {isTopbar && <TopbarNav onOpenMenu={() => setDrawerOpen(true)} />}

        {/* TITULO MOBILE */}
        <div className="md:hidden px-4 py-3 text-xl font-semibold">
          {tituloMobile}
        </div>

        {/* MAIN CONTENT: pb en mobile para no tapar con BottomNav (solo topbar) */}
        <main
          className={`flex-1 min-h-0 p-4 ${isTopbar ? "pb-20 md:pb-4" : "pb-4"} overflow-auto transition-colors duration-200`}
        >
          {/* En modo launcher el menú aparece sólo en Inicio/Dashboard */}
          {showLauncher && <AppLauncher />}
          {children}
        </main>
      </div>
    </div>
  );
}
