"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import { useUser } from "@/app/context/UserContext";
import PushControls from "@/components/notificaciones/PushControls";

// Alertas del dispositivo: configuración personal de push por navegador/dispositivo.
// No es admin-only: cualquier usuario puede activar las alertas en su propio dispositivo.
export default function AlertasDispositivoPage() {
  const { perfil, cargando } = useUser();

  if (cargando || !perfil) return null;

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <SunmiHeader title="Alertas del dispositivo" />
            <p className="text-xs sunmi-text-muted px-1">
              Notificaciones push en este dispositivo (este navegador).
            </p>
          </div>
          <SunmiBackButton href="/modulos/configuracion" />
        </div>

        <PushControls />
      </SunmiCard>
    </div>
  );
}
