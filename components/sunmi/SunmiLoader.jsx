"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiLoader({ size = 20, color = "amber" }) {
  const { ui } = useUIConfig();
  
  const loaderSize = size || parseInt(ui.helpers.icon(1.25));
  const spinnerColor = color === "cyan" ? "#22d3ee" : "#fbbf24"; // cyan-400 : amber-400
  
  return (
    <div
      className="flex justify-center"
      style={{
        paddingTop: ui.helpers.spacing("sm"),
        paddingBottom: ui.helpers.spacing("sm"),
      }}
    >
      <div
        className="animate-spin rounded-full"
        style={{
          width: loaderSize,
          height: loaderSize,
          borderWidth: ui.helpers.line(),
          borderColor: "var(--sunmi-card-border)",
          borderTopColor: spinnerColor,
        }}
      />
    </div>
  );
}
