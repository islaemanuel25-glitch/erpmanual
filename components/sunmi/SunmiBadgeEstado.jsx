"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiBadgeEstado({ value }) {
  const { ui } = useUIConfig();
  
  // Normalizar valor para detectar estado activo
  const isActive =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "activo" ||
    value === "Activo";

  const label = isActive ? "Activo" : "Inactivo";

  return (
    <span
      style={{
        backgroundColor: isActive ? "var(--sunmi-badge-activo-bg)" : "var(--sunmi-badge-inactivo-bg)",
        color: isActive ? "var(--sunmi-badge-activo-text)" : "var(--sunmi-badge-inactivo-text)",
        paddingLeft: ui.helpers.spacing("sm"),
        paddingRight: ui.helpers.spacing("sm"),
        paddingTop: ui.helpers.spacing("xs"),
        paddingBottom: ui.helpers.spacing("xs"),
        borderRadius: ui.helpers.radius("md"),
        fontSize: ui.helpers.font("xs"),
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}
