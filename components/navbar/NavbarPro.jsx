"use client";

import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import SidebarPro from "@/components/sidebar/SidebarPro";
import { useUser } from "@/app/context/UserContext";
import { ChevronDown, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

export default function NavbarPro() {
  const { theme } = useSunmiTheme();
  const pathname = usePathname();
  const { perfil, logout } = useUser();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const nombre = perfil?.nombre || "Usuario";
  const rol = perfil?.rol || "-";

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

  // Cerrar menú si clickea afuera
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <nav
      className={`
        h-14
        w-full
        flex items-center justify-between
        px-4
        border-b
        ${theme.navbar?.bg || "bg-slate-900"}
        ${theme.navbar?.border || "border-slate-800"}
      `}
    >
      {/* Título */}
      <div className={`text-lg font-semibold ${theme.navbar?.text || "text-slate-200"}`}>
        {titulo}
      </div>

      {/* Módulos horizontales */}
      <div className="hidden md:flex items-center gap-4">
        <SidebarPro mode="horizontal" />
      </div>

      {/* Usuario */}
      <div className="relative" ref={menuRef}>
        <div
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer"
        >
          <div
            className={`
              w-9 h-9 rounded-full
              flex items-center justify-center
              text-sm font-bold
              ${theme.userCell.avatarBg}
              ${theme.userCell.avatarText}
            `}
          >
            {nombre[0]?.toUpperCase()}
          </div>
          <ChevronDown
            size={18}
            className={`${open ? "rotate-180" : ""} transition`}
          />
        </div>

        {open && (
          <div
            className={`
              absolute right-0 mt-2 w-48 z-50
              rounded-lg shadow-xl
              ${theme.card}
            `}
          >
            <div className="px-4 py-2">
              <p className={`text-sm font-semibold ${theme.navbar?.text}`}>{nombre}</p>
              <p className="text-xs opacity-70">{rol}</p>
            </div>

            <div className="border-t border-slate-700/50 mt-1" />

            <button
              onClick={logout}
              className="
                flex items-center gap-2 px-4 py-2 w-full text-left
                text-red-400 hover:bg-red-500/10
              "
            >
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
