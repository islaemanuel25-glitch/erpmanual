"use client";

import { useLayoutMode } from "@/components/providers/LayoutModeProvider";
import SidebarPro from "@/components/sidebar/SidebarPro";
import Header from "@/components/Header";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function LayoutController({ children }) {
  const { layoutMode } = useLayoutMode();
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  // 🔹 MODO SIDEBAR SUPERIOR (NO RENDERIZA SidebarPro)
  if (layoutMode === "sidebar-top") {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <Header /> {/* SidebarTop se renderiza adentro del Header */}
        <main
          className={`flex-1 min-h-0 overflow-auto transition-colors duration-200 ${theme.layout}`}
          style={{
            padding: ui.helpers.spacing("lg"),
          }}
        >
          {children}
        </main>
      </div>
    );
  }

  // 🔹 MODO SIDEBAR IZQUIERDO (DEFAULT)
  return (
    <div className="flex h-full w-full overflow-hidden">
      <SidebarPro />
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <Header />
        <main
          className={`flex-1 min-h-0 overflow-auto transition-colors duration-200 ${theme.layout}`}
          style={{
            padding: ui.helpers.spacing("lg"),
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
