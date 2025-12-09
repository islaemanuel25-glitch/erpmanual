"use client";

import { cn } from "@/lib/utils";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SidebarIcon({ Icon, IconFilled, active }) {
  const { theme } = useSunmiTheme();
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
        className={cn(
          `absolute ${theme.sidebar.icon} transition-opacity duration-150`,
          active ? "opacity-0" : "opacity-80"
        )}
        style={{
          width: parseInt(ui.helpers.icon(1)),
          height: parseInt(ui.helpers.icon(1)),
        }}
      />
      <IconFilled
        className={cn(
          `absolute ${theme.sidebar.iconActive} transition-opacity duration-150`,
          active ? "opacity-100" : "opacity-0"
        )}
        style={{
          width: parseInt(ui.helpers.icon(1)),
          height: parseInt(ui.helpers.icon(1)),
        }}
      />
    </div>
  );
}
