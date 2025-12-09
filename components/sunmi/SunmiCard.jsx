"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiCard({ children, className = "" }) {
  const { ui } = useUIConfig();
  
  return (
    <div
      className={`shadow-md backdrop-blur-sm ${className}`}
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
        borderRadius: ui.helpers.radius("xl"),
        padding: ui.helpers.spacing("md"),
        color: "var(--sunmi-card-text)",
      }}
    >
      {children}
    </div>
  );
}
