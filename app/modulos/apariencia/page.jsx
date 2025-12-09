"use client";

import Link from "next/link";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useSidebarConfig } from "@/components/providers/SidebarConfigProvider";

// ===============================
// Opciones predefinidas del sistema (12 niveles técnicos)
// ===============================

const TAMAÑO_PRESETS = [
  "super_mini",
  "ultra_mini",
  "mini",
  "mini_mas",
  "chico",
  "chico_mas",
  "normal",
  "normal_mas",
  "grande",
  "grande_mas",
  "extra_grande",
  "maximo",
].map((key) => ({
  key,
  label: key.replace("_", " "),
}));

// ===============================
// FASE 5 — PRESETS VISUALES (macro por uso)
// ===============================

const VISUAL_PRESETS = [
  {
    key: "compact",
    label: "Compacto",
    tamanoNivel: "super_mini",
    description: "Vista muy densa para pantallas chicas o power users.",
    hint: "Más filas en pantalla, todo más chico.",
  },
  {
    key: "comfortable",
    label: "Comfortable",
    tamanoNivel: "normal",
    description: "Equilibrio entre densidad y legibilidad para uso diario.",
    hint: "Recomendado para desktop estándar.",
  },
  {
    key: "spacious",
    label: "Espacioso",
    tamanoNivel: "grande",
    description: "Más aire entre elementos para pantallas grandes.",
    hint: "Ideal para monitores amplios.",
  },
  {
    key: "sunmi_mobile",
    label: "Sunmi Mobile",
    tamanoNivel: "chico_mas",
    description: "Pensado para dispositivos handheld tipo Sunmi.",
    hint: "Controles un poco más grandes sin exagerar.",
  },
  {
    key: "desktop_wide",
    label: "Desktop Wide",
    tamanoNivel: "extra_grande",
    description: "Interfaz grande, cómoda para ver desde lejos.",
    hint: "Buena opción para pantallas 24\"+.",
  },
  {
    key: "handheld_pos",
    label: "Handheld / POS",
    tamanoNivel: "maximo",
    description: "Modo terminal: controles grandes para toque rápido.",
    hint: "Botones grandes y padding generoso.",
  },
];


// OJO: esto debe coincidir con tus keys reales de SUNMI_THEMES
const THEME_OPTIONS = [
  { key: "sunmiDark", label: "Sunmi Dark" },
  { key: "sunmiDarkCompact", label: "Sunmi Dark Compact" },
  { key: "sunmiLight", label: "Sunmi Light" },
];

export default function AparienciaPage() {
  const { ui, tamanoNivel, setTamanoNivel } = useUIConfig();
  const { themeKey, setThemeKey, theme } = useSunmiTheme();

  const { sidebarMode, setSidebarMode, sidebarGroup, setSidebarGroup } =
    useSidebarConfig();

  const handleSelectTamano = (key) => setTamanoNivel(key);
  const handleSelectTheme = (key) => setThemeKey(key);
  const handleSelectSidebarMode = (mode) => setSidebarMode(mode);
  const handleSelectSidebarGroup = (group) => setSidebarGroup(group);

  const activeVisualPresetKey =
    VISUAL_PRESETS.find((vp) => vp.tamanoNivel === tamanoNivel)?.key ?? null;

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Apariencia del sistema"
          subtitle="Configurá tamaño, presets visuales, layout y theme de la interfaz Sunmi."
          color="amber"
        />

        {/* ================= TAMAÑO (12 NIVELES TÉCNICOS) ================= */}
        <SunmiSeparator label="Tamaño del sistema (niveles técnicos)" color="amber" />

        <p className="text-xs mb-3 opacity-80">
          Niveles finos de tamaño del sistema Sunmi V3. Útil si querés afinar
          al detalle el tamaño de todo el ERP.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {TAMAÑO_PRESETS.map((preset) => {
            const isActive = preset.key === tamanoNivel;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => handleSelectTamano(preset.key)}
                className={`text-left rounded-lg border p-2 transition ${
                  isActive
                    ? "border-amber-400 ring-2 ring-amber-300/60"
                    : "border-slate-700 hover:border-amber-300/60"
                }`}
              >
                <div className="text-[11px] uppercase opacity-70 mb-1">
                  Tamaño
                </div>
                <div className="font-semibold text-sm mb-1">
                  {preset.label}
                </div>

                {/* Mini preview visual sin usar <button> ni <input> reales */}
                <div className="space-y-1 mt-1">
                  <div className="px-3 py-2 rounded-md bg-amber-500/20 text-amber-300 text-xs text-center">
                    Botón
                  </div>
                  <div className="px-3 py-2 rounded-md bg-slate-800 text-slate-400 text-xs">
                    Campo de ejemplo
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ================= FASE 5 — PRESETS VISUALES GLOBALES ================= */}
        <SunmiSeparator label="Presets visuales globales (FASE 5)" color="amber" />

        <p className="text-xs mb-3 opacity-80">
          Presets pensados para casos de uso reales: compactar la UI, hacerla
          más espaciosa, optimizar para Sunmi Mobile o para terminal POS. Cada
          preset aplica uno de los 12 niveles técnicos de tamaño.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {VISUAL_PRESETS.map((preset) => {
            const isActive = preset.tamanoNivel === tamanoNivel;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => handleSelectTamano(preset.tamanoNivel)}
                className={`text-left rounded-lg border p-2 transition ${
                  isActive
                    ? "border-emerald-400 ring-2 ring-emerald-300/60"
                    : "border-slate-700 hover:border-emerald-300/60"
                }`}
              >
                <div className="text-[11px] uppercase opacity-70 mb-1">
                  Preset visual
                </div>
                <div className="font-semibold text-sm mb-1">
                  {preset.label}
                </div>
                <div className="text-[11px] opacity-80 mb-1">
                  {preset.description}
                </div>
                <div className="text-[10px] text-emerald-300/90 mb-2">
                  {preset.hint}
                </div>

                {/* Mini preview esquemático de densidad */}
                <div className="border border-slate-700 rounded-md overflow-hidden text-[10px] p-2">
                  <div className="flex flex-col gap-1">
                    <div className="h-2 rounded bg-emerald-400/60" />
                    <div className="h-2 rounded bg-slate-700/60" />
                    <div className="h-2 rounded bg-slate-700/60" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ================= SIDEBAR MODE ================= */}
        <SunmiSeparator label="Modo del sidebar" color="amber" />

        <p className="text-xs mb-3 opacity-80">
          Elegí si el sidebar muestra solo iconos o iconos con texto.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {[
            {
              id: "icons",
              label: "Solo iconos",
              description: "Sidebar compacto con iconos únicamente.",
            },
            {
              id: "icons-text",
              label: "Iconos + texto",
              description: "Sidebar expandido con iconos y nombres.",
            },
          ].map((opt) => {
            const isActive = opt.id === sidebarMode;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectSidebarMode(opt.id)}
                className={`text-left rounded-lg border p-2 transition ${
                  isActive
                    ? "border-amber-400 ring-2 ring-amber-300/60"
                    : "border-slate-700 hover:border-amber-300/60"
                }`}
              >
                <div className="text-[11px] uppercase opacity-70 mb-1">
                  Modo
                </div>
                <div className="font-semibold text-sm mb-1">
                  {opt.label}
                </div>
                <div className="text-[11px] opacity-80 mb-2">
                  {opt.description}
                </div>

                {/* Preview esquemático */}
                <div className="border border-slate-700 rounded-md overflow-hidden text-[10px] p-2">
                  {opt.id === "icons" && (
                    <div className="flex flex-col gap-1 h-12">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-4 h-4 bg-amber-500 rounded" />
                        <div className="w-4 h-4 bg-slate-700 rounded" />
                        <div className="w-4 h-4 bg-slate-700 rounded" />
                      </div>
                    </div>
                  )}
                  {opt.id === "icons-text" && (
                    <div className="flex flex-col gap-1 h-12">
                      <div className="flex items-center gap-2 px-2">
                        <div className="w-4 h-4 bg-amber-500 rounded" />
                        <div className="h-2 bg-amber-500/50 rounded flex-1" />
                      </div>
                      <div className="flex items-center gap-2 px-2">
                        <div className="w-4 h-4 bg-slate-700 rounded" />
                        <div className="h-2 bg-slate-700/50 rounded flex-1" />
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* ================= SIDEBAR GROUP ================= */}
        <SunmiSeparator label="Agrupación del menú" color="amber" />

        <p className="text-xs mb-3 opacity-80">
          Elegí si el menú se muestra agrupado por secciones o como lista plana.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {[
            {
              id: "flat",
              label: "Lista plana",
              description: "Todos los items en una lista simple.",
            },
            {
              id: "grouped",
              label: "Agrupado",
              description: "Items organizados por secciones.",
            },
          ].map((opt) => {
            const isActive = opt.id === sidebarGroup;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectSidebarGroup(opt.id)}
                className={`text-left rounded-lg border p-2 transition ${
                  isActive
                    ? "border-amber-400 ring-2 ring-amber-300/60"
                    : "border-slate-700 hover:border-amber-300/60"
                }`}
              >
                <div className="text-[11px] uppercase opacity-70 mb-1">
                  Agrupación
                </div>
                <div className="font-semibold text-sm mb-1">
                  {opt.label}
                </div>
                <div className="text-[11px] opacity-80 mb-2">
                  {opt.description}
                </div>

                {/* Preview esquemático */}
                <div className="border border-slate-700 rounded-md overflow-hidden text-[10px] p-2">
                  {opt.id === "flat" && (
                    <div className="flex flex-col gap-1">
                      <div className="h-2 bg-amber-500/50 rounded" />
                      <div className="h-2 bg-slate-700/50 rounded" />
                      <div className="h-2 bg-slate-700/50 rounded" />
                      <div className="h-2 bg-slate-700/50 rounded" />
                    </div>
                  )}
                  {opt.id === "grouped" && (
                    <div className="flex flex-col gap-2">
                      <div>
                        <div className="h-1 bg-slate-600 rounded mb-1" />
                        <div className="h-2 bg-amber-500/50 rounded ml-2" />
                        <div className="h-2 bg-slate-700/50 rounded ml-2" />
                      </div>
                      <div>
                        <div className="h-1 bg-slate-600 rounded mb-1" />
                        <div className="h-2 bg-slate-700/50 rounded ml-2" />
                        <div className="h-2 bg-slate-700/50 rounded ml-2" />
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* ================= THEME ================= */}
        <SunmiSeparator label="Theme de colores" color="amber" />

        <p className="text-xs mb-3 opacity-80">
          Los themes son paletas predefinidas. El usuario solo elige un theme,
          no edita colores manualmente en esta pantalla.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {THEME_OPTIONS.map((opt) => {
            const isActive = opt.key === themeKey;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSelectTheme(opt.key)}
                className={`text-left rounded-lg border p-2 transition ${
                  isActive
                    ? "border-amber-400 ring-2 ring-amber-300/60"
                    : "border-slate-700 hover-border-amber-300/60"
                }`}
              >
                <div className="text-[11px] uppercase opacity-70 mb-1">
                  Theme
                </div>
                <div className="font-semibold text-sm mb-2">
                  {opt.label}
                </div>

                {/* Preview basado en el theme actual */}
                <div className="flex h-10 rounded overflow-hidden border border-slate-800">
                  <div className={`${theme?.sidebar?.bg ?? ""} flex-1`} />
                  <div className={`${theme?.header?.bg ?? ""} flex-1`} />
                </div>
              </button>
            );
          })}
        </div>

        {/* ================= THEME EDITOR AVANZADO ================= */}
        <SunmiSeparator label="Theme Editor avanzado" color="amber" />

        <p className="text-xs mb-3 opacity-80">
          Para personalizar colores por cliente, exportar/importar themes y
          trabajar con overrides visuales, usá el editor avanzado.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Link href="/modulos/apariencia/editor">
            <SunmiButton variant="primary">
              Abrir Theme Editor avanzado
            </SunmiButton>
          </Link>
          <span className="text-[11px] text-slate-400">
            Se abre en una página dedicada con preview y herramientas de JSON.
          </span>
        </div>

        {/* ================= LAYOUT BUILDER VISUAL ================= */}
        <SunmiSeparator label="Layout Builder visual" color="amber" />

        <p className="text-xs mb-3 opacity-80">
          Usá el Layout Builder para definir cómo se estructura el ERP a nivel sidebar,
          navbar y ancho de contenido. Los cambios se aplican directamente al ERP.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <a href="/modulos/apariencia/layout-builder">
            <SunmiButton variant="secondary">
              Abrir Layout Builder
            </SunmiButton>
          </a>
        </div>
      </SunmiCard>
    </div>
  );
}
