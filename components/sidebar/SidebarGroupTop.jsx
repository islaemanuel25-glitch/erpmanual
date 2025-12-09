"use client";

import Link from "next/link";
import SidebarIcon from "./SidebarIcon";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
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
        className="flex items-center transition"
        style={{
          backgroundColor: activo || abierto ? "var(--sunmi-table-row-bg)" : "transparent",
          color: activo || abierto ? "var(--sunmi-header-text)" : "var(--sunmi-sidebar-text)",
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
        onMouseEnter={(e) => {
          if (!activo && !abierto) {
            e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
            e.currentTarget.style.filter = "brightness(1.1)";
          }
        }}
        onMouseLeave={(e) => {
          if (!activo && !abierto) {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.filter = "brightness(1)";
          }
        }}
      >
        <SidebarIcon Icon={icon} IconFilled={iconFilled} active={abierto || activo} />
        {showText && (
          <span
            className="font-medium"
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
          className="absolute left-0 top-full z-50 shadow-xl shadow-black/50 border"
          style={{
            backgroundColor: "var(--sunmi-card-bg)",
            borderColor: "var(--sunmi-card-border)",
            borderWidth: "1px",
            marginTop: ui.helpers.spacing("sm"),
            minWidth: parseInt(ui.helpers.controlHeight()) * 11.25,
            borderRadius: ui.helpers.radius("xl"),
            padding: ui.helpers.spacing("md"),
          }}
        >
          <h3
            className="font-bold uppercase tracking-wide"
            style={{
              color: "var(--sunmi-sidebar-text)",
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
                className="block transition"
                style={{
                  backgroundColor: activeItem ? "var(--sunmi-table-row-bg)" : "transparent",
                  color: activeItem ? "var(--sunmi-header-text)" : "var(--sunmi-text)",
                  fontSize: ui.helpers.font("sm"),
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  borderRadius: ui.helpers.radius("md"),
                }}
                onMouseEnter={(e) => {
                  if (!activeItem) {
                    e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!activeItem) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
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

