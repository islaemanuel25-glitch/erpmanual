"use client";

import { LayoutGrid } from "lucide-react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useMenu } from "@/hooks/useMenu";
import AppLauncherTile from "./AppLauncherTile";
import { gruposDelPanel } from "@/lib/dashboard/accesosRapidos";

const TXT = "text-[color:var(--app-fg)]";
const DIVIDER = "border-[color:var(--card-border)]";

export default function AppLauncher({ hideTitle = false }) {
  const { menu: visibleMenu, perfil, isLoading } = useMenu();
  const { theme } = useSunmiTheme();

  if (isLoading || !perfil) return null;

  // El lanzador ES el Panel del modo lanzador (`/modulos/inicio`): ofrece los
  // mismos grupos que los accesos rápidos del otro Panel, con la misma regla
  // —sin el Inicio y como mucho ocho—. Una sola implementación para los dos.
  const menu = gruposDelPanel(visibleMenu);

  return (
    <section className="w-full max-w-6xl mx-auto mt-8 mb-6" aria-label="App Launcher">
      {!hideTitle && (
        <div className="flex items-center gap-2 mb-6">
          <LayoutGrid size={18} className={TXT} aria-hidden />
          <h2 className={`text-base font-semibold ${TXT}`}>
            Aplicaciones
          </h2>
        </div>
      )}

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
        <div
          className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-4"
          style={{ gap: "32px 18px" }}
        >
          {menu.map((grupo) => (
            <AppLauncherTile key={grupo.key} group={grupo} />
          ))}
        </div>
      )}
    </section>
  );
}
