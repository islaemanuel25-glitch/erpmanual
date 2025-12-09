"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiListCardItem({
  children,
  className = "",
}) {
  const { ui } = useUIConfig();
  
  return (
    <div
      className={`flex items-center justify-between relative ${className}`}
      style={{
        paddingTop: ui.helpers.spacing("sm"),
        paddingBottom: ui.helpers.spacing("sm"),
      }}
    >
      {/* Separador soft Sunmi → super leve, theme-friendly */}
      <div
        className="absolute left-0 right-0"
        style={{
          backgroundColor: "var(--sunmi-card-border)",
          opacity: 0.2,
          bottom: `-${ui.helpers.line()}`,
          height: ui.helpers.line(),
        }}
      />

      {/* Contenido */}
      <div className="flex-1 truncate">
        {children}
      </div>
    </div>
  );
}
