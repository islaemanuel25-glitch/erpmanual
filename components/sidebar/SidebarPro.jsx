"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebarConfig } from "@/components/providers/SidebarConfigProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SidebarGroup from "./SidebarGroup";
import SidebarItemFlat from "./SidebarItemFlat";
import sidebarItems from "./sidebarItems";
import sidebarGroups from "./sidebarGroups";
import { useUser } from "@/app/context/UserContext";

export default function SidebarPro({ position = "left", style = {} }) {
  const pathname = usePathname();
  const { sidebarMode, sidebarGroup } = useSidebarConfig();
  const { ui } = useUIConfig();
  const { perfil } = useUser();
  const [openGroup, setOpenGroup] = useState(null);

  const showText = sidebarMode === "icons-text";
  const isGrouped = sidebarGroup === "grouped";

  // Filtrado de permisos (igual que SidebarTop)
  const esAdmin = Array.isArray(perfil?.permisos) && perfil.permisos.includes("*");
  const puede = (perm) => (esAdmin ? true : perm && perfil.permisos.includes(perm));
  const filtrarVisibles = (items) => esAdmin ? items : items.filter((i) => puede(i.permiso));

  // Anchos dinámicos basados en UIConfig
  const sidebarWidth = showText
    ? parseInt(ui.helpers.controlHeight()) * 3.5
    : parseInt(ui.helpers.controlHeight()) * 1.2;

  // Estilos base comunes
  const baseSidebarStyle = {
    width: `${sidebarWidth}px`,
    paddingTop: ui.helpers.spacing("lg"),
    paddingBottom: ui.helpers.spacing("lg"),
    gap: ui.helpers.spacing("lg"),
    ...(showText
      ? {
          paddingLeft: ui.helpers.spacing("sm"),
          paddingRight: ui.helpers.spacing("sm"),
        }
      : {}),
  };

  // Estilos internos según posición
  const getInternalStyle = () => {
    if (position === "floating") {
      const xlSpacing = parseInt(ui.helpers.spacing("xl"));
      return {
        ...baseSidebarStyle,
        position: "fixed",
        backgroundColor: "var(--sunmi-sidebar-bg)",
        borderColor: "var(--sunmi-sidebar-border)",
        borderWidth: "1px",
        borderRadius: ui.helpers.radius("lg"),
        boxShadow: "0 6px 22px rgba(0,0,0,0.35)",
        padding: ui.helpers.spacing("lg"),
        height: "auto",
        maxHeight: `calc(100vh - ${xlSpacing * 2}px)`,
      };
    }

    // left | right (sidebar estructural)
    return {
      ...baseSidebarStyle,
      height: "100%",
      backgroundColor: "var(--sunmi-sidebar-bg)",
      borderColor: "var(--sunmi-sidebar-border)",
      ...(position === "left"
        ? { 
            borderRightWidth: ui.helpers.line(),
            borderLeftWidth: 0,
          }
        : { 
            borderLeftWidth: ui.helpers.line(),
            borderRightWidth: 0,
          }),
    };
  };

  // Merge: interno + style externo (protege estilos críticos para floating)
  const internalStyle = getInternalStyle();
  const sidebarStyle = useMemo(() => {
    if (position === "floating") {
      // Para floating, proteger estilos críticos (position, top, right, zIndex)
      const protectedKeys = ["position", "top", "right", "left", "bottom", "zIndex"];
      const safeStyle = Object.fromEntries(
        Object.entries(style).filter(([key]) => !protectedKeys.includes(key))
      );
      return {
        ...internalStyle,
        ...safeStyle,
      };
    }
    // Para left/right, permitir merge completo
    return {
      ...internalStyle,
      ...style,
    };
  }, [internalStyle, style, position]);

  const containerClasses = cn(
    position === "floating" ? "flex flex-col" : "h-full flex flex-col",
    showText ? "items-stretch" : "items-center"
  );

  // Modo agrupado
  if (isGrouped) {
    return (
      <div className={containerClasses} style={sidebarStyle}>
        {sidebarGroups.map((group) => {
          const visibles = filtrarVisibles(group.items);
          if (visibles.length === 0) return null;
          return (
            <SidebarGroup
              key={group.id}
              id={group.id}
              icon={group.icon}
              iconFilled={group.iconFilled}
              label={group.label}
              items={visibles}
              perfil={perfil}
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
            />
          );
        })}
      </div>
    );
  }

  // Modo plano
  return (
    <div className={containerClasses} style={sidebarStyle}>
      {filtrarVisibles(sidebarItems).map((item) => (
        <SidebarItemFlat key={item.href} item={item} />
      ))}
    </div>
  );
}
