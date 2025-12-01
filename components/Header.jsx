"use client";

import { Bell, ChevronDown, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useUser } from "@/app/context/UserContext";

export default function Header() {
  const pathname = usePathname();
  const menuRef = useRef(null);
  const { perfil, logout } = useUser();

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
      className="
        w-full h-16 px-6
        bg-slate-900
        border-b border-slate-800
        flex justify-between items-center
        shadow-[0_3px_8px_rgba(0,0,0,0.35)]
      "
    >
      {/* IZQUIERDA: TITULO */}
      <h1 className="text-xl font-semibold text-slate-100 hidden md:block">
        {titulo}
      </h1>

      {/* DERECHA */}
      <div className="flex items-center gap-6">

        {/* NOTIFICACIONES */}
        <Bell
          className="
            text-slate-400 
            hover:text-yellow-400
            transition cursor-pointer
          "
        />

        {/* USUARIO */}
        <div className="relative" ref={menuRef}>
          <div
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            {/* AVATAR */}
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

            {/* NOMBRE + ROL */}
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

          {/* MENU DESPLEGABLE */}
          {open && (
            <div
              className="
                absolute right-0 mt-2 w-52
                bg-slate-900
                border border-slate-700
                shadow-xl
                rounded-md py-2 z-50
              "
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
