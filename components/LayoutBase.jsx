"use client";

import { useRouter, usePathname } from "next/navigation";
import SidebarPro from "@/components/sidebar/SidebarPro";
import Header from "./Header";
import { useSunmiTheme } from "./sunmi/SunmiThemeProvider";

export default function LayoutBase({ children }) {
  const pathname = usePathname();
  const { theme } = useSunmiTheme();

  const tituloMobile =
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
    <div className="flex h-full w-full overflow-hidden">

      {/* SIDEBAR */}
      <SidebarPro />

      {/* CONTENT AREA */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        <Header />

        {/* TITULO MOBILE */}
        <div className="md:hidden px-4 py-3 text-xl font-semibold">
          {tituloMobile}
        </div>

        {/* MAIN CONTENT (theme aplicado acá) */}
        <main
          className={`flex-1 min-h-0 p-4 overflow-auto transition-colors duration-200 ${theme.layout}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
