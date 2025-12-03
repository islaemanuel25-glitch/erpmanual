"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiCard({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  return (
    <div
      className={`
        ${theme.card}
        backdrop-blur-sm
        ${className}
      `}
      style={{
        padding: ui.spacing.md,
        borderRadius: ui.rounded.lg,
        boxShadow: ui.shadow.sm,
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </div>
  );
}
