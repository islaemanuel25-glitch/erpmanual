"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiInput({ className = "", ...props }) {
  const { ui } = useUIConfig();
  
  return (
    <input
      {...props}
      className={`w-full placeholder-slate-500 border outline-none transition ${className}`}
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        color: "var(--sunmi-text)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
        paddingLeft: ui.helpers.spacing("sm"),
        paddingRight: ui.helpers.spacing("sm"),
        paddingTop: ui.helpers.spacing("sm"),
        paddingBottom: ui.helpers.spacing("sm"),
        borderRadius: ui.helpers.radius("md"),
        fontSize: ui.helpers.font("sm"),
      }}
      onFocus={(e) => {
        e.target.style.borderColor = "#fbbf24"; // amber-400
      }}
      onBlur={(e) => {
        e.target.style.borderColor = "var(--sunmi-card-border)";
      }}
    />
  );
}
