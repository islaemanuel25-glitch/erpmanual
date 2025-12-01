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
  const { theme } = useSunmiTheme();

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
        border-b
        shadow-[0_3px_8px_rgba(0,0,0,0.35)]
        bg-gradient-to-r
        ${theme.header.bg}
        ${theme.header.border}
        transition-colors duration-200
      `}
    >
      {/* IZQUIERDA: TITULO */}
      <h1 className={`text-xl font-semibold hidden md:block ${theme.header.text}`}>
        {titulo}
      </h1>

      {/* DERECHA */}
      <div className="flex items-center gap-6">

        {/* NOTIFICACIONES */}
        <Bell
          className={`
            ${theme.header.text}
            hover:opacity-80
            transition cursor-pointer
          `}
        />

        {/* USUARIO */}
        <div className="relative" ref={menuRef}>
          <div
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            {/* AVATAR */}
            <div
              className={`
                w-9 h-9 rounded-full flex items-center justify-center
                text-[13px] font-bold
                transition shadow-md
                ${theme.card}
              `}
            >
              {nombre[0]?.toUpperCase() || "?"}
            </div>

            {/* NOMBRE + ROL */}
            <div className="flex flex-col leading-tight">
              <span className={`text-[13px] font-medium ${theme.header.text}`}>
                {nombre}
              </span>

              <span
                className={`
                  text-[11px] px-2 py-[1px]
                  rounded-md w-fit border
                  ${theme.header.border}
                  ${theme.header.text}
                `}
              >
                {rol}
              </span>
            </div>

            <ChevronDown
              size={18}
              className={`
                ${theme.header.text} transition-transform
                ${open ? "rotate-180" : ""}
              `}
            />
          </div>

          {/* MENU DESPLEGABLE */}
          {open && (
            <div
              className={`
                absolute right-0 mt-2 w-52
                rounded-md py-2 z-50
                shadow-xl border
                ${theme.card}
                ${theme.header.border}
              `}
            >
              <div className="px-4 py-1">
                <p className={`text-sm font-semibold ${theme.header.text}`}>
                  {nombre}
                </p>
                <p className="text-xs opacity-70">{rol}</p>
              </div>

              <div className={`border-t my-1 ${theme.header.border}`} />

              <button
                onClick={logout}
                className={`
                  flex items-center gap-2 w-full text-left 
                  px-4 py-2 text-[13px]
                  text-red-400 hover:bg-red-500/10 
                  transition
                `}
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
