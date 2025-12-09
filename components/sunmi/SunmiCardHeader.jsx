"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiCardHeader({
  title = "",
  children, // botones opcionales
}) {
  const { ui } = useUIConfig();
  
  return (
    <div
      className="flex items-center justify-between"
      style={{
        marginBottom: ui.helpers.spacing("md"),
        paddingLeft: ui.helpers.spacing("xs"),
        paddingRight: ui.helpers.spacing("xs"),
      }}
    >
      <h2
        className="font-semibold tracking-wide"
        style={{
          color: "var(--sunmi-text)",
          fontSize: ui.helpers.font("base"),
        }}
      >
        {title}
      </h2>

      <div
        className="flex items-center"
        style={{
          gap: ui.helpers.spacing("sm"),
        }}
      >
        {children}
      </div>
    </div>
  );
}
