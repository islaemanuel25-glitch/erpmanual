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
        paddingLeft: ui.spacing.sm,
        paddingRight: ui.spacing.sm,
        paddingTop: ui.spacing.xs,
        paddingBottom: ui.spacing.xs,
        height: ui.density.inputHeight,
        borderRadius: ui.rounded.md,
        fontSize: ui.font.base * ui.font.scaleMd,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
      }}
    />
  );
}
