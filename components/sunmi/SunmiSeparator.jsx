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
      className={cn("flex items-center", t.text, className)}
      style={{
        gap: ui.gap,
        marginTop: ui.gap,
        marginBottom: ui.gap,
        fontSize: ui.fontSize,
        lineHeight: `${ui.fontLineHeight}px`,
        transform: `scale(${ui.scale})`,
        animation: `sepFade ${fade.duration}ms ${ui.animations.easing}`,
      }}
    >
      <style>{`
        @keyframes sepFade {
          from { opacity: ${fade.from}; }
          to { opacity: 1; }
        }
      `}</style>

      <div
        className={cn(t.line)}
        style={{
          height: ui.borderThin,
          flexGrow: 1,
        }}
      />

      {label && (
        <span className="whitespace-nowrap">{label}</span>
      )}

      <div
        className={cn(t.line)}
        style={{
          height: ui.borderThin,
          flexGrow: 1,
        }}
      />
    </div>
  );
}
