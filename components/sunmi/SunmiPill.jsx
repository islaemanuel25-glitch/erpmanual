"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiPill({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.pill;

  return (
    <span
      className={cn(
        `
        inline-block
        font-semibold
        whitespace-nowrap
        ${t.bg}
        ${t.text}
      `,
        className
      )}
      style={{
        paddingLeft: ui.spacing.sm,
        paddingRight: ui.spacing.sm,
        paddingTop: ui.spacing.xs,
        paddingBottom: ui.spacing.xs,
        borderRadius: ui.rounded.full,
        fontSize: ui.font.base * ui.font.scaleSm,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </span>
  );
}
