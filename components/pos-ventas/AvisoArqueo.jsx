"use client";

// Aviso PERSISTENTE de arqueo vencido.
//
// No es un modal ni un toast: es una franja anclada arriba del POS. Recargar la
// página no la hace desaparecer —el estado vive en el servidor, no en el
// componente— y no tiene botón de cerrar. Solo se va al registrar el arqueo o
// al conseguir una postergación válida.
//
// Esta etapa NO bloquea ventas. La franja incomoda, cuenta el tiempo perdido y
// deja registro de cada postergación; frenar el POS en producción es una
// decisión aparte.

import { useState } from "react";
import { TriangleAlert, Clock } from "lucide-react";
import SunmiButton from "@/components/sunmi/SunmiButton";

function textoDemora(minutos) {
  const m = Math.max(0, Number(minutos) || 0);
  if (m < 60) return `${m} min`;
  const horas = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

export default function AvisoArqueo({ estado, ultimoArqueoEn, onArquear, onPostergado, turnoId, localId }) {
  const [postergando, setPostergando] = useState(false);
  const [error, setError] = useState("");

  if (!estado?.activo || !estado?.cajaAbierta || !estado?.vencido) return null;

  const postergar = async () => {
    if (postergando) return;
    setPostergando(true);
    setError("");
    try {
      const res = await fetch("/api/pos-ventas/arqueos/postergar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ turnoId, localId, motivo: null }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(
          json?.requiereAutorizacion
            ? "La demora superó la tolerancia: necesitás autorización de un encargado."
            : json?.error || "No se pudo postergar"
        );
        return;
      }
      onPostergado?.(json);
    } catch {
      setError("Error de conexión");
    } finally {
      setPostergando(false);
    }
  };

  // El registro anterior puede ser un retiro nuevo o un conteo histórico: sin
  // saberlo, se dice "el último control" y no se afirma que hubo un retiro.
  const desde = ultimoArqueoEn ? "el último control" : "la apertura de caja";

  return (
    <div
      role="alert"
      className="sunmi-state-danger sunmi-border rounded-lg px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
    >
      <div className="shrink-0 grid place-items-center w-9 h-9 rounded-lg sunmi-surface-soft sunmi-text-danger">
        <TriangleAlert size={18} strokeWidth={2} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold sunmi-text-strong leading-tight">
          Retiro de recaudación pendiente
        </div>
        {/* Antes acá se explicaba que el arqueo "solo cuenta y no mueve dinero".
            Eso dejó de ser cierto: la operación principal ES sacar la plata. */}
        <p className="text-[12px] sunmi-text-muted leading-snug mt-0.5">
          Es momento de retirar la recaudación y conservar el fondo de caja.
        </p>
        <p className="text-[12px] sunmi-text-muted leading-snug mt-0.5 flex flex-wrap items-center gap-x-2">
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {textoDemora(estado.minutosDemora)} desde que venció
          </span>
          <span>· pasaron más de lo previsto desde {desde}</span>
          {estado.cantidadPostergaciones > 0 && (
            <span className="sunmi-text-warning">
              · {estado.cantidadPostergaciones} postergación
              {estado.cantidadPostergaciones === 1 ? "" : "es"}
            </span>
          )}
        </p>
        {error && <div className="text-[11px] sunmi-text-danger mt-1">{error}</div>}
      </div>

      <div className="flex gap-2 shrink-0 flex-wrap">
        {estado.puedePostergar && (
          <SunmiButton
            color="slate"
            onClick={postergar}
            disabled={postergando}
            className="text-sm whitespace-nowrap"
          >
            {postergando ? "…" : "Postergar retiro"}
          </SunmiButton>
        )}
        <SunmiButton color="amber" onClick={onArquear} className="text-sm font-bold whitespace-nowrap">
          Retirar ahora
        </SunmiButton>
      </div>
    </div>
  );
}
