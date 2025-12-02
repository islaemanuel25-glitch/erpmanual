"use client";

import { Bell, ChevronDown, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useUser } from "@/app/context/UserContext";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

export default function Header() {
  const pathname = usePathname();
  const menuRef = useRef(null);
  const { perfil, logout } = useUser();

  const { theme, themeKey, setThemeKey } = useSunmiTheme();

  const [open, setOpen] = useState(false);

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
    <header
      className={`
        w-full h-16 px-6 flex justify-between items-center
        shadow-[0_3px_8px_rgba(0,0,0,0.35)]
        bg-gradient-to-r ${theme.header.bg}
        border-b ${theme.header.border}
      `}
    >
      <h1 className={`text-xl font-semibold hidden md:block ${theme.header.text}`}>
        {titulo}
      </h1>

      <div className="flex items-center gap-6">

        <Bell
          className={`
            text-slate-400 
            hover:text-yellow-400
            transition cursor-pointer
          `}
        />

        {/* SELECTOR DE TEMA */}
        <select
          onChange={(e) => setThemeKey(e.target.value)}
          value={themeKey}
          className="
            bg-slate-800 
            border border-slate-600 
            text-slate-200 
            text-[12px]
            rounded-md 
            px-2 py-1
            focus:outline-none 
            cursor-pointer
          "
        >
          <option value="sunmiDark">Dark</option>
          <option value="sunmiDarkCompact">Compact</option>
          <option value="sunmiLight">Light</option>
        </select>

        {/* USUARIO */}
        <div className="relative" ref={menuRef}>
          <div
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <div
              className="
                w-9 h-9 rounded-full
                bg-slate-800 
                text-yellow-300
                flex items-center justify-center
                text-[13px] font-bold
                border border-slate-600
                shadow-[0_0_6px_rgba(250,204,21,0.5)]
                hover:shadow-[0_0_10px_rgba(250,204,21,0.7)]
                transition
              "
            >
              {nombre[0]?.toUpperCase() || "?"}
            </div>

            <div className="flex flex-col leading-tight">
              <span className="text-[13px] text-slate-100 font-medium">
                {nombre}
              </span>

              <span
                className="
                  text-[11px] px-2 py-[1px]
                  bg-yellow-500/15 
                  text-yellow-400
                  rounded-md border border-yellow-500/30
                  w-fit
                "
              >
                {rol}
              </span>
            </div>

            <ChevronDown
              size={18}
              className={`
                text-slate-400 transition-transform
                ${open ? "rotate-180" : ""}
              `}
            />
          </div>

          {open && (
            <div
              className={`
                absolute right-0 mt-2 w-52
                bg-slate-900
                border border-slate-700
                shadow-xl
                rounded-md py-2 z-50
              `}
            >
              <div className="px-4 py-1">
                <p className="text-sm font-semibold text-slate-100">
                  {nombre}
                </p>
                <p className="text-xs text-slate-400">{rol}</p>
              </div>

              <div className="border-t border-slate-700 my-1" />

              <button
                onClick={logout}
                className="
                  flex items-center gap-2 w-full text-left 
                  px-4 py-2 text-[13px]
                  text-red-400 hover:bg-red-500/10 
                  transition
                "
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
