"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";

export default function SunmiRow({
  left,
  right,
  center = null,
  align = "center",
  className = "",
}) {
  const { ui } = useUIConfig();
  const { fade, hover } = useSunmiAnimation();

  const alignCls =
    align === "start"
      ? "items-start"
      : align === "end"
      ? "items-end"
      : "items-center";

  return (
    <div
      className={`flex ${alignCls} justify-between ${className}`}
      style={{
        gap: ui.gap,
        paddingTop: ui.gap,
        paddingBottom: ui.gap,
        transform: `scale(${ui.scale})`,
        animation: `rowFade ${fade.duration}ms ease`,
        transitionDuration: `${hover.duration}ms`,
        transitionTimingFunction: hover.easing,
      }}
    >
      <style>
        {`
        @keyframes rowFade {
          from { opacity: ${fade.from}; }
          to { opacity: 1; }
        }
        `}
      </style>

      <div className="flex-1 min-w-0">{left}</div>

      {center && <div className="flex-1 min-w-0 text-center">{center}</div>}

      {right && (
        <div className="shrink-0 flex items-center" style={{ gap: ui.gap }}>
          {right}
        </div>
      )}
    </div>
  );
}
