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
  horizontal = false,   // ⭐ NUEVO: soporte menú arriba
}) {
  const pathname = usePathname();
  const { theme } = useSunmiTheme();
  const panelRef = useRef(null);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const puede = (perm) => {
    if (esAdmin) return true;
    if (!perm) return false;
    return permisos.includes(perm);
  };

  const visibles = esAdmin ? items : items.filter((i) => puede(i.permiso));
  if (visibles.length === 0) return null;

  const activo = visibles.some((i) => pathname.startsWith(i.href));
  const abierto = openGroup === id;

  // ==============================
  // Cerrar DROPDOWN cuando clickea afuera
  // ==============================
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

  // ==============================
  // CLASES POR THEME
  // ==============================
  const dropdownBg = theme.sidebar.dropdownBg;
  const dropdownBorder = theme.sidebar.dropdownBorder;
  const dropdownHeading = theme.sidebar.dropdownHeading;
  const dropdownItem = theme.sidebar.dropdownItem;
  const dropdownItemHover = theme.sidebar.dropdownItemHover;
  const iconColor = activo ? theme.sidebar.iconActive : theme.sidebar.icon;

  // ==============================
  // BOTÓN PRINCIPAL (icono)
  // ==============================
  const ButtonBase = (
    <button
      onClick={() => setOpenGroup(abierto ? null : id)}
      className={`
        flex items-center justify-center
        ${horizontal ? "px-3 h-10" : "w-12 h-12 rounded-xl"}
        ${theme.sidebar.hover}
        transition
      `}
    >
      <SidebarIcon Icon={icon} IconFilled={iconFilled} active={abierto || activo} />
    </button>
  );

  // ==============================
  // RENDER EN MODO HORIZONTAL
  // ==============================
  if (horizontal) {
    return (
      <div className="relative flex items-center">
        {ButtonBase}

        {abierto && (
          <div
            ref={panelRef}
            className={`
              absolute top-12 left-0
              ${dropdownBg}
              ${dropdownBorder}
              rounded-xl shadow-xl p-3 w-48 z-50
            `}
          >
            <h3 className={`${dropdownHeading} text-xs font-bold mb-2 uppercase tracking-wide`}>
              {label}
            </h3>

            {visibles.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  block text-sm px-2 py-1.5 rounded-md
                  ${dropdownItem}
                  ${dropdownItemHover}
                  transition
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

  // ==============================
  // RENDER EN MODO VERTICAL (por defecto)
  // ==============================
  return (
    <div className="relative flex flex-col items-center w-full">
      {ButtonBase}

      {abierto && (
        <div
          ref={panelRef}
          className={`
            absolute left-14 top-0
            ${dropdownBg}
            ${dropdownBorder}
            rounded-xl shadow-xl p-3 w-48 z-50
          `}
        >
          <h3 className={`${dropdownHeading} text-xs font-bold mb-2 uppercase tracking-wide`}>
            {label}
          </h3>

          {visibles.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`
                block text-sm px-2 py-1.5 rounded-md
                ${dropdownItem}
                ${dropdownItemHover}
                transition
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
