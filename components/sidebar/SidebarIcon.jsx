"use client";

import { cn } from "@/lib/utils";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SidebarIcon({ Icon, IconFilled, active }) {
  const { ui } = useUIConfig();

  const iconSize = parseInt(ui.helpers.icon(1.125));

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: iconSize,
        height: iconSize,
      }}
    >
      <Icon
        className="absolute transition-opacity duration-150"
        style={{
          color: "var(--sunmi-sidebar-text)",
          width: parseInt(ui.helpers.icon(1)),
          height: parseInt(ui.helpers.icon(1)),
          opacity: active ? 0 : 0.8,
        }}
      />
      <IconFilled
        className="absolute transition-opacity duration-150"
        style={{
          color: "var(--sunmi-sidebar-text)",
          width: parseInt(ui.helpers.icon(1)),
          height: parseInt(ui.helpers.icon(1)),
          opacity: active ? 1 : 0,
        }}
      />
    </div>
  );
}
