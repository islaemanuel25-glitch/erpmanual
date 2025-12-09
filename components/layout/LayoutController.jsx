"use client";

import { useEffect, useState } from "react";
import { useLayoutMode } from "@/components/providers/LayoutModeProvider";
import SidebarPro from "@/components/sidebar/SidebarPro";
import SidebarTop from "@/components/sidebar/SidebarTop";
import Header from "@/components/Header";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

const STORAGE_KEY = "erp-layout-profile";

const DEFAULT_PROFILE = {
  sidebarPosition: "left",   // left | right | top | hidden | floating
  navbarPosition: "top",     // top | bottom | hidden
  contentWidth: "normal",    // normal | wide | full
  contentMode: "table",      // table | cards | mixed (hoy solo para futuro)
  presetKey: "default",
};

export default function LayoutController({ children }) {
  const { layoutMode } = useLayoutMode();
  const { ui } = useUIConfig();

  const [layoutProfile, setLayoutProfile] = useState(DEFAULT_PROFILE);

  // Cargar profile inicial + escuchar cambios del Builder
  useEffect(() => {
    const loadProfile = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setLayoutProfile({
            ...DEFAULT_PROFILE,
            ...parsed,
          });
        } else {
          setLayoutProfile(DEFAULT_PROFILE);
        }
      } catch (e) {
        console.error("Error leyendo layout profile:", e);
        setLayoutProfile(DEFAULT_PROFILE);
      }
    };

    loadProfile();

    const handler = () => {
      loadProfile();
    };

    window.addEventListener("erp-layout-profile-updated", handler);
    return () => {
      window.removeEventListener("erp-layout-profile-updated", handler);
    };
  }, []);

  const { sidebarPosition, navbarPosition, contentWidth } = layoutProfile;

  // Calcular maxWidth según contentWidth
  const getMaxWidth = () => {
    if (contentWidth === "normal") return "1120px";
    if (contentWidth === "wide") return "1440px";
    return "100%";
  };

  const maxWidth = getMaxWidth();

  // Check if we should use legacy top mode
  // This happens if: 1) layoutProfile.sidebarPosition === "top", OR 2) layoutMode === "sidebar-top" (legacy)
  const overrideTopMode = sidebarPosition === "top" || layoutMode === "sidebar-top";

  // 🔹 MODO SIDEBAR SUPERIOR (legacy mode - SidebarTop dentro de Header)
  if (overrideTopMode) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {navbarPosition === "top" && <Header position="top" />}
        <SidebarTop />
        <main
          className="flex-1 min-h-0 overflow-auto transition-colors duration-200"
          style={{
            backgroundColor: "var(--sunmi-bg)",
            color: "var(--sunmi-text)",
            padding: ui.helpers.spacing("lg"),
          }}
        >
          {children}
        </main>
        {navbarPosition === "bottom" && <Header position="bottom" />}
        {/* navbarPosition === "hidden" → no renderiza Header */}
      </div>
    );
  }

  // 🔹 NEW PROFESSIONAL LAYOUT ARCHITECTURE (Notion/Linear-style)
  // Three independent layers: HEADER | LAYOUT ROW | FLOATING ELEMENTS
  return (
    <div className="layout-root flex flex-col h-full w-full relative overflow-hidden">
      {/* Layer 1: HEADER (top) */}
      {navbarPosition === "top" && <Header position="top" />}

      {/* Layer 2: LAYOUT ROW (sidebar left/right + content) */}
      <div className="layout-row flex flex-row flex-1 w-full justify-center relative">
        <div className="layout-inner flex flex-row h-full w-full" style={{ maxWidth }}>
          {/* Sidebar a la izquierda - alineado con contenido */}
          {sidebarPosition === "left" && <SidebarPro position="left" />}

          {/* Contenido principal */}
          <main
            className="layout-content flex-1 min-h-0 overflow-auto transition-colors duration-200"
            style={{
              backgroundColor: "var(--sunmi-bg)",
              color: "var(--sunmi-text)",
              padding: ui.helpers.spacing("lg"),
            }}
          >
            {children}
          </main>

          {/* Sidebar a la derecha - alineado con contenido */}
          {sidebarPosition === "right" && <SidebarPro position="right" />}
        </div>
      </div>

      {/* Layer 3: HEADER (bottom) */}
      {navbarPosition === "bottom" && <Header position="bottom" />}

      {/* Layer 4: FLOATING ELEMENTS (floating sidebar) */}
      {sidebarPosition === "floating" && (
        <SidebarPro
          position="floating"
          style={{
            position: "absolute",
            top: ui.helpers.spacing("xl"),
            right: ui.helpers.spacing("xl"),
            zIndex: 40,
          }}
        />
      )}

      {/* sidebarPosition === "hidden" → no SidebarPro */}
    </div>
  );
}
