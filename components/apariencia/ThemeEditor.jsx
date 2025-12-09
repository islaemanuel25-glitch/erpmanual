"use client";

import { useEffect, useMemo, useState } from "react";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

const CUSTOM_THEME_STORAGE_KEY = "erp-theme-custom";

/**
 * Grupos de variables de theme editables.
 * ⚠ Extensible: si mañana agregás más CSS vars, solo sumás aquí.
 */
const THEME_GROUPS = [
  {
    id: "general",
    label: "General",
    description: "Colores base del fondo y texto principal del ERP.",
    vars: [
      { name: "--sunmi-bg", label: "Fondo general" },
      { name: "--sunmi-text", label: "Texto general" },
    ],
  },
  {
    id: "header",
    label: "Header",
    description: "Barra superior del ERP (background, texto y borde).",
    vars: [
      { name: "--sunmi-header-bg", label: "Fondo header" },
      { name: "--sunmi-header-text", label: "Texto header" },
      { name: "--sunmi-header-border", label: "Borde header" },
    ],
  },
  {
    id: "sidebar",
    label: "Sidebar",
    description: "Menú lateral o superior, según layout.",
    vars: [
      { name: "--sunmi-sidebar-bg", label: "Fondo sidebar" },
      { name: "--sunmi-sidebar-text", label: "Texto sidebar" },
      { name: "--sunmi-sidebar-border", label: "Borde sidebar" },
    ],
  },
  {
    id: "cards",
    label: "Cards",
    description: "Tarjetas y paneles de contenido.",
    vars: [
      { name: "--sunmi-card-bg", label: "Fondo card" },
      { name: "--sunmi-card-border", label: "Borde card" },
      { name: "--sunmi-card-text", label: "Texto card" },
    ],
  },
  {
    id: "table",
    label: "Tablas",
    description: "Encabezados y filas de tablas.",
    vars: [
      { name: "--sunmi-table-header-bg", label: "Header tabla (fondo)" },
      { name: "--sunmi-table-row-bg", label: "Fila tabla (fondo)" },
    ],
  },
  {
    id: "badges",
    label: "Badges",
    description: "Estados activo / inactivo para chips, estados, etiquetas.",
    vars: [
      { name: "--sunmi-badge-activo-bg", label: "Badge ACTIVO fondo" },
      { name: "--sunmi-badge-activo-text", label: "Badge ACTIVO texto" },
      { name: "--sunmi-badge-inactivo-bg", label: "Badge INACTIVO fondo" },
      { name: "--sunmi-badge-inactivo-text", label: "Badge INACTIVO texto" },
    ],
  },
  // ⚠️ FASE 3 decisión B:
  // Panel de Bordes y Sombras preparado para futuro.
  // Hoy no hay CSS vars para esto, así que solo se deja visible como "Próximamente".
];

const ALL_VAR_NAMES = THEME_GROUPS.flatMap((g) => g.vars.map((v) => v.name));

function isValidHex(value) {
  if (!value) return false;
  const v = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

function normalizeColor(value) {
  if (!value) return "#000000";

  const v = value.trim();

  if (isValidHex(v)) return v;

  // rgb(...) o rgba(...)
  const rgbMatch = v.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Si es un gradient u otro valor raro, devolvemos negro como base.
  return "#000000";
}

function applyVars(varsObj) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  Object.entries(varsObj).forEach(([name, value]) => {
    if (typeof value === "string" && value.trim() !== "") {
      root.style.setProperty(name, value);
    }
  });
}

export default function ThemeEditor() {
  const { themeKey, theme } = useSunmiTheme();

  const [values, setValues] = useState({});
  const [overrides, setOverrides] = useState({});
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const exportJson = useMemo(() => {
    const payload = {
      baseThemeKey: themeKey,
      overrides,
    };
    return JSON.stringify(payload, null, 2);
  }, [themeKey, overrides]);

  // Carga inicial de valores y overrides guardados
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    try {
      const computed = getComputedStyle(document.documentElement);
      const initial = {};

      ALL_VAR_NAMES.forEach((name) => {
        let current = computed.getPropertyValue(name)?.trim();
        if (!current && theme?.cssVars?.[name]) {
          current = theme.cssVars[name];
        }
        initial[name] = normalizeColor(current);
      });

      setValues(initial);

      const raw = window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setOverrides(parsed);
        }
      }
    } catch (err) {
      console.error("Error cargando ThemeEditor:", err);
    }
  }, [themeKey, theme]);

  const handleColorChange = (name, newHex) => {
    const value = newHex || "";
    setValues((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (isValidHex(value)) {
      applyVars({ [name]: value });
    }
  };

  const handleHexInputChange = (name, newValue) => {
    setValues((prev) => ({
      ...prev,
      [name]: newValue,
    }));

    if (isValidHex(newValue)) {
      applyVars({ [name]: newValue });
    }
  };

  const handleSaveOverrides = () => {
    try {
      const nextOverrides = {};
      ALL_VAR_NAMES.forEach((name) => {
        const current = values[name];
        const base = theme?.cssVars?.[name];

        if (!current || !isValidHex(current)) return;
        if (base && base.trim().toLowerCase() === current.trim().toLowerCase()) {
          return;
        }
        nextOverrides[name] = current;
      });

      window.localStorage.setItem(
        CUSTOM_THEME_STORAGE_KEY,
        JSON.stringify(nextOverrides)
      );
      setOverrides(nextOverrides);
      setSaveMessage("Theme guardado correctamente.");
      setTimeout(() => setSaveMessage(""), 2000);
    } catch (err) {
      console.error("Error guardando overrides de theme:", err);
      setSaveMessage("Error al guardar theme.");
      setTimeout(() => setSaveMessage(""), 2000);
    }
  };

  const handleResetToBase = () => {
    if (typeof document === "undefined") return;

    try {
      const root = document.documentElement;

      // Limpiar overrides en storage
      window.localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
      setOverrides({});

      // Volver a los valores del theme base
      const nextValues = {};
      ALL_VAR_NAMES.forEach((name) => {
        const base = theme?.cssVars?.[name];
        if (base) {
          root.style.setProperty(name, base);
          nextValues[name] = normalizeColor(base);
        }
      });
      setValues(nextValues);
      setSaveMessage("Theme restaurado al base seleccionado.");
      setTimeout(() => setSaveMessage(""), 2000);
    } catch (err) {
      console.error("Error reseteando theme:", err);
    }
  };

  const handleApplyImport = () => {
    setImportError("");
    try {
      const parsed = JSON.parse(importText);
      let candidate = parsed;

      // Soportar formato { baseThemeKey, overrides }
      if (parsed && typeof parsed === "object" && parsed.overrides) {
        candidate = parsed.overrides;
      }

      if (!candidate || typeof candidate !== "object") {
        setImportError("JSON inválido. Debe ser un objeto de overrides.");
        return;
      }

      const safe = {};
      Object.entries(candidate).forEach(([key, value]) => {
        if (
          typeof key === "string" &&
          key.startsWith("--sunmi-") &&
          typeof value === "string" &&
          isValidHex(value)
        ) {
          safe[key] = value;
        }
      });

      if (Object.keys(safe).length === 0) {
        setImportError(
          "No se encontraron variables --sunmi-* con colores HEX válidos."
        );
        return;
      }

      // Aplicar y guardar
      applyVars(safe);
      window.localStorage.setItem(
        CUSTOM_THEME_STORAGE_KEY,
        JSON.stringify(safe)
      );
      setOverrides(safe);

      setValues((prev) => ({
        ...prev,
        ...safe,
      }));
      setSaveMessage("Theme importado y aplicado.");
      setTimeout(() => setSaveMessage(""), 2000);
    } catch (err) {
      console.error("Error importando JSON de theme:", err);
      setImportError("JSON inválido. Verificá la sintaxis.");
    }
  };

  return (
    <div className="mt-4 space-y-6">
      {/* Layout principal: Editor izquierda, Preview derecha */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)]">
        {/* =======================================
            COLUMNA IZQUIERDA: CONTROLES
        ======================================= */}
        <div className="space-y-5">
          <SunmiSeparator label="Edición de colores" color="amber" />

          <p className="text-xs opacity-80 mb-2">
            Editá los colores del sistema agrupados por sección. Los cambios se
            aplican en vivo al ERP y podés guardar overrides en tu navegador.
          </p>

          <div className="space-y-4">
            {THEME_GROUPS.map((group) => (
              <div
                key={group.id}
                className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-amber-300/90">
                      {group.label}
                    </div>
                    {group.description && (
                      <div className="text-[11px] text-slate-300/80">
                        {group.description}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {group.vars.map((variable) => {
                    const current = values[variable.name] || "#000000";
                    return (
                      <div
                        key={variable.name}
                        className="flex flex-col gap-1 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-100">
                            {variable.label}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {variable.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={isValidHex(current) ? current : "#000000"}
                            onChange={(e) =>
                              handleColorChange(variable.name, e.target.value)
                            }
                            className="h-8 w-10 rounded-md border border-slate-600 bg-slate-900 cursor-pointer"
                          />
                          <div className="flex-1">
                            <SunmiInput
                              value={current}
                              onChange={(e) =>
                                handleHexInputChange(
                                  variable.name,
                                  e.target.value
                                )
                              }
                              className="w-full text-[11px]"
                              placeholder="#rrggbb"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Panel preparado para FASE 3 - Bordes y Sombras */}
            <div className="rounded-lg border border-dashed border-slate-700/80 bg-slate-900/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-300/90 mb-1">
                Bordes y sombras (Próximamente)
              </div>
              <p className="text-[11px] text-slate-400">
                Este panel se activará cuando definamos CSS variables para bordes
                (radius) y sombras de cards, tablas y modales. La idea es
                controlar todo desde UIConfig + variables, sin tocar los
                componentes Sunmi.
              </p>
            </div>
          </div>
        </div>

        {/* =======================================
            COLUMNA DERECHA: PREVIEW + JSON
        ======================================= */}
        <div className="space-y-4">
          <SunmiSeparator label="Preview en vivo" color="amber" />

          <div className="rounded-xl border border-slate-700/80 bg-slate-950/80 overflow-hidden text-[11px]">
            {/* Header preview */}
            <div
              className="h-10 flex items-center justify-between px-3 border-b"
              style={{
                background: "var(--sunmi-header-bg)",
                color: "var(--sunmi-header-text)",
                borderColor: "var(--sunmi-header-border)",
              }}
            >
              <span className="font-semibold">Header</span>
              <span className="opacity-80">Preview</span>
            </div>

            <div className="flex h-40">
              {/* Sidebar preview */}
              <div
                className="w-24 border-r flex flex-col gap-1 p-2"
                style={{
                  backgroundColor: "var(--sunmi-sidebar-bg)",
                  color: "var(--sunmi-sidebar-text)",
                  borderColor: "var(--sunmi-sidebar-border)",
                }}
              >
                <div className="h-3 rounded bg-slate-900/40" />
                <div className="h-3 rounded bg-slate-900/40" />
                <div className="h-3 rounded bg-slate-900/40" />
              </div>

              {/* Content preview */}
              <div
                className="flex-1 p-3 space-y-2"
                style={{
                  backgroundColor: "var(--sunmi-bg)",
                  color: "var(--sunmi-text)",
                }}
              >
                {/* Card preview */}
                <div
                  className="rounded-lg border p-2 space-y-2"
                  style={{
                    backgroundColor: "var(--sunmi-card-bg)",
                    color: "var(--sunmi-card-text)",
                    borderColor: "var(--sunmi-card-border)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11px]">
                      Card de ejemplo
                    </span>
                    <span className="text-[10px] opacity-80">Preview</span>
                  </div>

                  {/* Tabla simple */}
                  <div className="border rounded-md overflow-hidden text-[10px]">
                    <div
                      className="grid grid-cols-3 px-2 py-1 font-medium"
                      style={{
                        backgroundColor: "var(--sunmi-table-header-bg)",
                      }}
                    >
                      <div>Col 1</div>
                      <div>Col 2</div>
                      <div>Col 3</div>
                    </div>
                    <div
                      className="grid grid-cols-3 px-2 py-1"
                      style={{
                        backgroundColor: "var(--sunmi-table-row-bg)",
                      }}
                    >
                      <div>Dato 1</div>
                      <div>Dato 2</div>
                      <div>Dato 3</div>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2 pt-1">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        backgroundColor: "var(--sunmi-badge-activo-bg)",
                        color: "var(--sunmi-badge-activo-text)",
                      }}
                    >
                      Activo
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        backgroundColor: "var(--sunmi-badge-inactivo-bg)",
                        color: "var(--sunmi-badge-inactivo-text)",
                      }}
                    >
                      Inactivo
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Controles de guardado / reset */}
          <div className="flex flex-wrap items-center gap-2">
            <SunmiButton onClick={handleSaveOverrides} variant="primary">
              Guardar theme actual
            </SunmiButton>
            <SunmiButton onClick={handleResetToBase} variant="secondary">
              Restaurar theme base
            </SunmiButton>

            {saveMessage && (
              <span className="text-[11px] text-emerald-400 ml-1">
                {saveMessage}
              </span>
            )}
          </div>

          {/* Export / Import JSON */}
          <SunmiSeparator label="Exportar / Importar JSON" color="amber" />

          <div className="grid gap-3 md:grid-cols-2 text-[11px]">
            {/* Export */}
            <div className="flex flex-col gap-2">
              <div className="font-semibold text-slate-100">
                Exportar theme
              </div>
              <p className="text-slate-400">
                Este JSON contiene el <b>theme base actual</b> y los{" "}
                <b>overrides</b>. Podés copiarlo para usarlo en otro ERP Azul.
              </p>
              <textarea
                className="w-full h-40 rounded-md border border-slate-700/80 bg-slate-950/80 p-2 font-mono text-[10px] resize-none"
                readOnly
                value={exportJson}
              />
            </div>

            {/* Import */}
            <div className="flex flex-col gap-2">
              <div className="font-semibold text-slate-100">
                Importar theme
              </div>
              <p className="text-slate-400">
                Pegá un JSON exportado desde otro ERP. Se aceptan dos formatos:
                <br />
                <code className="font-mono">
                  {"{ baseThemeKey, overrides }"}
                </code>{" "}
                o directamente un objeto de overrides.
              </p>
              <textarea
                className="w-full h-32 rounded-md border border-slate-700/80 bg-slate-950/80 p-2 font-mono text-[10px]"
                placeholder='Ej: { "baseThemeKey": "sunmiDark", "overrides": { "--sunmi-bg": "#000000" } }'
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              {importError && (
                <div className="text-[10px] text-red-400">{importError}</div>
              )}
              <div className="flex gap-2">
                <SunmiButton onClick={handleApplyImport} variant="primary">
                  Aplicar JSON
                </SunmiButton>
                <SunmiButton
                  onClick={() => {
                    setImportText("");
                    setImportError("");
                  }}
                  variant="secondary"
                >
                  Limpiar
                </SunmiButton>
              </div>
            </div>
          </div>

          {/* ============================
              FASE 5 / 6 / 7 (COMENTARIOS)
              ============================ */}

          {/*
            FASE 5 — Presets globales 100% visuales (diseño, no implementado)
            -----------------------------------------------------------------
            Idea: en vez de tocar UIConfig a mano, definir presets tipo:
              - "Compact", "Comfortable", "Spacious"
              - "Sunmi Mobile", "Desktop Wide", "Handheld"

            Cada preset mapearía a un set de claves en UIConfig:
              - ui.density
              - ui.spacing.scale
              - ui.font.scale
              - ui.radius.scale

            El Theme Editor podría tener una sección:
              - "Presets de densidad / escala"
              - Mostrar cards por preset, y al elegir uno, llamar algo como:
                setUIConfigPreset("compact") // que internamente cambia UIConfig

            Esto se implementaría en otro módulo, NO acá,
            pero este editor sería la vista "visual" que muestra el efecto.

            FASE 6 — Future Layout Builder (solo esbozo)
            --------------------------------------------
            Objetivo: permitir:
              - Sidebar izquierda / derecha
              - Sidebar flotante vs fijo
              - Navbar arriba / abajo
              - Modo "card" vs "tabla" para algunas vistas

            Sin romper:
              - LayoutController actual (sidebar-left / sidebar-top / hidden)
              - Estructura de páginas existentes

            Idea:
              - Crear un "LayoutConfig" separado (similar a UIConfig)
              - Layout Builder editaría flags como:
                  layout.sidebarPosition = "left" | "right"
                  layout.sidebarMode = "fixed" | "floating"
                  layout.navbarPosition = "top" | "bottom"
                  layout.viewMode.productos = "cards" | "table"

              - LayoutController respetaría LayoutConfig para decidir qué layout
                y qué variantes de vistas usar.

            FASE 7 — Theme Market (roadmap comercial)
            -----------------------------------------
            Propuesta de archivo docs/theme_market.md:
              - Describir catálogos de themes con JSON ya armados:
                  - Dark Pro
                  - Amarillo Sunmi
                  - Blanco Minimal
                  - Farmacia
                  - Tienda Bebidas
                  - Restaurante
                  - Gasista
                  - Ferretería

              - Cada theme = { baseThemeKey, overrides }
              - En el ERP, un "Theme Market" permitiría:
                  - Ver cards con preview
                  - Hacer click en "Instalar theme"
                  - Esto aplicaría el JSON de overrides + setThemeKey adecuado.

            Esta doc se puede escribir luego en /docs/theme_market.md
            usando los nombres y estructuras definidos acá.
          */}
        </div>
      </div>
    </div>
  );
}
