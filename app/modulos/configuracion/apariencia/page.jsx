"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { SUNMI_THEMES } from "@/lib/sunmiThemes";
import { useUser } from "@/app/context/UserContext";
import { useLayoutSettings } from "@/app/context/LayoutSettingsContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { PanelLeft, PanelTop, LayoutGrid } from "lucide-react";

const MENU_MODES = [
  {
    key: "sidebarLeft",
    label: "Sidebar izquierdo",
    description: "Menú lateral con iconos (comportamiento actual).",
    Icon: PanelLeft,
  },
  {
    key: "topbar",
    label: "Menú superior",
    description: "Barra horizontal arriba con dropdowns.",
    Icon: PanelTop,
  },
  {
    key: "launcher",
    label: "App / Launcher",
    description: "Grilla de aplicaciones que se abre desde un botón flotante o la hamburguesa.",
    Icon: LayoutGrid,
  },
];

export default function AparienciaPage() {
  const { themeKey, setThemeKey } = useSunmiTheme();
  const { menuMode, setMenuMode } = useLayoutSettings();
  const { perfil, cargando } = useUser();

  if (cargando) return null;

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin) return <SinPermisos />;

  return (
    <div className="max-w-5xl mx-auto">
      <SunmiHeader
        title="Apariencia del ERP"
        subtitle="Elegí el theme visual y la disposición del menú."
      />

      {/* THEMES */}
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
              <p className="text-xs sunmi-text-muted mb-3">
                Vista rápida (colores, tarjetas, badges).
              </p>

              <div className="rounded-xl border border-dashed sunmi-border p-3 text-xs">
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
              color={themeKey === t.key ? "cyan" : "slate"}
            >
              {themeKey === t.key ? "Theme aplicado" : "Aplicar theme"}
            </SunmiButton>
          </SunmiCard>
        ))}
      </div>

      {/* DISPOSICION DEL MENU */}
      <h2 className="text-lg font-semibold mt-8 mb-4">Disposici&oacute;n del men&uacute;</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MENU_MODES.map((m) => (
          <div
            key={m.key}
            onClick={() => setMenuMode(m.key)}
            className="cursor-pointer"
          >
            <SunmiCard
              className={`flex items-center gap-4 transition ${
                menuMode === m.key ? "ring-2 ring-amber-400" : ""
              }`}
            >
              <m.Icon size={32} className={menuMode === m.key ? "sunmi-text-accent" : "sunmi-text-muted"} />
              <div>
                <h3 className="text-sm font-semibold">{m.label}</h3>
                <p className="text-xs sunmi-text-muted">{m.description}</p>
              </div>
            </SunmiCard>
          </div>
        ))}
      </div>
    </div>
  );
}
