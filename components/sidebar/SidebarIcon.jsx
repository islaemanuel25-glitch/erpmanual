"use client";

import { cn } from "@/lib/utils";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

export default function SidebarIcon({ Icon, IconFilled, active }) {
  const { theme } = useSunmiTheme();

  return (
    <div className="relative flex items-center justify-center w-6 h-6">
      <Icon
        className={cn(
          `absolute w-5 h-5 ${theme.sidebar.icon} transition-opacity duration-150`,
          active ? "opacity-0" : "opacity-80"
        )}
      />
      <IconFilled
        className={cn(
          `absolute w-5 h-5 ${theme.sidebar.iconActive} transition-opacity duration-150`,
          active ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
