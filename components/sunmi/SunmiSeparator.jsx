"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiSeparator({ label, className = "" }) {
  const { ui } = useUIConfig();
  
  return (
    <div
      className={`flex items-center ${className}`}
      style={{
        color: "#94a3b8", // slate-400
        gap: ui.helpers.spacing("sm"),
        marginTop: ui.helpers.spacing("sm"),
        marginBottom: ui.helpers.spacing("sm"),
        fontSize: ui.helpers.font("xs"),
      }}
    >
      <div
        className="flex-1"
        style={{
          backgroundColor: "var(--sunmi-card-border)",
          opacity: 0.6,
          height: ui.helpers.line(),
        }}
      />
      {label && <span className="whitespace-nowrap">{label}</span>}
      <div
        className="flex-1"
        style={{
          backgroundColor: "var(--sunmi-card-border)",
          opacity: 0.6,
          height: ui.helpers.line(),
        }}
      />
    </div>
  );
}
