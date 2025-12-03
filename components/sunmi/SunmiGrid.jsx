"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiGrid({
  children,
  className = "",
}) {
  const { ui } = useUIConfig();

  const style = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${ui.density.cardMinWidth}px, 1fr))`,
    gap: ui.spacing.md,
    transform: `scale(${ui.scale})`,
  };

  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
