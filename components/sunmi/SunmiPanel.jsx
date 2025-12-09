"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiPanel({
  children,
  className = "",
  noPadding = false,
}) {
  const { ui } = useUIConfig();
  
  return (
    <div
      className={className}
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
        borderRadius: ui.helpers.radius("xl"),
        color: "var(--sunmi-card-text)",
        ...(noPadding ? {} : { padding: ui.helpers.spacing("lg") }),
      }}
    >
      {children}
    </div>
  );
}
