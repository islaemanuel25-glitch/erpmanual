"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiListCardItem({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { fade } = useSunmiAnimation();
  const t = theme.list;

  return (
    <div
      className={cn("flex items-center justify-between relative", className)}
      style={{
        paddingTop: ui.gap,
        paddingBottom: ui.gap,
        transform: `scale(${ui.scale})`,
        animation: `fadeCard ${fade.duration}ms ${ui.animations.easing}`,
      }}
    >
      <style>{`
        @keyframes fadeCard {
          from { opacity: ${fade.from}; }
          to { opacity: 1; }
        }
      `}</style>

      <div
        className={cn("absolute left-0 right-0", t.separator)}
        style={{
          height: ui.borderThin,
          bottom: ui.gap * -0.5,
        }}
      />

      <div
        className="flex-1 truncate"
        style={{
          fontSize: ui.fontSize,
          lineHeight: `${ui.fontLineHeight}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
