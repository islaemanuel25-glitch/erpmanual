"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";
import { cn } from "@/lib/utils";

export default function SunmiGrid({
  children,
  className = "",
  minWidth,
}) {
  const { ui } = useUIConfig();
  const { fade } = useSunmiAnimation();

  const width = minWidth || ui.cardMinWidth;

  return (
    <div
      className={cn(className)}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${width}px, 1fr))`,
        gap: ui.gap,
        transform: `scale(${ui.scale})`,
        animation: `fadeGrid ${fade.duration}ms ${ui.animations.easing}`,
      }}
    >
      <style>{`
        @keyframes fadeGrid {
          from { opacity: ${fade.from}; }
          to { opacity: 1; }
        }
      `}</style>

      {children}
    </div>
  );
}
