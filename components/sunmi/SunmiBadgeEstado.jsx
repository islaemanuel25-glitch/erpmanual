"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiBadgeEstado({ value }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();

  const isActive =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "activo" ||
    value === "Activo";

  const data = isActive
    ? { label: "Activo", class: theme.badgeActivo }
    : { label: "Inactivo", class: theme.badgeInactivo };

  return (
    <span
      className={`
        font-semibold
        leading-none
        ${data.class}
      `}
      style={{
        padding: `${ui.spacing.xs} ${ui.spacing.sm}`,
        borderRadius: ui.rounded.sm,
        fontSize: ui.font.base * ui.font.scaleSm,
        lineHeight: ui.font.lineHeight,
        transform: `scale(${ui.scale})`,
      }}
    >
      {data.label}
    </span>
  );
}
