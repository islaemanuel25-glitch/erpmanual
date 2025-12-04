"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiCard({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { fade } = useSunmiAnimation();

  return (
    <div
      className={cn(theme.card, className)}
      style={{
        padding: ui.spacingScale[ui.spacing],
        borderRadius: ui.roundedScale[ui.rounded],
        boxShadow: ui.shadowMd,
        backdropFilter: `blur(${ui.cardShadowBlur}px)`,
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

      {children}
    </div>
  );
}
