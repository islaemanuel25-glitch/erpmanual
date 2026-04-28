"use client";

import { LayoutGrid } from "lucide-react";
import { useUser } from "@/app/context/UserContext";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { MENU_CONFIG, buildVisibleMenu } from "@/lib/menuConfig";
import AppLauncherTile from "./AppLauncherTile";

const MAX_TILES = 8;

export default function AppLauncher() {
  const { perfil, cargando } = useUser();
  const { theme } = useSunmiTheme();

  if (cargando || !perfil) return null;

  const menu = buildVisibleMenu(MENU_CONFIG, perfil).slice(0, MAX_TILES);

  return (
    <section
      className="w-full max-w-5xl mx-auto"
      aria-label="App Launcher"
    >
      <div className="flex items-center gap-2 mb-4">
        <LayoutGrid size={20} className={theme.sidebar.icon} aria-hidden />
        <h2 className={`text-lg font-semibold ${theme.sidebar.icon}`}>
          Aplicaciones
        </h2>
      </div>

      {menu.length === 0 ? (
        <div
          className={`
            rounded-2xl border border-dashed
            p-8 text-center
            ${theme.card}
            ${theme.sidebar.border}
          `}
        >
          <p className={`text-sm font-medium ${theme.sidebar.icon}`}>
            No tenés módulos disponibles.
          </p>
          <p className="text-xs sunmi-text-muted mt-1">
            Pedile acceso a un administrador para empezar a operar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {menu.map((grupo) => (
            <AppLauncherTile key={grupo.key} group={grupo} />
          ))}
        </div>
      )}
    </section>
  );
}
