"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function Separador({ label, icon = "◆" }) {
  const { ui } = useUIConfig();
  const text = label.toLowerCase();

  const esSugeridos = text.includes("suger");
  const esPreparados = text.includes("prepar");

  const color = esSugeridos
    ? "#FACC15" // AMARILLO
    : esPreparados
    ? "#22D3EE" // CELESTE
    : "#22D3EE"; // default

  return (
    <div
      className="select-none"
      style={{
        marginTop: ui.helpers.spacing("lg"),
        marginBottom: ui.helpers.spacing("lg"),
      }}
    >
      {/* LABEL + ICONO */}
      <div
        className="flex items-center"
        style={{
          gap: ui.helpers.spacing("sm"),
          marginBottom: ui.helpers.spacing("xs"),
          paddingLeft: ui.helpers.spacing("xs"),
          paddingRight: ui.helpers.spacing("xs"),
        }}
      >
        <span
          className="font-bold drop-shadow"
          style={{
            color,
            fontSize: ui.helpers.font("xs"),
          }}
        >
          {icon}
        </span>

        <span
          className="uppercase tracking-wider font-semibold drop-shadow"
          style={{
            color,
            fontSize: ui.helpers.font("xs"),
          }}
        >
          {label}
        </span>
      </div>

      {/* LINEA */}
      <div
        className="relative w-full"
        style={{
          height: parseInt(ui.helpers.spacing("xs")) * 0.75,
        }}
      >
        <div
          className="absolute inset-0 rounded-full shadow"
          style={{
            backgroundColor: color + "99",
            boxShadow: `0 0 ${parseInt(ui.helpers.spacing("xs")) * 1.5}px ${color}66`,
          }}
        />

        <div
          className="absolute top-0"
          style={{
            left: parseInt(ui.helpers.spacing("lg")) * 1.5,
            right: parseInt(ui.helpers.spacing("lg")) * 1.5,
            top: parseInt(ui.helpers.spacing("xs")) * 0.25,
            height: parseInt(ui.helpers.spacing("xs")) * 0.25,
            backgroundColor: color + "55",
          }}
        />
      </div>
    </div>
  );
}
