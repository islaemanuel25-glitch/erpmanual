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
        gap: ui.gap,
        marginTop: ui.gap,
        marginBottom: ui.gap,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
      }}
    >
      <div className={cn("flex-1 h-px", t.line)} />

      {label && (
        <span className="whitespace-nowrap">
          {label}
        </span>
      )}

      <div className={cn("flex-1 h-px", t.line)} />
    </div>
  );
}
