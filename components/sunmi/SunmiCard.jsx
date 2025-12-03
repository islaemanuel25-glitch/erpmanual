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
        rounded-xl
        shadow-md
        backdrop-blur-sm
        ${className}
      `}
      style={{
        padding: ui.spacingScale[ui.spacing],
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </div>
  );
}
