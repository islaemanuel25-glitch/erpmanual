"use client";

// EL BOTÓN DE ANULAR, con su panel de confirmación.
//
// ── POR QUÉ PREGUNTA ANTES DE MOSTRARSE ─────────────────────────────────────
//
// El panel consulta el preview de la ruta al abrirse. No es para decorar: hay
// cuatro motivos distintos por los que una venta puede no ser anulable —el
// remito ya se está recibiendo, el turno original está cerrado y falta permiso,
// no hay ninguna caja abierta, ya está anulada— y cada uno tiene un texto
// distinto y una acción distinta del otro lado. Un botón que solo falla al
// tocarlo obliga a adivinar cuál de los cuatro es.
//
// ── Y POR QUÉ MUESTRA EL IMPACTO EN LA CAJA ─────────────────────────────────
//
// Anular una venta que contaba para el arqueo BAJA el esperado del turno donde
// cae. Anular una venta interna no lo mueve. Desde la pantalla las dos se ven
// iguales y la diferencia son cientos de miles de pesos. El número sale del
// servidor —no se calcula acá— y se muestra antes de confirmar, para que nadie
// se entere al cerrar la caja.
//
// ── EN EL CELULAR ───────────────────────────────────────────────────────────
//
// Todo apilado en una columna, botones a ancho completo desde 44 px de alto y el
// de confirmar en rojo y al final. La confirmación no es un `confirm()` del
// navegador: en la Sunmi el cartel nativo sale con letra chica y el botón de
// aceptar pegado al borde.

import { useEffect, useState } from "react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";

const MOTIVO_MIN = 10;

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** La cinta de una venta ya anulada. Se muestra siempre, arriba de todo. */
export function CintaAnulada({ venta }) {
  const a = venta?.anulacion;
  if (!a?.anulada) return null;
  return (
    <div className="mb-3 sunmi-state-danger rounded-lg px-3 py-2 text-[12px]">
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
        <span className="px-2 py-0.5 rounded-full sunmi-text-danger font-semibold whitespace-nowrap">
          ⛔ VENTA ANULADA
        </span>
        {a.fecha && (
          <span className="sunmi-text-muted whitespace-nowrap">
            El: <span className="sunmi-text-strong">{fechaHoraAR(a.fecha)}</span>
          </span>
        )}
        {a.usuario && (
          <span className="sunmi-text-muted whitespace-nowrap">
            Por: <span className="sunmi-text-strong">{a.usuario}</span>
          </span>
        )}
        {a.motivo && (
          <span className="sunmi-text-muted min-w-0">
            Motivo: <span className="sunmi-text-strong">{a.motivo}</span>
          </span>
        )}
      </div>
      <div className="mt-1 sunmi-text-muted">
        No cuenta para el arqueo, los reportes ni las estadísticas. El ticket conserva su número.
      </div>
    </div>
  );
}

export default function PanelAnularVenta({ venta, onAnulada, onCerrar }) {
  const [preview, setPreview] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/pos-ventas/venta/${venta.id}/anular`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d.ok) setPreview(d);
        else setError(d.error || "No se pudo evaluar la anulación.");
      })
      .catch(() => { if (vivo) setError("Error de conexión."); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [venta.id]);

  async function anular() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/pos-ventas/venta/${venta.id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ motivo: motivo.trim(), version: venta?.correccion?.version }),
      });
      const d = await res.json();
      if (d.ok) onAnulada && onAnulada(d);
      else setError(d.error || "No se pudo anular la venta.");
    } catch {
      setError("Error de conexión.");
    } finally {
      setBusy(false);
    }
  }

  const motivoOk = motivo.trim().length >= MOTIVO_MIN;

  return (
    <div className="mt-3 border-t sunmi-divider pt-3 space-y-3">
      <div className="text-[13px] font-semibold sunmi-text-danger">Anular venta</div>

      {cargando && <div className="text-[12px] sunmi-text-muted">Verificando…</div>}

      {!cargando && preview && !preview.anulable && (
        <div className="text-[12px] sunmi-state-warning sunmi-text-accent rounded px-2 py-2">
          {preview.motivoBloqueo}
        </div>
      )}

      {!cargando && preview?.anulable && (
        <>
          {/* QUÉ VA A PASAR. Tres renglones, sin jerga. */}
          <div className="text-[12px] sunmi-surface-soft sunmi-border rounded-lg px-3 py-2 space-y-1">
            <div className="font-medium sunmi-text-strong">Al anular:</div>
            <div>· El stock vuelve al local. La venta deja de contar para reportes y estadísticas.</div>
            <div>· El ticket conserva su número y queda marcado como anulado.</div>
            {preview.transferencia && (
              <div>
                · Se cancela el remito #{preview.transferencia.id}, que está en{" "}
                {preview.transferencia.estado}.
              </div>
            )}
            {preview.arqueo?.contabaEnArqueo ? (
              <div className="sunmi-text-accent font-medium">
                · El efectivo esperado de la caja BAJA {money(Math.abs(preview.arqueo.deltaEsperado))}
                {preview.arqueo.medios?.length > 1 && " (repartido entre varios medios)"}.
              </div>
            ) : (
              <div className="sunmi-text-muted">
                · El arqueo no se mueve: esta venta no contaba para el esperado.
              </div>
            )}
            {preview.turnoOriginalCerrado && (
              <div className="sunmi-text-accent">
                · El turno original está cerrado, así que la diferencia cae en la caja abierta ahora.
                El turno cerrado no se toca.
              </div>
            )}
          </div>

          <div>
            <div className="text-sm2 sunmi-text-muted mb-1">
              Motivo de la anulación * (mínimo {MOTIVO_MIN} caracteres)
            </div>
            <SunmiInput
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por qué se anula esta venta"
              className="text-sm"
              maxLength={300}
            />
          </div>
        </>
      )}

      {error && (
        <div className="text-[12px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">{error}</div>
      )}

      {/* En el celular los dos botones van apilados y a ancho completo. */}
      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-1">
        <SunmiButton color="slate" onClick={onCerrar} disabled={busy} className="text-sm w-full sm:w-auto">
          Cancelar
        </SunmiButton>
        {preview?.anulable && (
          <SunmiButton
            color="red"
            onClick={anular}
            disabled={busy || !motivoOk}
            className="text-sm w-full sm:w-auto"
          >
            {busy ? "Anulando…" : "⛔ Anular esta venta"}
          </SunmiButton>
        )}
      </div>
    </div>
  );
}
