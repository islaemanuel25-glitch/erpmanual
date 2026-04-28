"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGrid, X } from "lucide-react";
import SidebarPro from "@/components/sidebar/SidebarPro";
import TopbarNav from "@/components/layout/TopbarNav";
import MobileNav from "@/components/layout/MobileNav";
import AppLauncher from "@/components/layout/AppLauncher";
import Header from "./Header";
import { useLayoutSettings } from "@/app/context/LayoutSettingsContext";
import { useUser } from "@/app/context/UserContext";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { MENU_CONFIG, buildVisibleMenu } from "@/lib/menuConfig";

export default function LayoutBase({ children }) {
  const pathname = usePathname();
  const { menuMode } = useLayoutSettings();
  const { perfil } = useUser();
  const { theme } = useSunmiTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);

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
  const isTopbar = menuMode === "topbar";
  const isLauncher = menuMode === "launcher";
  const menu = isTopbar && perfil ? buildVisibleMenu(MENU_CONFIG, perfil) : null;

  const headerMobileHandler = isTopbar
    ? () => setMobileDrawerOpen(true)
    : isLauncher
    ? () => setLauncherOpen(true)
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

        {/* MAIN CONTENT: pb en mobile para no tapar con BottomNav */}
        <main
          className={`flex-1 min-h-0 p-4 ${isTopbar ? "pb-20 md:pb-4" : "pb-4"} overflow-auto transition-colors duration-200`}
        >
          {children}
        </main>
      </div>

      {/* LAUNCHER MODE: FAB desktop + overlay con AppLauncher */}
      {isLauncher && (
        <>
          <button
            type="button"
            onClick={() => setLauncherOpen(true)}
            className={`
              hidden md:flex items-center gap-2
              fixed bottom-6 right-6 z-40
              px-4 py-3 rounded-full
              shadow-xl border
              cursor-pointer
              transition hover:-translate-y-0.5
              ${theme.card}
              ${theme.sidebar.border}
              ${theme.sidebar.iconActive}
            `}
            aria-label="Abrir aplicaciones"
          >
            <LayoutGrid size={20} aria-hidden />
            <span className="text-sm font-semibold">Aplicaciones</span>
          </button>

          {launcherOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-label="Aplicaciones"
              onClick={() => setLauncherOpen(false)}
            >
              <div
                className={`
                  relative w-full max-w-5xl
                  rounded-2xl border shadow-2xl
                  p-4 sm:p-6
                  ${theme.card}
                  ${theme.sidebar.border}
                `}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setLauncherOpen(false)}
                  className={`
                    absolute top-3 right-3
                    p-2 rounded-lg min-w-[44px] min-h-[44px]
                    flex items-center justify-center
                    cursor-pointer
                    ${theme.sidebar.icon} ${theme.sidebar.hover}
                  `}
                  aria-label="Cerrar"
                >
                  <X size={22} />
                </button>
                <div onClick={() => setLauncherOpen(false)}>
                  <AppLauncher />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
