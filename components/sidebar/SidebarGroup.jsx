"use client";

import Link from "next/link";
import SidebarIcon from "./SidebarIcon";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

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
  const { theme } = useSunmiTheme();

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
        className={`flex items-center justify-center w-12 h-12 rounded-xl transition ${theme.sidebar.hover}`}
      >
        <SidebarIcon Icon={icon} IconFilled={iconFilled} active={abierto || activo} />
      </button>

      {abierto && (
        <div
          ref={panelRef}
          className={`
            absolute left-14 top-0
            ${theme.sidebar.dropdownBg}
            ${theme.sidebar.dropdownBorder} border
            rounded-xl
            shadow-xl shadow-black/50 
            p-3 w-48 
            z-50
          `}
        >
          <h3 className={`${theme.sidebar.dropdownHeading} text-xs font-bold mb-2 uppercase tracking-wide`}>
            {label}
          </h3>

          {visibles.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`
                block text-sm px-2 py-1.5 rounded-md transition
                ${theme.sidebar.dropdownItem}
                ${theme.sidebar.dropdownItemHover}
              `}
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
