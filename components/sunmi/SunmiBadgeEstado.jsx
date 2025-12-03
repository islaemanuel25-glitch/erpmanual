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
        rounded-md
        font-semibold
        leading-none
        ${data.class}
      `}
      style={{
        padding: `${ui.gap} calc(${ui.gap} * 1.2)`,
        fontSize: ui.font.fontSize,
        lineHeight: ui.font.lineHeight,
      }}
    >
      {data.label}
    </span>
  );
}
