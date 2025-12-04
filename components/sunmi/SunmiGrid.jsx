"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";

export default function SunmiGrid({ children, className = "", minWidth = 260 }) {
  const { ui } = useUIConfig();
  const { fade } = useSunmiAnimation();

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
        gap: ui.gap,
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
