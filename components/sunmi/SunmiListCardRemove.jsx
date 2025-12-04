"use client";

import { X } from "lucide-react";
import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiListCardRemove({ onClick, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { hover } = useSunmiAnimation();

  const color = theme.list.remove || "text-slate-300";

  return (
    <button
      onClick={onClick}
      className={cn("flex items-center justify-center transition-all", className)}
      style={{
        width: ui.iconSize + ui.gap * 2,
        height: ui.iconSize + ui.gap * 2,
        borderRadius: ui.roundedScale[ui.rounded],
        transform: `scale(${ui.scale})`,
        transitionDuration: `${hover.duration}ms`,
        transitionTimingFunction: hover.easing,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = `scale(${ui.scale * hover.scale})`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = `scale(${ui.scale})`;
      }}
    >
      <X size={ui.iconSize} className={color} />
    </button>
  );
}
