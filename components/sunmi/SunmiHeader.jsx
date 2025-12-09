"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiHeader({ title, color = "amber", children }) {
  const { ui } = useUIConfig();
  
  return (
    <div
      className="uppercase shadow-md border font-bold tracking-wide"
      style={{
        background: "var(--sunmi-header-bg)",
        borderColor: "var(--sunmi-header-border)",
        borderWidth: "1px",
        color: "var(--sunmi-header-text)",
        borderRadius: ui.helpers.radius("xl"),
        paddingLeft: ui.helpers.spacing("lg"),
        paddingRight: ui.helpers.spacing("lg"),
        paddingTop: ui.helpers.spacing("sm"),
        paddingBottom: ui.helpers.spacing("sm"),
        marginBottom: ui.helpers.spacing("sm"),
        fontSize: ui.helpers.font("sm"),
      }}
    >
      {title}
      {children}
    </div>
  );
}
