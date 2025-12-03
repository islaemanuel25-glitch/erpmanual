"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiInput({ className = "", ...props }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.input;

  return (
    <input
      {...props}
      className={cn(
        `
        w-full 
        rounded-md
        outline-none
        transition-all
        ${t.bg}
        ${t.text}
        ${t.border}
        ${t.placeholder}
        ${t.focus}
      `,
        className
      )}
      style={{
        padding: `${ui.gap}`,
        height: ui.density.inputHeight,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
      }}
    />
  );
}
