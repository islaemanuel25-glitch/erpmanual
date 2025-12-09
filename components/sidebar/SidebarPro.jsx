"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useSidebarConfig } from "@/components/providers/SidebarConfigProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SidebarGroup from "./SidebarGroup";
import SidebarItemFlat from "./SidebarItemFlat";
import sidebarItems from "./sidebarItems";
import sidebarGroups from "./sidebarGroups";
import { useUser } from "@/app/context/UserContext";

export default function SidebarPro() {
  const pathname = usePathname();
  const { theme } = useSunmiTheme();
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

  const borderClass = theme.sidebar?.border
    ? `border-r ${theme.sidebar.border}`
    : "border-r border-slate-800";

  // Modo agrupado
  if (isGrouped) {
    return (
      <div
        className={cn(
          "h-full flex flex-col",
          theme.sidebar?.bg ?? "bg-slate-900",
          borderClass,
          showText ? "items-stretch" : "items-center"
        )}
        style={sidebarStyle}
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
        "h-full flex flex-col",
        theme.sidebar?.bg ?? "bg-slate-900",
        borderClass,
        showText ? "items-stretch" : "items-center"
      )}
      style={sidebarStyle}
    >
      {sidebarItems.map((item) => (
        <SidebarItemFlat key={item.href} item={item} />
      ))}
    </div>
  );
}
