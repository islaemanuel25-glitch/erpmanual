"use client";

import { useEffect, useState } from "react";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

const STORAGE_KEY = "erp-layout-profile";

const DEFAULT_PROFILE = {
  sidebarPosition: "left",   // left | right | top | hidden | floating
  navbarPosition: "top",     // top | bottom | hidden
  contentWidth: "normal",    // normal | wide | full
  contentMode: "table",      // table | cards | mixed
  presetKey: "default",
};

const LAYOUT_PRESETS = [
  {
    key: "default",
    label: "Default",
    description: "Layout estándar: sidebar izquierdo, navbar arriba, ancho normal.",
    profile: {
      sidebarPosition: "left",
      navbarPosition: "top",
      contentWidth: "normal",
      contentMode: "table",
    },
  },
  {
    key: "pos",
    label: "POS / Punto de venta",
    description: "Pensado para cajas: contenido full, enfoque en tarjetas y controles grandes.",
    profile: {
      sidebarPosition: "left",
      navbarPosition: "top",
      contentWidth: "full",
      contentMode: "cards",
    },
  },
  {
    key: "wide",
    label: "Wide / Analítico",
    description: "Para pantallas anchas y dashboards con muchas columnas.",
    profile: {
      sidebarPosition: "left",
      navbarPosition: "top",
      contentWidth: "wide",
      contentMode: "mixed",
    },
  },
  {
    key: "minimal",
    label: "Minimal",
    description: "Sin sidebar visible, foco total en la pantalla actual.",
    profile: {
      sidebarPosition: "hidden",
      navbarPosition: "top",
      contentWidth: "full",
      contentMode: "table",
    },
  },
  {
    key: "mobile",
    label: "Mobile / Handheld",
    description: "Pensado para dispositivos pequeños. Sidebar oculto, contenido full.",
    profile: {
      sidebarPosition: "hidden",
      navbarPosition: "top",
      contentWidth: "full",
      contentMode: "cards",
    },
  },
];

export default function LayoutBuilder() {
  const { ui } = useUIConfig();
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [saved, setSaved] = useState(false);

  // Helper function to apply layout profile changes
  function applyLayoutProfile(updated) {
    try {
      window.localStorage.setItem("erp-layout-profile", JSON.stringify(updated));
      window.dispatchEvent(new Event("erp-layout-profile-updated"));
    } catch (e) {
      console.error("Error saving layout profile:", e);
    }
  }

  // Cargar profile guardado
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setProfile({ ...DEFAULT_PROFILE, ...parsed });
      }
    } catch (e) {
      console.error("Error leyendo layout profile:", e);
    }
  }, []);

  const updateProfile = (partial) => {
    const newProfile = {
      ...profile,
      ...partial,
      saved: false,
    };
    setProfile(newProfile);
    setSaved(false);
    applyLayoutProfile(newProfile);
  };

  const applyPreset = (presetKey) => {
    const preset = LAYOUT_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const newProfile = {
      ...profile,
      ...preset.profile,
      presetKey,
    };
    setProfile(newProfile);
    setSaved(false);
    applyLayoutProfile(newProfile);
  };

  const handleSave = () => {
    const profileToSave = {
      sidebarPosition: profile.sidebarPosition,
      navbarPosition: profile.navbarPosition,
      contentWidth: profile.contentWidth,
      contentMode: profile.contentMode,
      presetKey: profile.presetKey,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profileToSave));
      setSaved(true);
      applyLayoutProfile(profileToSave);
    } catch (e) {
      console.error("Error guardando layout profile:", e);
    }
  };

  const handleReset = () => {
    const newProfile = DEFAULT_PROFILE;
    setProfile(newProfile);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      applyLayoutProfile(newProfile);
    } catch (e) {
      console.error("Error reseteando layout profile:", e);
    }
    setSaved(false);
  };

  const isPresetActive = (key) => profile.presetKey === key;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6">
      {/* ================== COLUMNA IZQUIERDA — CONTROLES ================== */}
      <div className="space-y-4">
        <SunmiSeparator label="Presets de layout" color="amber" />

        <p className="text-xs opacity-80 mb-2">
          Estos presets son combinaciones pensadas para casos de uso reales. Se
          guardan a nivel navegador y no afectan la estructura actual del
          layout hasta que se haga el wiring final en <code>LayoutController</code>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {LAYOUT_PRESETS.map((preset) => {
            const active = isPresetActive(preset.key);
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset.key)}
                className={`text-left rounded-lg border p-2 transition ${
                  active
                    ? "border-amber-400 ring-2 ring-amber-300/60"
                    : "border-slate-700 hover:border-amber-300/60"
                }`}
              >
                <div className="text-[11px] uppercase opacity-70 mb-1">
                  Preset
                </div>
                <div className="font-semibold text-sm mb-1">
                  {preset.label}
                </div>
                <div className="text-[11px] opacity-80">
                  {preset.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* ------------------- Sidebar ------------------- */}
        <SunmiSeparator label="Posición del sidebar" color="amber" />
        <p className="text-xs opacity-80 mb-2">
          Define si el sidebar va a la izquierda, derecha, arriba, oculto o como panel
          flotante.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          {[
            { key: "left", label: "Izquierda" },
            { key: "right", label: "Derecha" },
            { key: "top", label: "Arriba" },
            { key: "hidden", label: "Oculto" },
            { key: "floating", label: "Flotante" },
          ].map((opt) => {
            const active = profile.sidebarPosition === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() =>
                  updateProfile({ sidebarPosition: opt.key, presetKey: undefined })
                }
                className={`text-xs rounded-lg border px-2 py-2 transition ${
                  active
                    ? "border-emerald-400 ring-2 ring-emerald-300/60"
                    : "border-slate-700 hover:border-emerald-300/60"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* ------------------- Navbar ------------------- */}
        <SunmiSeparator label="Posición del navbar" color="amber" />
        <p className="text-xs opacity-80 mb-2">
          Controla la barra principal de navegación (actualmente el Header). En
          una fase futura esto moverá el componente <code>{"<Header />"}</code>.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { key: "top", label: "Arriba" },
            { key: "bottom", label: "Abajo" },
            { key: "hidden", label: "Oculto" },
          ].map((opt) => {
            const active = profile.navbarPosition === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() =>
                  updateProfile({ navbarPosition: opt.key, presetKey: undefined })
                }
                className={`text-xs rounded-lg border px-2 py-2 transition ${
                  active
                    ? "border-emerald-400 ring-2 ring-emerald-300/60"
                    : "border-slate-700 hover:border-emerald-300/60"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* ------------------- Ancho de contenido ------------------- */}
        <SunmiSeparator label="Ancho del contenido" color="amber" />
        <p className="text-xs opacity-80 mb-2">
          Solo afecta cómo se dibuja el preview. En el wiring final, esto
          ajustará el <code>max-width</code> del contenido real.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { key: "normal", label: "Normal" },
            { key: "wide", label: "Wide" },
            { key: "full", label: "Full" },
          ].map((opt) => {
            const active = profile.contentWidth === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() =>
                  updateProfile({ contentWidth: opt.key, presetKey: undefined })
                }
                className={`text-xs rounded-lg border px-2 py-2 transition ${
                  active
                    ? "border-emerald-400 ring-2 ring-emerald-300/60"
                    : "border-slate-700 hover:border-emerald-300/60"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* ------------------- Modo de contenido ------------------- */}
        <SunmiSeparator label="Modo de contenido" color="amber" />
        <p className="text-xs opacity-80 mb-2">
          Esto simula si las vistas son más tipo tabla, tarjetas o mixto. En el
          futuro se podrá usar por módulo.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { key: "table", label: "Tabla" },
            { key: "cards", label: "Cards" },
            { key: "mixed", label: "Mixto" },
          ].map((opt) => {
            const active = profile.contentMode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() =>
                  updateProfile({ contentMode: opt.key, presetKey: undefined })
                }
                className={`text-xs rounded-lg border px-2 py-2 transition ${
                  active
                    ? "border-emerald-400 ring-2 ring-emerald-300/60"
                    : "border-slate-700 hover:border-emerald-300/60"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* ------------------- ACCIONES ------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <SunmiButton variant="primary" onClick={handleSave}>
            Guardar layout
          </SunmiButton>
          <SunmiButton variant="ghost" onClick={handleReset}>
            Resetear a default
          </SunmiButton>
          {saved && (
            <span className="text-[11px] text-emerald-300">
              Layout guardado en este navegador.
            </span>
          )}
        </div>

        <p className="text-[11px] text-slate-500 mt-2">
          Nota: hoy el Layout Builder solo define el perfil de layout y lo
          guarda. El wiring para que <code>LayoutController</code> use este
          perfil se hará en la siguiente fase, para no romper nada del layout
          actual.
        </p>
      </div>

      {/* ================== COLUMNA DERECHA — PREVIEW ================== */}
      <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-950/60">
        <div
          className="w-full h-full"
          style={{
            padding: ui.helpers.spacing("md"),
          }}
        >
          <div className="relative w-full h-64 bg-slate-950 rounded-lg overflow-hidden">
            {/* Navbar top */}
            {profile.navbarPosition === "top" && (
              <div className="w-full h-8 bg-slate-800 border-b border-slate-700 flex items-center px-2 text-[10px] text-slate-200">
                Navbar (top)
              </div>
            )}

            {/* Sidebar top (legacy mode) */}
            {profile.sidebarPosition === "top" && (
              <div className="w-full h-6 bg-yellow-400/80 border-b border-yellow-600 flex items-center justify-center text-[9px] text-slate-900">
                Sidebar (top)
              </div>
            )}

            {/* Contenedor principal */}
            <div className="flex w-full h-full">
              {/* Sidebar izquierdo */}
              {profile.sidebarPosition === "left" && (
                <div className="h-full w-12 bg-yellow-400/80 border-r border-yellow-600 text-[9px] flex items-center justify-center text-slate-900">
                  SB
                </div>
              )}

              {/* Contenido */}
              <div
                className="flex-1 h-full flex flex-col"
                style={{
                  padding: ui.helpers.spacing("sm"),
                }}
              >
                <div
                  className="h-full mx-auto bg-slate-900 rounded-md border border-slate-700 flex flex-col"
                  style={{
                    maxWidth:
  profile.contentWidth === "normal"
    ? "60%"
    : profile.contentWidth === "wide"
    ? "85%"
    : "100%",

                  }}
                >
                  <div className="h-6 border-b border-slate-800 flex items-center px-2 text-[9px] text-slate-300">
                    {profile.contentMode === "table" && "Vista tipo tabla"}
                    {profile.contentMode === "cards" && "Vista tipo tarjetas"}
                    {profile.contentMode === "mixed" && "Vista mixta"}
                  </div>
                  <div className="flex-1 p-2 flex gap-2 text-[8px]">
                    {profile.contentMode !== "table" && (
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="h-6 bg-slate-800 rounded-md" />
                        <div className="h-6 bg-slate-800 rounded-md" />
                        <div className="h-6 bg-slate-800 rounded-md" />
                      </div>
                    )}
                    {profile.contentMode !== "cards" && (
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="h-2 bg-slate-800 rounded" />
                        <div className="h-2 bg-slate-800 rounded" />
                        <div className="h-2 bg-slate-800 rounded" />
                        <div className="h-2 bg-slate-800 rounded" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar derecho */}
              {profile.sidebarPosition === "right" && (
                <div className="h-full w-12 bg-yellow-400/80 border-l border-yellow-600 text-[9px] flex items-center justify-center text-slate-900">
                  SB
                </div>
              )}
            </div>

            {/* Sidebar flotante */}
            {profile.sidebarPosition === "floating" && (
              <div className="absolute left-2 top-10 w-14 h-24 bg-yellow-400/90 border border-yellow-600 rounded-md text-[9px] flex items-center justify-center text-slate-900 shadow-lg">
                SB float
              </div>
            )}

            {/* Navbar bottom */}
            {profile.navbarPosition === "bottom" && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-slate-800 border-t border-slate-700 flex items-center px-2 text-[10px] text-slate-200">
                Navbar (bottom)
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}