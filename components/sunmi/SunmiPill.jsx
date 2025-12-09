"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiPill({ children, color = "amber" }) {
  const { ui } = useUIConfig();
  
  // Usar color del header para el pill (amber o cyan según el theme)
  const pillBg = color === "cyan" ? "#22d3ee" : "#fbbf24"; // cyan-400 : amber-400
  
  return (
    <span
      className="inline-block font-semibold leading-none whitespace-nowrap"
      style={{
        backgroundColor: pillBg,
        color: "#0f172a", // slate-900
        paddingLeft: ui.helpers.spacing("sm"),
        paddingRight: ui.helpers.spacing("sm"),
        paddingTop: ui.helpers.spacing("xs"),
        paddingBottom: ui.helpers.spacing("xs"),
        borderRadius: ui.helpers.radius("md"),
        fontSize: ui.helpers.font("xs"),
      }}
    >
      {children}
    </span>
  );
}
