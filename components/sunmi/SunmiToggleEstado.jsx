"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiToggleEstado({
  value = true,
  onChange = () => {},
}) {
  const { ui } = useUIConfig();
  
  // Normalizar valor del backend / formulario
  const normalized =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "activo";

  const toggle = () => {
    onChange(!normalized);
  };

  const trackHeight = parseInt(ui.helpers.controlHeight()) * 0.5;
  const thumbSize = trackHeight * 0.9;
  const trackWidth = trackHeight * 2;
  const translateX = normalized ? trackWidth - thumbSize - 2 : 2;

  return (
    <div
      className="flex items-center cursor-pointer select-none"
      onClick={toggle}
      style={{
        gap: ui.helpers.spacing("sm"),
      }}
    >
      {/* Switch */}
      <div
        className="rounded-full transition-all"
        style={{
          backgroundColor: normalized ? "var(--sunmi-badge-activo-bg)" : "#475569", // slate-600
          width: trackWidth,
          height: trackHeight,
        }}
      >
        <div
          className="bg-white rounded-full shadow transform transition-all"
          style={{
            width: thumbSize,
            height: thumbSize,
            transform: `translateX(${translateX}px)`,
          }}
        />
      </div>

      {/* Texto */}
      <span
        style={{
          color: "var(--sunmi-text)",
          fontSize: ui.helpers.font("xs"),
        }}
      >
        {normalized ? "Habilitado" : "Inactivo"}
      </span>
    </div>
  );
}
