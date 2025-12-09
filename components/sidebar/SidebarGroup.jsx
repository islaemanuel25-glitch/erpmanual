"use client";

import Link from "next/link";
import SidebarIcon from "./SidebarIcon";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useSidebarConfig } from "@/components/providers/SidebarConfigProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

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
  const { sidebarMode } = useSidebarConfig();
  const showText = sidebarMode === "icons-text";

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

  const { ui } = useUIConfig();

  return (
    <div className={cn("relative flex flex-col", showText ? "items-stretch w-full" : "items-center w-full")}>
      <button
        onClick={() => setOpenGroup(abierto ? null : id)}
        className={cn("flex items-center transition", theme.sidebar.hover)}
        style={{
          borderRadius: ui.helpers.radius("xl"),
          ...(showText
            ? {
                paddingLeft: ui.helpers.spacing("md"),
                paddingRight: ui.helpers.spacing("md"),
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
                gap: ui.helpers.spacing("md"),
                width: "100%",
              }
            : {
                justifyContent: "center",
                width: parseInt(ui.helpers.controlHeight()) * 1.2,
                height: parseInt(ui.helpers.controlHeight()) * 1.2,
              }),
        }}
      >
        <SidebarIcon Icon={icon} IconFilled={iconFilled} active={abierto || activo} />
        {showText && (
          <span
            className={cn("font-medium", theme.sidebar?.text ?? "text-slate-200")}
            style={{
              fontSize: ui.helpers.font("sm"),
            }}
          >
            {label}
          </span>
        )}
      </button>

      {abierto && (
        <div
          ref={panelRef}
          className={`absolute top-0 z-50 ${theme.sidebar.dropdownBg} ${theme.sidebar.dropdownBorder} border shadow-xl shadow-black/50`}
          style={{
            left: showText ? parseInt(ui.helpers.controlHeight()) * 1.5 : parseInt(ui.helpers.controlHeight()) * 1.2,
            borderRadius: ui.helpers.radius("xl"),
            padding: ui.helpers.spacing("md"),
            width: parseInt(ui.helpers.controlHeight()) * 12,
          }}
        >
          <h3
            className={`${theme.sidebar.dropdownHeading} font-bold uppercase tracking-wide`}
            style={{
              fontSize: ui.helpers.font("xs"),
              marginBottom: ui.helpers.spacing("sm"),
            }}
          >
            {label}
          </h3>

          {visibles.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`block transition ${theme.sidebar.dropdownItem} ${theme.sidebar.dropdownItemHover}`}
              style={{
                fontSize: ui.helpers.font("sm"),
                paddingLeft: ui.helpers.spacing("sm"),
                paddingRight: ui.helpers.spacing("sm"),
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
                borderRadius: ui.helpers.radius("md"),
              }}
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
