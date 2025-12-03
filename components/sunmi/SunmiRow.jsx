"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiRow({
  left,
  right,
  center = null,
  align = "center",
  className = "",
}) {
  const { ui } = useUIConfig();

  const alignCls =
    align === "start"
      ? "items-start"
      : align === "end"
      ? "items-end"
      : "items-center";

  return (
    <div
      className={`
        flex ${alignCls} justify-between
        ${className}
      `}
      style={{
        gap: ui.gap,
        paddingTop: ui.gap,
        paddingBottom: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      <div className="flex-1 min-w-0">
        {left}
      </div>

      {center && (
        <div className="flex-1 min-w-0 text-center">
          {center}
        </div>
      )}

      {right && (
        <div
          className="shrink-0 flex items-center"
          style={{ gap: ui.gap }}
        >
          {right}
        </div>
      )}
    </div>
  );
}
