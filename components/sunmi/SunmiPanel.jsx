"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiPanel({
  children,
  className = "",
  noPadding = false,
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  return (
    <div
      className={`
        ${theme.card}
        ${className}
      `}
      style={{
        padding: noPadding ? 0 : ui.spacing.md,
        borderRadius: ui.rounded.lg,
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </div>
  );
}
