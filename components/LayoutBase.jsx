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
import { useAccionDelShell } from "@/app/context/AccionDePaginaContext";
import { LEGACY_LAYOUTBASE_TITLES } from "@/lib/menu/legacyTitles";

export default function LayoutBase({ children }) {
  const pathname = usePathname();
  const { menuMode } = useLayoutSettings();
  const { perfil } = useUser();
  const { menu: fullMenu } = useMenu();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const tituloMobile = usePageTitle({ overrides: LEGACY_LAYOUTBASE_TITLES });
  const accionDePagina = useAccionDelShell();

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

        {/* TITULO MOBILE — con el slot de acción de la pantalla activa.
            El shell NO sabe qué pantalla es ni qué nodo le pasaron: acá solo se
            pregunta si hay una acción o no. Cualquier comparación de ruta en
            este archivo sería la excepción que este mecanismo vino a evitar.

            Sin acción se dibuja exactamente lo que se dibujaba antes —el texto
            suelto adentro del mismo div— para que las pantallas que no usan el
            slot, que son casi todas, queden idénticas al píxel.

            Con acción, la fila se reparte: el título a la izquierda, la acción
            a la derecha. `min-w-0 truncate` es lo que hace que un título largo
            se recorte en vez de empujar la acción fuera de la pantalla. */}
        <div className="md:hidden px-4 py-3 text-xl font-semibold">
          {accionDePagina ? (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{tituloMobile}</span>
              {accionDePagina}
            </div>
          ) : (
            tituloMobile
          )}
        </div>

        {/* MAIN CONTENT: pb en mobile para no tapar con BottomNav (solo topbar) */}
        <main
          className={`flex-1 min-h-0 p-4 ${isTopbar ? "pb-20 md:pb-4" : "pb-4"} overflow-auto transition-colors duration-200 ${isSidebar ? "md:border-l md:border-[var(--chrome-border)]" : ""}`}
        >
          {/* En modo launcher el menú aparece sólo en Inicio/Dashboard */}
          {showLauncher && <AppLauncher />}
          {children}
        </main>
      </div>
    </div>
  );
}
