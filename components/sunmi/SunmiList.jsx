"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiList({ children, className = "" }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const { fade } = useSunmiAnimation();

  const divider =
    theme.card.split(" ").find((c) => c.startsWith("border-"))?.replace("border-", "divide-") ||
    "divide-slate-800/80";

  return (
    <div
      className={cn("flex flex-col", divider, className)}
      style={{
        gap: ui.gap,
        transform: `scale(${ui.scale})`,
        animation: `fadeList ${fade.duration}ms ${ui.animations.easing}`,
      }}
    >
      <style>{`
        @keyframes fadeList {
          from { opacity: ${fade.from}; }
          to { opacity: 1; }
        }
      `}</style>

      {children}
    </div>
  );
}
