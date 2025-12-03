"use client";

import { ChevronDown } from "lucide-react";
import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiSelect({ className = "", children, ...props }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const bgColor =
    theme.card.split(" ").find((c) => c.startsWith("bg-")) ||
    "bg-slate-950/60";

  const borderColor =
    theme.card.split(" ").find((c) => c.startsWith("border-")) ||
    "border-slate-700";

  const textColor =
    theme.layout.split(" ").find((c) => c.startsWith("text-")) ||
    "text-slate-100";

  return (
    <div className="relative w-full" style={{ transform: `scale(${ui.scale})` }}>
      <select
        {...props}
        className={`
          w-full 
          rounded-md
          ${bgColor}
          border ${borderColor}
          ${textColor}
          appearance-none
          focus:outline-none
          focus:border-amber-400
          transition
          ${className}
        `}
        style={{
          padding: ui.gap,
          height: ui.density.selectHeight,
          fontSize: ui.font.fontSize,
          lineHeight: ui.font.lineHeight,
        }}
      >
        {children}
      </select>

      <ChevronDown
        size={ui.density.iconSize}
        className="
          absolute right-2 top-1/2 -translate-y-1/2
          text-amber-400 opacity-70 
          pointer-events-none
        "
      />
    </div>
  );
}
