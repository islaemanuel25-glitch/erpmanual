"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
  contentMode: "table",      // (futuro)
  presetKey: "default",      // (futuro)
};

export default function LayoutController({ children }) {
  const { layoutMode } = useLayoutMode();
  const { ui } = useUIConfig();

  const [layoutProfile, setLayoutProfile] = useState(DEFAULT_PROFILE);

  const loadProfile = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setLayoutProfile({ ...DEFAULT_PROFILE, ...parsed });
      } else {
        setLayoutProfile(DEFAULT_PROFILE);
      }
    } catch (e) {
      console.error("Error leyendo layout profile:", e);
      setLayoutProfile(DEFAULT_PROFILE);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    const handler = () => loadProfile();
    window.addEventListener("erp-layout-profile-updated", handler);
    return () => window.removeEventListener("erp-layout-profile-updated", handler);
  }, [loadProfile]);

  const { sidebarPosition, navbarPosition, contentWidth } = layoutProfile;

  const maxWidth = useMemo(() => {
    return ui.helpers.contentMaxWidth(contentWidth);
  }, [contentWidth, ui]);

  // altura del header para offsets coherentes (floating)
  const headerHeight = ui.helpers.controlHeight();
  const overlayTop =
    navbarPosition === "top"
      ? `calc(${headerHeight} + ${ui.helpers.spacing("md")})`
      : ui.helpers.spacing("xl");

  useEffect(() => {
    try {
      if (sidebarPosition === "top") {
        localStorage.setItem("erp-layout-mode", "sidebar-top");
      } else if (sidebarPosition !== "top" && layoutMode === "sidebar-top") {
        localStorage.setItem("erp-layout-mode", "sidebar-left");
      }
    } catch (e) {
      console.error("Error sincronizando layoutMode:", e);
    }
  }, [sidebarPosition, layoutMode]);

  const overrideTopMode =
    sidebarPosition === "top" || layoutMode === "sidebar-top";

  // ============================ LAYOUT TOP ============================
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
      </div>
    );
  }

  // ======================== LAYOUT PROFESIONAL ========================
  return (
    <div className="layout-root flex flex-col h-full w-full relative overflow-visible">
      {/* HEADER TOP */}
      {navbarPosition === "top" && <Header position="top" />}

      {/* FILA PRINCIPAL */}
      <div className="layout-row flex flex-row flex-1 min-h-0 w-full justify-center relative">
        <div
          className="layout-inner flex flex-row w-full min-h-0 transition-all duration-300"
          style={{ maxWidth }}
        >
          {/* Sidebar izquierda */}
          {sidebarPosition === "left" && (
            <div className="transition-all duration-300 min-h-0">
              <SidebarPro position="left" />
            </div>
          )}

          {/* CONTENIDO */}
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

          {/* Sidebar derecha */}
          {sidebarPosition === "right" && (
            <div className="transition-all duration-300 min-h-0">
              <SidebarPro position="right" />
            </div>
          )}
        </div>
      </div>

      {/* HEADER BOTTOM */}
      {navbarPosition === "bottom" && <Header position="bottom" />}

      {/* SIDEBAR FLOTANTE */}
      {sidebarPosition === "floating" && (
        <div
          className="pointer-events-none fixed z-40 transition-all duration-300"
          style={{
            top: overlayTop,
            right: ui.helpers.spacing("xl"),
          }}
        >
          <div className="pointer-events-auto">
            <SidebarPro position="floating" />
          </div>
        </div>
      )}
    </div>
  );
}
