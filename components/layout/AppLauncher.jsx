"use client";

import { LayoutGrid } from "lucide-react";
import { useUser } from "@/app/context/UserContext";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { MENU_CONFIG, buildVisibleMenu } from "@/lib/menuConfig";
import AppLauncherTile from "./AppLauncherTile";

const MAX_TILES = 8;

const TXT = "text-[color:var(--app-fg)]";
const DIVIDER = "border-[color:var(--card-border)]";

export default function AppLauncher() {
  const { perfil, cargando } = useUser();
  const { theme } = useSunmiTheme();

  if (cargando || !perfil) return null;

  const menu = buildVisibleMenu(MENU_CONFIG, perfil).slice(0, MAX_TILES);

  return (
    <section className="w-full mb-6" aria-label="App Launcher">
      <div className="flex items-center gap-2 mb-3">
        <LayoutGrid size={18} className={TXT} aria-hidden />
        <h2 className={`text-base font-semibold ${TXT}`}>
          Aplicaciones
        </h2>
      </div>

      {menu.length === 0 ? (
        <div
          className={`
            rounded-2xl border border-dashed
            p-6 text-center
            ${theme.card}
            ${DIVIDER}
          `}
        >
          <p className={`text-sm font-medium ${TXT}`}>
            No tenés módulos disponibles.
          </p>
          <p className="text-xs sunmi-text-muted mt-1">
            Pedile acceso a un administrador para empezar a operar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-6 sm:gap-y-8 justify-items-center max-w-md sm:max-w-2xl mx-auto">
          {menu.map((grupo) => (
            <AppLauncherTile key={grupo.key} group={grupo} />
          ))}
        </div>
      )}
    </section>
  );
}
