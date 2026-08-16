"use client";

// AVISO DE PROCESO DE CAJA PENDIENTE.
//
// Aparece cuando el turno ya tiene un retiro o un cierre a medio hacer y se
// intenta empezar otro. Antes esto era un 409 que la pantalla no mostraba: el
// cajero apretaba el botón, no pasaba nada, y no había forma de enterarse de que
// había un proceso abierto ni de llegar hasta él.
//
// TRES SALIDAS, SIEMPRE
//
//   · Continuar  — navega al proceso que ya existe, por su token. No crea otro.
//   · Cancelar   — solo cuando deshacerlo no toca plata. Pide confirmación.
//   · Volver     — al POS, sin tocar nada.
//
// La cancelación se pregunta en el mismo modal, en un segundo paso, y no con un
// `confirm()` del navegador: en la Sunmi el diálogo nativo aparece descolocado y
// sin los colores del tema.

import { useEffect, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { Fila } from "@/components/caja/CifrasRetiro";
import { Aviso } from "@/components/caja/PanelesRetiro";
import { hora } from "@/components/caja/PanelesCierre";
import {
  TIPO_PROCESO,
  TITULO_PROCESO,
  TEXTO_PROCESO,
  ACCION_CONTINUAR,
  ACCION_CANCELAR,
  ACCION_VOLVER,
  CONFIRMAR_CANCELAR,
} from "@/lib/caja/procesoPendiente";

export default function ModalProcesoPendiente({
  proceso = null,
  cancelando = false,
  error = "",
  onContinuar,
  onCancelar,
  onVolver,
}) {
  // El paso de confirmación de la cancelación. Se reinicia cada vez que cambia
  // el proceso mostrado, para que un aviso nuevo nunca aparezca ya "armado".
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    setConfirmando(false);
  }, [proceso?.token]);

  // Escape no cancela nada y no confirma nada: en el paso de confirmación
  // retrocede, y en el aviso vuelve al POS. La salida por reflejo tiene que ser
  // siempre la inofensiva.
  useEffect(() => {
    if (!proceso) return;
    const alTecla = (e) => {
      if (e.key !== "Escape" || cancelando) return;
      if (confirmando) setConfirmando(false);
      else onVolver?.();
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [proceso, confirmando, cancelando, onVolver]);

  if (!proceso) return null;

  const tipo = proceso.tipo === TIPO_PROCESO.RETIRO ? TIPO_PROCESO.RETIRO : TIPO_PROCESO.CIERRE;
  const sustantivo = tipo === TIPO_PROCESO.RETIRO ? "retiro" : "cierre";

  return (
    <div
      className="fixed inset-0 z-50 sunmi-overlay flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={TITULO_PROCESO[tipo]}
    >
      {/* Fondo opaco por el mismo motivo que en ModalCambioPrevio:
          `sunmi-pos-panel` es translúcido y deja leer la pantalla de atrás. */}
      <div
        className="
          sunmi-surface sunmi-border w-full sm:max-w-md sm:mx-4
          rounded-t-2xl sm:rounded-xl shadow-2xl
          max-h-[92vh] sm:max-h-[88vh]
          flex flex-col
        "
      >
        <div className="shrink-0 px-4 pt-4 pb-2">
          <h2 className="text-base font-bold sunmi-text-warning leading-tight">
            {TITULO_PROCESO[tipo]}
          </h2>
          <p className="text-[12px] sunmi-text-muted leading-snug mt-1">
            {TEXTO_PROCESO[tipo]}
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 space-y-3">
          {/* Los datos del corte que ya se tomó. Sin esto el cajero no puede
              distinguir su proceso del de otro turno ni saber cuánto separó. */}
          <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
            <Fila label="Hora del corte" valor={hora(proceso.corteEn) || "—"} />
            <Fila label="Cambio separado" valor={proceso.totalCambio ?? "—"} />
            <Fila
              label="Retiro esperado"
              valor={proceso.efectivoRetiradoEsperado ?? "—"}
              clase="sunmi-text-accent"
              fuerte
            />
            <Fila label="Lo inició" valor={proceso.operadorNombre || "—"} />
          </div>

          {/* Por qué no se puede deshacer. Se explica siempre que corresponda,
              en vez de mostrar un botón apagado y sin motivo. */}
          {!proceso.puedeCancelar && proceso.motivoNoCancelable && (
            <Aviso>{proceso.motivoNoCancelable}</Aviso>
          )}

          {confirmando && <Aviso>{CONFIRMAR_CANCELAR[tipo]}</Aviso>}

          {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}
        </div>

        <div className="shrink-0 px-4 py-3 border-t sunmi-border space-y-2">
          {confirmando ? (
            <>
              <SunmiButton
                color="red"
                onClick={onCancelar}
                disabled={cancelando}
                className="w-full py-3 font-bold text-xs"
              >
                {cancelando ? "Cancelando…" : `Sí, cancelar el ${sustantivo}`}
              </SunmiButton>
              <SunmiButton
                color="slate"
                onClick={() => setConfirmando(false)}
                disabled={cancelando}
                className="w-full py-3 text-xs"
              >
                Volver atrás
              </SunmiButton>
            </>
          ) : (
            <>
              <SunmiButton
                color="amber"
                onClick={onContinuar}
                disabled={cancelando}
                className="w-full py-3 font-bold text-xs"
              >
                {ACCION_CONTINUAR[tipo]}
              </SunmiButton>
              {proceso.puedeCancelar && (
                <SunmiButton
                  color="red"
                  onClick={() => setConfirmando(true)}
                  disabled={cancelando}
                  className="w-full py-3 text-xs"
                >
                  {ACCION_CANCELAR[tipo]}
                </SunmiButton>
              )}
              <SunmiButton
                color="slate"
                onClick={onVolver}
                disabled={cancelando}
                className="w-full py-3 text-xs"
              >
                {ACCION_VOLVER}
              </SunmiButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
