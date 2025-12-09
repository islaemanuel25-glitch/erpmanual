"use client";

import Link from "next/link";
import SidebarIcon from "./SidebarIcon";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useSidebarConfig } from "@/components/providers/SidebarConfigProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SidebarGroupTop({
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
  const { ui } = useUIConfig();
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
  }, [abierto, setOpenGroup]);

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpenGroup(abierto ? null : id)}
        className={cn(
          "flex items-center transition",
          activo || abierto
            ? "text-amber-400 bg-slate-800"
            : "text-slate-400 hover:text-white hover:bg-slate-800"
        )}
        style={{
          borderRadius: ui.helpers.radius("md"),
          ...(showText
            ? {
                paddingLeft: ui.helpers.spacing("md"),
                paddingRight: ui.helpers.spacing("md"),
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
                gap: ui.helpers.spacing("md"),
              }
            : {
                padding: ui.helpers.spacing("sm"),
                justifyContent: "center",
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
          className={cn(
            "absolute left-0 top-full z-50 shadow-xl shadow-black/50 border",
            theme.sidebar.dropdownBg,
            theme.sidebar.dropdownBorder
          )}
          style={{
            marginTop: ui.helpers.spacing("sm"),
            minWidth: parseInt(ui.helpers.controlHeight()) * 11.25,
            borderRadius: ui.helpers.radius("xl"),
            padding: ui.helpers.spacing("md"),
          }}
        >
          <h3
            className={cn("font-bold uppercase tracking-wide", theme.sidebar.dropdownHeading)}
            style={{
              fontSize: ui.helpers.font("xs"),
              marginBottom: ui.helpers.spacing("sm"),
            }}
          >
            {label}
          </h3>

          {visibles.map(item => {
            const activeItem = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block transition",
                  activeItem
                    ? "bg-slate-700 text-amber-300"
                    : cn(
                        theme.sidebar.dropdownItem,
                        theme.sidebar.dropdownItemHover
                      )
                )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

