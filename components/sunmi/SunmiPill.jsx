"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiPill({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { fade } = useSunmiAnimation();
  const t = theme.pill;

  return (
    <span
      className={cn(`inline-block rounded-md font-semibold ${t.bg} ${t.text}`, className)}
      style={{
        padding: `${ui.gap} calc(${ui.gap} * 1.2)`,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
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
    </span>
  );
}
