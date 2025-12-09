// components/pos-transferencias/nueva/ResumenPreparados.jsx
"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function ResumenPreparados({ total }) {
  const { ui } = useUIConfig();
  
  return (
    <div
      className="border shadow-sm flex justify-between"
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
        borderRadius: ui.helpers.radius("md"),
        padding: ui.helpers.spacing("md"),
        fontSize: ui.helpers.font("sm"),
        color: "var(--sunmi-text)",
      }}
    >
      <span>
        Productos preparados: <strong>{total}</strong>
      </span>

      <span
        style={{
          color: "var(--sunmi-text)",
          opacity: 0.6,
        }}
      >
        (Se envían solo los productos preparados)
      </span>
    </div>
  );
}
