"use client";

import { useState } from "react";
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
      return {
        ...baseSidebarStyle,
        backgroundColor: "var(--sunmi-sidebar-bg)",
        borderColor: "var(--sunmi-sidebar-border)",
        borderWidth: "1px",
        borderRadius: ui.helpers.radius("lg"),
        boxShadow: "0 6px 22px rgba(0,0,0,0.35)",
        padding: ui.helpers.spacing("lg"),
        height: "auto",
      };
    }

    // left | right (sidebar estructural)
    return {
      ...baseSidebarStyle,
      height: "100%",
      backgroundColor: "var(--sunmi-sidebar-bg)",
      borderColor: "var(--sunmi-sidebar-border)",
      ...(position === "left"
        ? { borderRightWidth: ui.helpers.line() }
        : { borderLeftWidth: ui.helpers.line() }),
    };
  };

  // Merge: interno + style externo (Opción A)
  const sidebarStyle = {
    ...getInternalStyle(),
    ...style,
  };

  const containerClasses = cn(
    position === "floating" ? "flex flex-col" : "h-full flex flex-col",
    showText ? "items-stretch" : "items-center"
  );

  // Modo agrupado
  if (isGrouped) {
    return (
      <div className={containerClasses} style={sidebarStyle}>
        {sidebarGroups.map((group) => (
          <SidebarGroup
            key={group.id}
            id={group.id}
            icon={group.icon}
            iconFilled={group.iconFilled}
            label={group.label}
            items={group.items}
            perfil={perfil}
            openGroup={openGroup}
            setOpenGroup={setOpenGroup}
          />
        ))}
      </div>
    );
  }

  // Modo plano
  return (
    <div className={containerClasses} style={sidebarStyle}>
      {sidebarItems.map((item) => (
        <SidebarItemFlat key={item.href} item={item} />
      ))}
    </div>
  );
}
