"use client";

// components/version/AvisoVersionNueva.jsx
//
// Aviso de que el bundle cargado en esta pestaña quedó viejo tras un deploy.
//
// Es un PANEL INTEGRADO, no un modal: sin portal, sin overlay, sin backdrop y
// sin <dialog>. Mismo criterio que el resto del ERP — la pantalla no se
// bloquea, el usuario sigue viendo lo que estaba haciendo.
//
// Tampoco recarga solo: recargar pierde lo no guardado, y esa decisión es del
// usuario. Por eso el texto lo dice explícitamente.
//
// No se ofrece un botón de "guardar igual": el guardado con el bundle viejo es
// exactamente lo que este aviso existe para impedir.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { TriangleAlert } from "lucide-react";

export default function AvisoVersionNueva({ visible, className = "" }) {
  if (!visible) return null;

  return (
    <div
      role="alert"
      className={`sunmi-state-warning sunmi-border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${className}`}
    >
      <div className="shrink-0 grid place-items-center w-9 h-9 rounded-lg sunmi-surface-soft sunmi-text-warning">
        <TriangleAlert size={18} strokeWidth={2} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold sunmi-text-strong leading-tight">
          Hay una versión nueva del sistema
        </div>
        <p className="text-[12px] sunmi-text-muted leading-snug mt-0.5">
          Recargá la página antes de guardar. Los cambios que todavía no
          guardaste se perderán al recargar.
        </p>
      </div>

      <SunmiButton
        color="amber"
        onClick={() => window.location.reload()}
        className="shrink-0 whitespace-nowrap font-semibold"
      >
        Recargar ahora
      </SunmiButton>
    </div>
  );
}
