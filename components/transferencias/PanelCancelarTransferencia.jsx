"use client";

// EL PANEL DE CANCELACIÓN DE UN REMITO.
//
// ── POR QUÉ REEMPLAZA AL `confirm()` QUE HABÍA ──────────────────────────────
//
// Antes esto era una línea: `confirm("¿Estás seguro de cancelar esta
// transferencia? Se revertirá el stock en tránsito al origen.")`. Tres problemas,
// y el tercero es el que importa:
//
// 1. En la Sunmi el cartel nativo sale con letra chica y el botón pegado al borde.
// 2. No había dónde escribir el motivo, y ahora es obligatorio.
// 3. **El texto era falso para la mitad de los casos.** Cuando el remito viene de
//    una venta, cancelarlo no "revierte el stock en tránsito" y ya: anula una
//    venta cobrada, devuelve el stock al local que vendió, y revierte cuenta
//    corriente y puntos. Eso no se puede resumir en una línea escrita de
//    antemano, así que el panel se lo pregunta al servidor y muestra lo que
//    realmente va a pasar con ESTE remito.

import { useEffect, useState } from "react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PanelCancelarTransferencia({ id, onCancelada, onCerrar }) {
  const [preview, setPreview] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/transferencias/cancelar?id=${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d.ok) setPreview(d);
        else setError(d.error || "No se pudo evaluar la cancelación.");
      })
      .catch(() => { if (vivo) setError("Error de conexión."); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [id]);

  async function cancelar() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/transferencias/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ transferenciaId: id, motivo: motivo.trim() }),
      });
      const d = await res.json();
      if (d.ok) onCancelada && onCancelada(d);
      else setError(d.error || "No se pudo cancelar la transferencia.");
    } catch {
      setError("Error de conexión.");
    } finally {
      setBusy(false);
    }
  }

  // El motivo es OBLIGATORIO y nada más: acá hubo un mínimo de 10 caracteres
  // que se sacó el 2026-08-20. La regla es que exista, no que tenga un largo.
  const motivoOk = motivo.trim() !== "";

  return (
    <div className="mt-3 border-t sunmi-divider pt-3 space-y-3">
      <div className="text-sm font-semibold sunmi-text-danger">Cancelar esta transferencia</div>

      {cargando && <div className="text-sm2 sunmi-text-muted">Verificando…</div>}

      {!cargando && preview && !preview.cancelable && (
        <div className="text-sm2 sunmi-state-warning sunmi-text-accent rounded px-2 py-2">
          {preview.motivoBloqueo}
        </div>
      )}

      {!cargando && preview?.cancelable && (
        <>
          {/* QUÉ VA A PASAR. Sale del servidor, no está escrito acá: cancelar un
              remito manual y cancelar uno que vino de una venta cobrada hacen
              cosas distintas. */}
          <div className="text-sm2 sunmi-surface-soft sunmi-border rounded-lg px-3 py-2 space-y-1">
            <div className="font-medium sunmi-text-strong">Al cancelar:</div>
            {(preview.efectos || []).map((e, i) => (
              <div key={i}>· {e}</div>
            ))}
            {/* `numero` es el número de COMPROBANTE: el ERP lo muestra como
                "Ticket" y es el que el operador ve impreso. El id interno de la
                venta es otra cosa —la venta 7726 lleva el ticket 1022— y
                confundirlos manda a buscar por un número que no existe.

                Los números van sin almohadilla en este comentario a propósito:
                el contador de hardcodeo lee los comentarios y toma una
                almohadilla seguida de dígitos por un color hexadecimal. */}
            {preview.revierteVenta && preview.venta && (
              <div className="sunmi-text-accent font-medium">
                · Se anula el ticket #{preview.venta.numero} por {money(preview.venta.total)}.
                El número se conserva.
              </div>
            )}
            <div className="sunmi-text-muted pt-1">
              Nada se borra: el remito y sus productos siguen visibles en el historial.
            </div>
          </div>

          <div>
            <div className="text-sm2 sunmi-text-muted mb-1">
              Motivo de la cancelación *
            </div>
            <SunmiInput
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por qué se cancela este remito"
              className="text-sm"
              maxLength={300}
            />
          </div>
        </>
      )}

      {error && (
        <div className="text-sm2 sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">{error}</div>
      )}

      {/* En el celular los botones van apilados y a ancho completo. */}
      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-1">
        <SunmiButton color="slate" onClick={onCerrar} disabled={busy} className="text-sm w-full sm:w-auto">
          Volver
        </SunmiButton>
        {preview?.cancelable && (
          <SunmiButton
            color="red"
            onClick={cancelar}
            disabled={busy || !motivoOk}
            className="text-sm w-full sm:w-auto"
          >
            {busy ? "Cancelando…" : "⛔ Cancelar transferencia"}
          </SunmiButton>
        )}
      </div>
    </div>
  );
}
