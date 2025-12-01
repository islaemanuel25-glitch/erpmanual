"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiBadgeEstado({ value }) {
  const { theme } = useSunmiTheme();
  
  // Normalizar valor para detectar estado activo
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
        px-1.5 py-[1px]
        rounded-md
        text-[10.5px]
        font-semibold
        leading-none
        ${data.class}
      `}
    >
      {data.label}
    </span>
  );
}
