"use client";

import { useRouter, usePathname } from "next/navigation";
import SidebarPro from "@/components/sidebar/SidebarPro";
import Header from "./Header";

export default function LayoutBase({ children }) {
  const pathname = usePathname();

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

      <SidebarPro />

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        <Header />

        <div className="md:hidden px-4 py-3 text-xl font-semibold text-slate-100">
          {tituloMobile}
        </div>

        <main className="flex-1 min-h-0 p-4 overflow-auto bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
}
