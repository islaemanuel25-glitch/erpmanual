"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import SidebarPro from "@/components/sidebar/SidebarPro";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SidebarTop({ children }) {
  const pathname = usePathname();
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const titulo =
    pathname.includes("usuarios")
      ? "Usuarios"
      : pathname.includes("roles")
      ? "Roles"
      : pathname.includes("locales")
      ? "Locales"
      : pathname.includes("productos")
      ? "Productos"
      : pathname.includes("stock")
      ? "Stock"
      : pathname.includes("transferencias")
      ? "Transferencias"
      : pathname.includes("pos")
      ? "POS"
      : "Panel";

  return (
    <div className="flex flex-col" style={{ minHeight: "100vh" }}>
      <Header />

      <div
        className={`
          hidden md:flex items-center
          border-b
          ${theme.navbar?.bg || "bg-slate-900"}
          ${theme.navbar?.border || "border-slate-800"}
        `}
        style={{
          height: ui.inputHeight * 1.4,
          paddingInline: ui.spacingScale[ui.spacing],
          gap: ui.gap,
        }}
      >
        <span
          className={theme.navbar?.text || "text-slate-200"}
          style={{
            fontSize: ui.fontSize,
            fontWeight: 600,
          }}
        >
          {titulo}
        </span>

        <div className="flex-1 flex items-center">
          <SidebarPro mode="horizontal" />
        </div>
      </div>

      <div
        className="md:hidden"
        style={{
          paddingInline: ui.spacingScale[ui.spacing],
          paddingBlock: ui.spacingScale.sm,
          fontSize: ui.fontSizeLg,
          fontWeight: 600,
        }}
      >
        {titulo}
      </div>

      <main
        className="flex-1 overflow-auto"
        style={{
          padding: ui.spacingScale[ui.spacing],
        }}
      >
        {children}
      </main>
    </div>
  );
}
