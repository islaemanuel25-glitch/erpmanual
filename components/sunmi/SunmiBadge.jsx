"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiBadgeEstado({ estado }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const activo =
    estado === true ||
    estado === 1 ||
    estado === "1" ||
    estado === "activo" ||
    estado === "Activo";

  const label = activo ? "Activo" : "Inactivo";

  return (
    <span
      className={`
        rounded-full 
        font-semibold
        ${activo ? theme.badgeActivo : theme.badgeInactivo}
      `}
      style={{
        padding: `${ui.gap} ${ui.gap}`,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
      }}
    >
      {label}
    </span>
  );
}
