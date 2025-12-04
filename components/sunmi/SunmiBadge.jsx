"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiBadge({ children, estado }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const activo =
    estado === true ||
    estado === 1 ||
    estado === "1" ||
    estado === "activo" ||
    estado === "Activo";

  return (
    <span
      className={`
        font-semibold
        ${activo ? theme.badgeActivo : theme.badgeInactivo}
      `}
      style={{
        padding: `${ui.spacing.sm} ${ui.spacing.md}`,
        borderRadius: ui.rounded.sm,
        fontSize: ui.font.base * ui.font.scaleMd,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
      }}
    >
      {children ?? (activo ? "Activo" : "Inactivo")}
    </span>
  );
}
