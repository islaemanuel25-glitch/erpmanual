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
    <div
      className="relative w-full"
      style={{ transform: `scale(${ui.scale})` }}
    >
      <select
        {...props}
        className={`
          w-full
          ${bgColor}
          border ${borderColor}
          ${textColor}
          appearance-none
          focus:outline-none
          transition
          ${className}
        `}
        style={{
          paddingLeft: ui.spacing.sm,
          paddingRight: ui.spacing.lg,
          paddingTop: ui.spacing.xs,
          paddingBottom: ui.spacing.xs,
          height: ui.density.selectHeight,
          borderRadius: ui.rounded.md,
          fontSize: ui.font.base * ui.font.scaleMd,
          lineHeight: ui.font.lineHeight,
        }}
      >
        {children}
      </select>

      <ChevronDown
        size={ui.density.iconSize}
        strokeWidth={ui.density.iconStrokeWidth}
        style={{
          position: "absolute",
          right: ui.spacing.sm,
          top: "50%",
          transform: "translateY(-50%)",
          color: theme.input?.accentText || "rgba(255,200,0,0.7)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
