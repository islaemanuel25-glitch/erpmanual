"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { SUNMI_THEMES } from "@/lib/sunmiThemes";

export default function AparienciaPage() {
  const { themeKey, setThemeKey } = useSunmiTheme();

  return (
    <div className="max-w-5xl mx-auto">
      <SunmiHeader
        title="Apariencia del ERP"
        subtitle="Elegí el theme visual. No se toca la lógica, solo la estética."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.values(SUNMI_THEMES).map((t) => (
          <SunmiCard
            key={t.key}
            className={`flex flex-col justify-between gap-3 ${
              themeKey === t.key ? "ring-2 ring-amber-400" : ""
            }`}
          >
            <div>
              <h2 className="text-sm font-semibold mb-1">{t.label}</h2>
              <p className="text-xs text-slate-400 mb-3">
                Vista rápida (colores, tarjetas, badges).
              </p>

              <div className="rounded-xl border border-dashed border-slate-700 p-3 text-xs">
                <div className={`mb-2 rounded-lg border px-2 py-1 ${t.header.bg} ${t.header.border}`}>
                  <div className={t.header.text}>Header ejemplo</div>
                </div>
                <div className={`rounded-lg px-2 py-2 text-xs ${t.card}`}>
                  Card ejemplo
                </div>
                <div className="mt-2 flex gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${t.badgeActivo}`}>
                    Activo
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${t.badgeInactivo}`}>
                    Inactivo
                  </span>
                </div>
              </div>
            </div>

            <SunmiButton
              onClick={() => setThemeKey(t.key)}
              variant={themeKey === t.key ? "primary" : "ghost"}
            >
              {themeKey === t.key ? "Theme aplicado" : "Aplicar theme"}
            </SunmiButton>
          </SunmiCard>
        ))}
      </div>
    </div>
  );
}
