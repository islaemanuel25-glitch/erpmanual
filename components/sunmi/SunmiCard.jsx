"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";

export default function SunmiCard({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { fade } = useSunmiAnimation();

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
        animation: `fadeIn ${fade.duration}ms ease`,
      }}
    >
      <style>
        {`
        @keyframes fadeIn {
          from { opacity: ${fade.from}; }
          to { opacity: 1; }
        }
      `}
      </style>

      {children}
    </div>
  );
}
