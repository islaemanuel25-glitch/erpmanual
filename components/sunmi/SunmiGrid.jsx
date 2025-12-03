"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiGrid({
  children,
  className = "",
  minWidth = 260,
  gap = 16,
}) {
  const { ui } = useUIConfig();

  const style = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
    gap: ui.gap,
    transform: `scale(${ui.scale})`,
  };

  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
