"use client";

import usePushNotifications from "@/hooks/usePushNotifications";
import SunmiButton from "@/components/sunmi/SunmiButton";

const ESTADO_LABEL = {
  "no-soportado": "No soportado",
  bloqueado: "Bloqueado",
  activo: "Activo",
  permitido: "Permitido",
  inactivo: "Inactivo",
};

// Panel de alertas push de este dispositivo (navegador).
// Mobile-first: botones en columna full-width; en desktop, en fila.
export default function PushControls() {
  const { soportado, estado, subscription, busy, activar, renovar, desactivar, enviarPrueba } =
    usePushNotifications();

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[13px] font-semibold sunmi-text-strong">Estado del permiso</span>
        <span className="text-[11px] sunmi-text-muted">
          <span className="sunmi-text-accent font-medium">{ESTADO_LABEL[estado] || estado}</span>
        </span>
      </div>

      {!soportado ? (
        <p className="text-xs sunmi-text-muted">
          Tu navegador no soporta notificaciones push (o no estás en HTTPS/localhost).
        </p>
      ) : estado === "bloqueado" ? (
        <p className="text-xs sunmi-text-muted">
          Las notificaciones están bloqueadas para este sitio. Habilitalas desde la
          configuración del navegador y recargá.
        </p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <SunmiButton
              color="cyan"
              type="button"
              className="w-full sm:w-auto"
              disabled={busy || estado === "activo"}
              onClick={activar}
            >
              {estado === "activo" ? "Activadas" : "Activar"}
            </SunmiButton>
            <SunmiButton
              color="slate"
              type="button"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={renovar}
            >
              Renovar suscripción
            </SunmiButton>
            <SunmiButton
              color="slate"
              type="button"
              className="w-full sm:w-auto"
              disabled={busy || estado !== "activo"}
              onClick={enviarPrueba}
            >
              Enviar prueba
            </SunmiButton>
            {subscription && (
              <SunmiButton
                color="red"
                type="button"
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={desactivar}
              >
                Desactivar este dispositivo
              </SunmiButton>
            )}
          </div>
          <p className="text-[11px] sunmi-text-muted mt-3">
            Si rotaste las claves o ves un error de credenciales, usá <b>Renovar suscripción</b>.
          </p>
        </>
      )}
    </div>
  );
}
