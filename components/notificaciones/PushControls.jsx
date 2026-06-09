"use client";

import usePushNotifications from "@/hooks/usePushNotifications";
import SunmiButton from "@/components/sunmi/SunmiButton";

const ESTADO_LABEL = {
  "no-soportado": "No soportado",
  bloqueado: "Bloqueado",
  activo: "Activo",
  permitido: "Permitido (sin suscribir)",
  inactivo: "Inactivo",
};

export default function PushControls() {
  const { soportado, estado, subscription, busy, activar, renovar, desactivar, enviarPrueba } =
    usePushNotifications();

  return (
    <div className="rounded-xl border sunmi-border p-3 sunmi-surface mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[13px] font-semibold sunmi-text-strong">
          Notificaciones en este dispositivo
        </span>
        <span className="text-[11px] sunmi-text-muted">
          Estado: <span className="sunmi-text-accent font-medium">{ESTADO_LABEL[estado] || estado}</span>
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
          <div className="flex flex-wrap gap-2">
            <SunmiButton
              color="cyan"
              type="button"
              disabled={busy || estado === "activo"}
              onClick={activar}
            >
              {estado === "activo" ? "Notificaciones activas" : "Activar notificaciones en este dispositivo"}
            </SunmiButton>
            <SunmiButton color="slate" type="button" disabled={busy} onClick={renovar}>
              Renovar suscripción
            </SunmiButton>
            <SunmiButton
              color="slate"
              type="button"
              disabled={busy || estado !== "activo"}
              onClick={enviarPrueba}
            >
              Enviar prueba
            </SunmiButton>
            {subscription && (
              <SunmiButton color="red" type="button" disabled={busy} onClick={desactivar}>
                Desactivar este dispositivo
              </SunmiButton>
            )}
          </div>
          <p className="text-[11px] sunmi-text-muted mt-2">
            Si rotaste las claves o ves un error de credenciales, usá <b>Renovar suscripción</b>.
          </p>
        </>
      )}
    </div>
  );
}
