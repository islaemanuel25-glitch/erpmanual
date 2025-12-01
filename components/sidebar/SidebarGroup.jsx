"use client";

import Link from "next/link";
import SidebarIcon from "./SidebarIcon";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export default function SidebarGroup({
  id,
  icon,
  iconFilled,
  label,
  items,
  perfil,
  openGroup,
  setOpenGroup,
}) {
  const pathname = usePathname();
  const panelRef = useRef(null);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const puede = (perm) => {
    if (esAdmin) return true;
    if (!perm) return false;
    return permisos.includes(perm);
  };

  const visibles = esAdmin ? items : items.filter(i => puede(i.permiso));
  if (visibles.length === 0) return null;

  const activo = visibles.some(i => pathname.startsWith(i.href));
  const abierto = openGroup === id;

  useEffect(() => {
    if (!abierto) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [abierto]);

  return (
    <div className="relative flex flex-col items-center w-full">
      <button
        onClick={() => setOpenGroup(abierto ? null : id)}
        className="
          flex items-center justify-center w-12 h-12
          rounded-xl 
          hover:bg-yellow-300/40
          transition
        "
      >
        <SidebarIcon Icon={icon} IconFilled={iconFilled} active={abierto || activo} />
      </button>

      {abierto && (
        <div
          ref={panelRef}
          className="
            absolute left-14 top-0
            bg-slate-950 
            border border-slate-800 
            rounded-xl
            shadow-xl shadow-black/50 
            p-3 w-48 
            z-50
          "
        >
          <h3 className="text-yellow-400 text-xs font-bold mb-2 uppercase tracking-wide">
            {label}
          </h3>

          {visibles.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="
                block text-sm text-slate-200
                px-2 py-1.5 rounded-md
                hover:bg-yellow-500/20 
                hover:text-yellow-400
                transition
              "
              onClick={() => setOpenGroup(null)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
