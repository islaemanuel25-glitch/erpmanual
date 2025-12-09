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

export default function SidebarPro() {
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

  const sidebarStyle = {
    width: `${sidebarWidth}px`,
    height: "100%",
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

  // Modo agrupado
  if (isGrouped) {
    return (
      <div
        className={cn(
          "h-full flex flex-col border-r",
          showText ? "items-stretch" : "items-center"
        )}
        style={{
          ...sidebarStyle,
          backgroundColor: "var(--sunmi-sidebar-bg)",
          borderColor: "var(--sunmi-sidebar-border)",
          borderRightWidth: "1px",
        }}
      >
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
    <div
      className={cn(
        "h-full flex flex-col border-r",
        showText ? "items-stretch" : "items-center"
      )}
      style={{
        ...sidebarStyle,
        backgroundColor: "var(--sunmi-sidebar-bg)",
        borderColor: "var(--sunmi-sidebar-border)",
        borderRightWidth: "1px",
      }}
    >
      {sidebarItems.map((item) => (
        <SidebarItemFlat key={item.href} item={item} />
      ))}
    </div>
  );
}
