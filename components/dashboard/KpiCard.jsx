"use client";

import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

const COLOR_ICON = {
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  orange: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  purple: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

export default function KpiCard({
  titulo,
  valor,
  icono: Icono,
  sufijo = "",
  variacion,
  color = "blue",
}) {
  const { theme } = useSunmiTheme();
  const iconBg = COLOR_ICON[color] || COLOR_ICON.blue;

  return (
    <div
      className={`
        ${theme.card}
        rounded-xl px-4 py-3
        flex items-center gap-3
        shadow-sm
      `}
    >
      {Icono && (
        <div
          className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}
        >
          <Icono size={20} strokeWidth={2} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold truncate leading-tight">{valor}</p>
        <p className="text-[11px] uppercase tracking-wider font-medium sunmi-text-muted truncate mt-0.5">
          {titulo}
        </p>
      </div>
      {variacion != null && (
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none shrink-0"
          style={
            variacion >= 0
              ? {
                  background: "color-mix(in srgb, var(--pos-success) 15%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--pos-success) 30%, transparent)",
                  color: "var(--pos-success)",
                }
              : {
                  background: "color-mix(in srgb, var(--pos-danger) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--pos-danger) 30%, transparent)",
                  color: "var(--pos-danger)",
                }
          }
        >
          {variacion >= 0 ? "+" : ""}
          {variacion}%
        </span>
      )}
      {variacion == null && (
        <span className="text-[10px] font-semibold sunmi-text-muted shrink-0">0%</span>
      )}
    </div>
  );
}
