"use client";

// CERRAR SIN CONTEO: LA CONFIRMACIÓN.
//
// Es una acción EXCEPCIONAL y el modal lo dice antes que nada: la caja se cierra
// con el esperado congelado en el corte y sin conteo. No se inventa un contado,
// no se inventa una diferencia, no se crea el retiro. Por eso pide un motivo —la
// única explicación que va a quedar— y no deja confirmar sin él.
//
// `destructivo`: tocar afuera no lo cierra, porque se perdería el motivo escrito.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTextarea from "@/components/sunmi/SunmiTextarea";
import { Fila } from "@/components/caja/CifrasRetiro";
import { TEXTO_SIN_CONTAR, TEXTO_DIFERENCIA_NO_DISPONIBLE } from "@/lib/caja/cierreRelevo";

export default function ModalCerrarSinConteo({ item = null, trabajando = false, error = "", onCerrar, onConfirmar }) {
  const [motivo, setMotivo] = useState("");

  // Un cierre distinto arranca con el motivo vacío: nunca aparece ya escrito.
  useEffect(() => {
    setMotivo("");
  }, [item?.token]);

  if (!item) return null;
  const listo = motivo.trim().length > 0;

  const contenido = (
    <SunmiModalLayout
      open
      title="Cerrar sin conteo"
      subtitle={`Turno #${item.turnoId} · ${item.operadorNombre || item.cajeroNombre || "Sin operario"}`}
      color="red"
      onClose={trabajando ? undefined : onCerrar}
      maxWidth="max-w-lg"
      forma="hoja-o-centrado"
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      destructivo
      footer={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <SunmiButton color="slate" onClick={onCerrar} disabled={trabajando} className="py-2 text-xs">
            Volver
          </SunmiButton>
          <SunmiButton
            color="red"
            onClick={() => onConfirmar?.(motivo.trim())}
            disabled={trabajando || !listo}
            className="py-2 font-bold text-xs"
          >
            {trabajando ? "Un momento…" : "Cerrar sin conteo"}
          </SunmiButton>
        </div>
      }
    >
      <p className="text-sm2 sunmi-text-muted leading-snug">
        Este cierre venció y nadie contó la caja. Se cierra el turno con el esperado que quedó congelado en el
        corte. Lo contado y la diferencia quedan como desconocidos: no se registra ningún arqueo ni ningún
        retiro de dinero. El cambio que se separó no se toca.
      </p>

      <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
        <Fila label="Esperado" valor={Number(item.efectivoEsperadoCorte)} />
        <Fila label="Contado" valor={TEXTO_SIN_CONTAR} clase="sunmi-text-muted" />
        <Fila label="Diferencia" valor={TEXTO_DIFERENCIA_NO_DISPONIBLE} clase="sunmi-text-muted" />
      </div>

      <label className="block space-y-1">
        <span className="text-sm2 sunmi-text-strong font-semibold">Motivo (obligatorio)</span>
        <SunmiTextarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={500}
          rows={3}
          disabled={trabajando}
          placeholder="Por qué esta caja se cierra sin contar"
        />
      </label>

      {error && <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>}
    </SunmiModalLayout>
  );

  return typeof document !== "undefined" ? createPortal(contenido, document.body) : null;
}
