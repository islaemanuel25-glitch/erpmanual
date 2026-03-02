"use client";

import Link from "next/link";
import SidebarIcon from "./SidebarIcon";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const btnRef = useRef(null);
  const { theme } = useSunmiTheme();
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const puede = (perm) => {
    if (esAdmin) return true;
    if (!perm) return false;
    return permisos.includes(perm);
  };

  const visibles = esAdmin ? items : items.filter(i => !i.permiso || puede(i.permiso));
  if (visibles.length === 0) return null;

  const activo = visibles.some(i => pathname.startsWith(i.href));
  const abierto = openGroup === id;

  // Posicionar flyout con fixed usando rect del botón
  useEffect(() => {
    if (!abierto || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.right + 8 });
  }, [abierto]);

  // Cerrar al scrollear el sidebar
  useEffect(() => {
    if (!abierto || !btnRef.current) return;
    const scrollParent = btnRef.current.closest("[data-sidebar-scroll]");
    if (!scrollParent) return;
    const onScroll = () => setOpenGroup(null);
    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollParent.removeEventListener("scroll", onScroll);
  }, [abierto, setOpenGroup]);

  // Click-outside: cerrar si click fuera del panel Y fuera del botón
  useEffect(() => {
    if (!abierto) return;
    const handler = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpenGroup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [abierto, setOpenGroup]);

  return (
    <div className="flex flex-col items-center w-full">
      <button
        ref={btnRef}
        onClick={() => setOpenGroup(abierto ? null : id)}
        className={`flex items-center justify-center w-12 h-12 rounded-xl transition ${theme.sidebar.hover}`}
      >
        <SidebarIcon Icon={icon} IconFilled={iconFilled} active={abierto || activo} />
      </button>

      {abierto && (
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className={`
            ${theme.sidebar.dropdownBg}
            ${theme.sidebar.dropdownBorder} border
            rounded-xl
            shadow-xl shadow-black/50
            p-3 w-48
            z-50
            max-h-[calc(100dvh-2rem)] overflow-y-auto
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
