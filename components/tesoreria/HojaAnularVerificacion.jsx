"use client";

// components/tesoreria/HojaAnularVerificacion.jsx
//
// LA HOJA "ANULAR VERIFICACIÓN" (Figma I2 19:1464). Solo se abre desde el
// detalle de una verificación, y solo si el servidor dijo que quien mira puede
// anular (`puedeAnularVerificacion`).
//
// El motivo es OBLIGATORIO: sin texto el botón queda apagado, y el servidor lo
// exige igual. No hay "Editar verificación": la regla es anular y volver a
// verificar. Anular dos veces es seguro —el servidor contesta lo que quedó—, así
// que esta hoja no necesita clave de idempotencia; lo que sí evita es el doble
// envío del mismo toque.

import { useRef, useState } from "react";

import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiTextarea from "@/components/sunmi/SunmiTextarea";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import { showSuccess } from "@/components/sunmi/SunmiToast";
import { formatearMoneda } from "@/lib/moneda";

import { BotonTesoreria } from "./PiezasTesoreria";
import { enviarAnulacion } from "./accionesTesoreria";

/** El cuerpo de la hoja, sin estado: lo que se ve con un motivo dado. */
export function ContenidoAnular({ acto, motivo, onMotivo, onAnular, onCancelar, enviando = false, error = "" }) {
  const n = acto?.entregas?.length || 0;
  const vacio = !String(motivo || "").trim();
  return (
    <>
      <p className="text-sm sunmi-text-muted">
        {n === 1 ? "La entrega" : `Las ${n} entregas`} ({formatearMoneda(acto?.importeDeclarado)}){" "}
        {n === 1 ? "vuelve a quedar pendiente" : "vuelven a quedar pendientes"} de verificar. La verificación anulada queda en el historial con
        lo que se contó, quién la anuló y por qué.
      </p>
      <label htmlFor="tesoreria-motivo" className="block text-sm3 font-semibold sunmi-text-strong">
        Motivo (obligatorio)
      </label>
      <SunmiTextarea
        id="tesoreria-motivo"
        // Mismo motivo que la observación de verificar: en la columna flex de la
        // hoja, con el teclado abierto, un textarea sin `shrink-0` se aplasta.
        className="shrink-0"
        rows={2}
        maxLength={500}
        required
        value={motivo}
        onChange={(e) => onMotivo(e.target.value)}
        placeholder="Por qué se anula"
        aria-required="true"
      />
      {error ? (
        <SunmiAviso tono="danger" titulo="No se anuló">
          {error}
        </SunmiAviso>
      ) : null}
      <BotonTesoreria tipo="peligro" onClick={onAnular} disabled={vacio || enviando} aria-busy={enviando || undefined}>
        {enviando ? "Anulando…" : "Anular verificación"}
      </BotonTesoreria>
      <BotonTesoreria tipo="fantasma" onClick={onCancelar} disabled={enviando}>
        Cancelar
      </BotonTesoreria>
    </>
  );
}

export default function HojaAnularVerificacion({ abierto, ...props }) {
  // Cada apertura se monta de cero: el motivo de la vez anterior no queda.
  if (!abierto) return null;
  return <HojaAbierta {...props} />;
}

function HojaAbierta({ acto, onCerrar, onHecho }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const enviandoRef = useRef(false);

  const anular = async () => {
    const texto = motivo.trim();
    if (!texto || !acto || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError("");
    const r = await enviarAnulacion(acto.id, texto);
    enviandoRef.current = false;
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    showSuccess(r.yaEstabaAnulada ? "La verificación ya estaba anulada." : "Verificación anulada.");
    onHecho?.(r);
  };

  return (
    <SunmiModalLayout
      open
      title={acto ? `Anular verificación #${acto.id}` : "Anular verificación"}
      onClose={enviando ? () => {} : onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      // Es carga: el motivo escrito se perdería con un toque al costado.
      destructivo
      forma="hoja-o-centrado"
      espacioCuerpo="mt-2 gap-3"
    >
      <ContenidoAnular
        acto={acto}
        motivo={motivo}
        onMotivo={(t) => {
          setMotivo(t);
          setError("");
        }}
        onAnular={anular}
        onCancelar={onCerrar}
        enviando={enviando}
        error={error}
      />
    </SunmiModalLayout>
  );
}
