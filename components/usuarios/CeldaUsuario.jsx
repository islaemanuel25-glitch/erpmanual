"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function CeldaUsuario({ nombre = "", email = "" }) {
  const { ui } = useUIConfig();
  const inicial = nombre?.[0]?.toUpperCase() ?? "?";
  const avatarSize = parseInt(ui.helpers.controlHeight());

  return (
    <div
      className="flex items-center"
      style={{
        gap: ui.helpers.spacing("sm"),
      }}
    >
      <div
        className="rounded-full bg-amber-400 text-slate-900 flex items-center justify-center font-bold"
        style={{
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
            fontSize: ui.helpers.font("sm"),
          }}
        >
          {nombre || "Sin nombre"}
        </span>
        <span
          className="text-slate-400"
          style={{
            fontSize: ui.helpers.font("xs"),
          }}
        >
          {email || "Sin email"}
        </span>
      </div>
    </div>
  );
}
