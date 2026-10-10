"use client";

// EL PANEL DE ANULAR UNA VENTA COMÚN, con su confirmación.
//
// Es el panel del 2026-08-20 (e7d9ff40), restaurado el 2026-10-10 para las ventas
// del mostrador sin remito. Se le sacaron las dos líneas que solo existían para
// la venta interna —el remito que se cancela y el turno cerrado—, porque la ruta
// ya no acepta ninguno de los dos casos. La cinta de anulada que vivía acá se
// mudó a `CintaVentaAnulada.jsx` y sigue allá.
//
// ── POR QUÉ PREGUNTA ANTES DE MOSTRARSE ─────────────────────────────────────
//
// El panel consulta el preview de la ruta al abrirse. Entre que se dibujó el
// botón y se tocó, el turno pudo pasar a cierre o alguien pudo anularla; un
// botón que solo falla al confirmar obliga a adivinar por qué.
//
// ── Y POR QUÉ MUESTRA EL IMPACTO EN LA CAJA ─────────────────────────────────
//
// Anular una venta que contaba para el arqueo BAJA el esperado del turno. El
// número sale del servidor —no se calcula acá— y se muestra antes de confirmar,
// para que nadie se entere al cerrar la caja.
//
// ── EN EL CELULAR ───────────────────────────────────────────────────────────
//
// Todo apilado en una columna, botones a ancho completo y el de confirmar en rojo
// y al final. La confirmación no es un `confirm()` del navegador: en la Sunmi el
// cartel nativo sale con letra chica y el botón de aceptar pegado al borde.

import { useEffect, useState } from "react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

// Espacio irrompible: a 360 px el "$" quedaba solo al final del renglón.
const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

  const motivoOk = motivo.trim().length > 0;

  return (
    <div className="mt-3 border-t sunmi-divider pt-3 space-y-3">
      <div className="text-sm3 font-semibold sunmi-text-danger">Anular venta</div>

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
          </div>

          <div>
            <div className="text-sm2 sunmi-text-muted mb-1">Motivo de la anulación *</div>
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
