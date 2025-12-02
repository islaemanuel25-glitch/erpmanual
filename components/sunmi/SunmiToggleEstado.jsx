"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiToggleEstado({
  value = true,
  onChange = () => {},
}) {
  const { theme } = useSunmiTheme();

  const t = theme.toggle;
  const badgeOn = theme.badgeActivo;
  const badgeOff = theme.badgeInactivo;

  // Normalizar valor que puede venir como string/number
  const normalized =
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "activo";

  const toggle = () => onChange(!normalized);

  return (
    <div
      className="flex items-center gap-2 cursor-pointer select-none"
      onClick={toggle}
    >
      {/* TRACK */}
      <div
        className={cn(
          `
          w-10 h-5
          rounded-full
          transition-all
        `,
          normalized ? t.on : t.off
        )}
      >
        {/* THUMB */}
        <div
          className={cn(
            `
            w-5 h-5
            rounded-full
            shadow
            transition-all
          `,
            t.thumb,
            normalized ? "translate-x-5" : "translate-x-0"
          )}
        />
      </div>

      {/* LABEL */}
      <span
        className={cn(
          `
          text-[12px]
        `,
          normalized ? badgeOn.split(" ").find(c => c.startsWith("text-")) 
                     : badgeOff.split(" ").find(c => c.startsWith("text-"))
        )}
      >
        {normalized ? "Habilitado" : "Inactivo"}
      </span>
    </div>
  );
}
