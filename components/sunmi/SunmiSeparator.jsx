"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiSeparator({ label, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { fade } = useSunmiAnimation();
  const t = theme.separator;

  return (
    <div
      className={cn(`flex items-center ${t.text}`, className)}
      style={{
        gap: ui.gap,
        marginTop: ui.gap,
        marginBottom: ui.gap,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
        animation: `sepFade ${fade.duration}ms ease`,
      }}
    >
      <style>
        {`
        @keyframes sepFade {
          from { opacity: ${fade.from}; }
          to { opacity: 1; }
        }
        `}
      </style>

      <div className={cn("flex-1 h-[1px]", t.line)} />

      {label && <span className="whitespace-nowrap">{label}</span>}

      <div className={cn("flex-1 h-[1px]", t.line)} />
    </div>
  );
}
