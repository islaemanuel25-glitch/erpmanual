"use client";

import { useEffect, useState } from "react";
import { useLayoutMode } from "@/components/providers/LayoutModeProvider";
import SidebarPro from "@/components/sidebar/SidebarPro";
import Header from "@/components/Header";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

const STORAGE_KEY = "erp-layout-profile";

const DEFAULT_PROFILE = {
  sidebarPosition: "left",   // left | right | hidden | floating
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

  // Helper para envolver el contenido con maxWidth según contentWidth
  const renderContent = (children) => {
    let maxWidth = "100%";
    if (contentWidth === "normal") maxWidth = "1120px";
    if (contentWidth === "wide") maxWidth = "1440px";

    return (
      <main
        className="flex-1 min-h-0 overflow-auto transition-colors duration-200"
        style={{
          backgroundColor: "var(--sunmi-bg)",
          color: "var(--sunmi-text)",
          padding: ui.helpers.spacing("lg"),
        }}
      >
        <div style={{ maxWidth, margin: "0 auto" }}>{children}</div>
      </main>
    );
  };

  // 🔹 MODO SIDEBAR SUPERIOR (usa SidebarTop dentro de Header)
  if (layoutMode === "sidebar-top") {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {navbarPosition === "top" && <Header />}
        {renderContent(children)}
        {navbarPosition === "bottom" && <Header />}
        {/* navbarPosition === "hidden" → no renderiza Header */}
      </div>
    );
  }

  // 🔹 MODO SIDEBAR IZQUIERDO (DEFAULT ORIGINAL) + VARIANTES DEL PROFILE
  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Sidebar a la izquierda */}
      {sidebarPosition === "left" && <SidebarPro />}

      {/* Contenedor central */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {navbarPosition === "top" && <Header />}
        {renderContent(children)}
        {navbarPosition === "bottom" && <Header />}
        {/* navbarPosition === "hidden" → no Header */}
      </div>

      {/* Sidebar a la derecha */}
      {sidebarPosition === "right" && <SidebarPro />}

      {/* Sidebar flotante */}
      {sidebarPosition === "floating" && (
        <div className="absolute left-2 top-16 z-40 shadow-xl">
          <SidebarPro />
        </div>
      )}

      {/* sidebarPosition === "hidden" → no SidebarPro */}
    </div>
  );
}
