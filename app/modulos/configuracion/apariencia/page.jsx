"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import LayoutPreview from "@/components/layout/LayoutPreview";

import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import { SUNMI_THEMES } from "@/lib/sunmiThemes";

export default function AparienciaPage() {
  const { themeKey, setThemeKey, layoutMode, setLayoutMode } = useSunmiTheme();
  const { ui, updateUIConfig } = useUIConfig();

  const cambio = (prop, val) => {
    updateUIConfig({ [prop]: val });
  };

  return (
    <div className="max-w-6xl mx-auto">

      {/* ============================ HEADER ============================ */}
      <SunmiHeader
        title="Apariencia del ERP"
        subtitle="Elegí layout, theme y configuración visual."
      />

      {/* ============================ LAYOUT SELECTOR ============================ */}
      <h2 className="text-lg font-semibold mt-4 mb-2">Diseño del Layout</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* LEFT */}
        <div>
          <LayoutPreview type="left" active={layoutMode === "sidebar-left"} />
          <SunmiButton
            className="mt-2 w-full"
            onClick={() => setLayoutMode("sidebar-left")}
          >
            Sidebar Izquierda
          </SunmiButton>
        </div>

        {/* TOP */}
        <div>
          <LayoutPreview type="top" active={layoutMode === "sidebar-top"} />
          <SunmiButton
            className="mt-2 w-full"
            onClick={() => setLayoutMode("sidebar-top")}
          >
            Barra Superior
          </SunmiButton>
        </div>

        {/* HIDDEN */}
        <div>
          <LayoutPreview type="hidden" active={layoutMode === "sidebar-hidden"} />
          <SunmiButton
            className="mt-2 w-full"
            onClick={() => setLayoutMode("sidebar-hidden")}
          >
            Sin Sidebar
          </SunmiButton>
        </div>
      </div>

      {/* ============================ THEME SELECTOR ============================ */}
      <h2 className="text-lg font-semibold mt-8 mb-2">Themes Visuales</h2>

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
              <p className="text-xs text-slate-400 mb-3">Vista rápida.</p>

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
            >
              {themeKey === t.key ? "Theme aplicado" : "Aplicar theme"}
            </SunmiButton>
          </SunmiCard>
        ))}
      </div>

      {/* ================================================================
          🔥 NUEVA SECCIÓN: CONFIGURACIÓN AVANZADA DE UI
      ================================================================ */}
      <h2 className="text-lg font-semibold mt-8 mb-2">Configuración Avanzada</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Tamaño de letra */}
        <div>
          <SunmiSeparator label="Tamaño de letra" />
          <SunmiSelect
            value={ui.fontSize}
            onChange={(v) => cambio("fontSize", v)}
            options={[
              { label: "XS", value: "xs" },
              { label: "SM", value: "sm" },
              { label: "MD", value: "md" },
              { label: "LG", value: "lg" },
            ]}
          />
        </div>

        {/* Spacing */}
        <div>
          <SunmiSeparator label="Espaciado global" />
          <SunmiSelect
            value={ui.spacing}
            onChange={(v) => cambio("spacing", v)}
            options={[
              { label: "XS", value: "xs" },
              { label: "SM", value: "sm" },
              { label: "MD", value: "md" },
              { label: "LG", value: "lg" },
            ]}
          />
        </div>

        {/* Densidad */}
        <div>
          <SunmiSeparator label="Densidad" />
          <SunmiSelect
            value={ui.density}
            onChange={(v) => cambio("density", v)}
            options={[
              { label: "Compacta", value: "compact" },
              { label: "Cómoda", value: "comfortable" },
              { label: "Espaciosa", value: "spacious" },
            ]}
          />
        </div>

        {/* Escala */}
        <div>
          <SunmiSeparator label="Escala global" />
          <SunmiSelect
            value={ui.scale}
            onChange={(v) => cambio("scale", Number(v))}
            options={[
              { label: "90%", value: 0.9 },
              { label: "100%", value: 1 },
              { label: "110%", value: 1.1 },
            ]}
          />
        </div>

      </div>
    </div>
  );
}
