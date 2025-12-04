"use client";

import { ChevronDown } from "lucide-react";
import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiSelect({
  className = "",
  children,
  ...props
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { focus } = useSunmiAnimation();

  const bg = theme.select.bg;
  const border = theme.select.border;
  const text = theme.select.text;

  return (
    <div
      className={cn("relative", className)}
      style={{ transform: `scale(${ui.scale})` }}
    >
      <select
        {...props}
        className={cn(
          `
            appearance-none
            transition-all
            ${bg}
            ${border}
            ${text}
          `
        )}
        style={{
          padding: ui.gap,
          height: ui.selectHeight,
          fontSize: ui.fontSize,
          lineHeight: `${ui.fontLineHeight}px`,
          borderRadius: ui.roundedScale[ui.rounded],
          transitionProperty: "border-color, transform, opacity",
          transitionDuration: `${ui.animations.duration}ms`,
          transitionTimingFunction: ui.animations.easing,
        }}
        onFocus={(e) => {
          e.currentTarget.style.transform = `scale(${
            ui.scale * ui.animations.focusScale
          })`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.transform = `scale(${ui.scale})`;
        }}
      >
        {children}
      </select>

      <ChevronDown
        size={ui.iconSize}
        className="
          absolute right-2 top-1/2 -translate-y-1/2
          opacity-70
          pointer-events-none
        "
      />
    </div>
  );
}
