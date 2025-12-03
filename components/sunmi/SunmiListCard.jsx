"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiListCard({ children, className = "" }) {
  const { ui } = useUIConfig();

  return (
    <div
      className={`flex flex-col ${className}`}
      style={{
        gap: ui.gap,
        transform: `scale(${ui.scale})`,
      }}
    >
      {children}
    </div>
  );
}
