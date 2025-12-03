"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiSeparator({ label, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.separator;

  return (
    <div
      className={cn(
        `
        flex items-center
        ${t.text}
      `,
        className
      )}
      style={{
        gap: ui.spacing.sm,
        marginTop: ui.spacing.md,
        marginBottom: ui.spacing.md,
        fontSize: ui.font.base * ui.font.scaleSm,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
      }}
    >
      <div
        className={cn(t.line)}
        style={{
          flex: 1,
          height: ui.border.widthThin,
        }}
      />

      {label && (
        <span className="whitespace-nowrap">
          {label}
        </span>
      )}

      <div
        className={cn(t.line)}
        style={{
          flex: 1,
          height: ui.border.widthThin,
        }}
      />
    </div>
  );
}
