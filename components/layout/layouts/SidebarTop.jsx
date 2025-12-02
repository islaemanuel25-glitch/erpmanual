"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import SidebarPro from "@/components/sidebar/SidebarPro";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

export default function SidebarTop({ children }) {
  const pathname = usePathname();
  const { theme } = useSunmiTheme();

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
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* HEADER SUPERIOR (LO DE SIEMPRE) */}
      <Header />

      {/* BARRA DE NAVEGACIÓN SUPERIOR (DESKTOP) */}
      <div
        className={`
          hidden md:flex items-center gap-4
          h-12 px-4
          border-b
          ${theme.navbar?.bg || "bg-slate-900"}
          ${theme.navbar?.border || "border-slate-800"}
        `}
      >
        <span
          className={`
            text-sm font-semibold
            ${theme.navbar?.text || "text-slate-200"}
          `}
        >
          {titulo}
        </span>

        {/* MENÚ HORIZONTAL */}
        <div className="flex-1 flex items-center">
          <SidebarPro mode="horizontal" />
        </div>
      </div>

      {/* TÍTULO EN MOBILE (SIN MENÚ ARRIBA POR AHORA) */}
      <div className="md:hidden px-4 py-3 text-xl font-semibold">
        {titulo}
      </div>

      {/* CONTENIDO */}
      <main className="flex-1 p-4 overflow-auto">
        {children}
      </main>
    </div>
  );
}
