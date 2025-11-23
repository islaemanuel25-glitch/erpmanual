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

  // ✅ Datos del usuario desde el nuevo sistema
  const nombre = perfil?.nombre || "Usuario";
  const rol = perfil?.rol || "-";
  const localActual = perfil?.localId ? `Local ${perfil.localId}` : "Sin local";

  // ✅ Título del módulo (Desktop)
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

  // ✅ Cerrar menú al hacer click afuera
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
        w-full 
        bg-slate-900 
        border-b border-slate-800 
        px-6 h-16 
        flex justify-between items-center
        shadow-md
      "
    >
      {/* ✅ TÍTULO — SOLO DESKTOP */}
      <h1 className="text-xl font-semibold text-slate-200 hidden md:block">
        {titulo}
      </h1>

      <div className="flex items-center gap-6">
        <Bell className="text-slate-400 cursor-pointer hover:text-slate-300 transition" />

        {/* ✅ Menú usuario */}
        <div className="relative" ref={menuRef}>
          <div
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <div
              className="
                w-9 h-9 rounded-full 
                bg-slate-800 text-cyan-300 
                flex items-center justify-center 
                text-[13px] font-bold 
                shadow-inner
              "
            >
              {nombre[0]?.toUpperCase() || "?"}
            </div>

            <div className="flex flex-col leading-tight">
              <span className="text-[13px] text-slate-100 font-medium">
                {nombre}
              </span>
              <span className="text-[11px] text-slate-400">{rol}</span>
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
              className="
                absolute right-0 mt-2 w-52 
                bg-slate-900 
                border border-slate-700 
                shadow-xl 
                rounded-md py-2 z-50
              "
            >
              <div className="px-4 py-1">
                <p className="text-sm font-semibold text-slate-100">{nombre}</p>
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
