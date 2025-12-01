"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiBadgeEstado({ estado }) {
  const { theme } = useSunmiTheme();
  
  // ACEPTA CUALQUIER FORMA — lo normalizamos acá
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
        px-2 py-0.5 
        rounded-full 
        text-[11px] 
        font-semibold
        ${activo ? theme.badgeActivo : theme.badgeInactivo}
      `}
    >
      {label}
    </span>
  );
}
