"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiUserCell({ nombre = "", email = "", color = "amber" }) {
  const { ui } = useUIConfig();
  const inicial = nombre?.[0]?.toUpperCase() ?? "?";

  // Usar color del header para el avatar (amber o cyan según theme)
  const avatarBg = color === "cyan" ? "#22d3ee" : "#fbbf24"; // cyan-400 : amber-400

  const avatarSize = parseInt(ui.helpers.icon(2));

  return (
    <div
      className="flex items-center"
      style={{
        gap: ui.helpers.spacing("sm"),
      }}
    >
      <div
        className="rounded-full flex items-center justify-center font-bold"
        style={{
          backgroundColor: avatarBg,
          color: "#0f172a", // slate-900
          width: avatarSize,
          height: avatarSize,
          fontSize: ui.helpers.font("sm"),
        }}
      >
        {inicial}
      </div>

      <div className="flex flex-col">
        <span
          className="font-medium"
          style={{
            color: "var(--sunmi-text)",
            fontSize: ui.helpers.font("sm"),
          }}
        >
          {nombre || "Sin nombre"}
        </span>
        <span
          style={{
            color: "#94a3b8", // slate-400
            fontSize: ui.helpers.font("xs"),
          }}
        >
          {email || "Sin email"}
        </span>
      </div>
    </div>
  );
}
