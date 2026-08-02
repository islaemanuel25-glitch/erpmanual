"use client";

import { useState, useEffect } from "react";
import { useOperadorContext } from "@/app/context/OperadorContext";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { evaluarRecepcionFondo } from "@/lib/caja/cierreCaja";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Apertura de caja con RECEPCIÓN del fondo.
 *
 * Antes se pedía "monto inicial en caja" con botones de $0 / $5.000 / $10.000, sin
 * ninguna relación con lo que había dejado el cierre anterior. Así el fondo real
 * del cajón y el declarado se separaban turno a turno, y esa diferencia se
 * acumulaba hasta aparecer como un sobrante enorme varios turnos después.
 *
 * Ahora la apertura muestra cuánto dejó el cierre anterior y pide confirmar
 * cuánto se recibió DE VERDAD. El turno arranca con lo recibido, no con lo
 * sugerido: si difiere, se pide una explicación en el momento, con la plata en la
 * mano y la persona presente.
 */
export default function ModalAperturaTurno({ localId, vendedorNombre, onApertura }) {
  const { requerirOperador } = useOperadorContext();
  const [montoInicial, setMontoInicial] = useState("");
  const [observacionFondo, setObservacionFondo] = useState("");
  const [estado, setEstado] = useState(null); // { fondoSugerido, cierrePrevio, cajaOcupada }
  const [cargando, setCargando] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/pos-ventas/turnos/abrir", { credentials: "include" });
        const d = await res.json();
        if (!vivo) return;
        if (d.ok) {
          setEstado(d);
          // Se precarga el sugerido para que el caso normal sea un solo toque,
          // pero el campo queda editable: el que manda es lo que el cajero cuenta.
          if (d.fondoSugerido > 0) setMontoInicial(String(d.fondoSugerido));
        }
      } catch {
        // Sin estado, la apertura sigue funcionando: se pide el monto a secas.
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const fondoSugerido = Number(estado?.fondoSugerido) || 0;
  const recepcion =
    montoInicial === ""
      ? { coincide: true, diferencia: 0, requiereObservacion: false, mensaje: null }
      : evaluarRecepcionFondo({ sugerido: fondoSugerido, recibido: Number(montoInicial) || 0 });

  const faltaObservacion = recepcion.requiereObservacion && !observacionFondo.trim();

  const handleApertura = async () => {
    if (montoInicial === "") {
      setError("Ingresá cuánto efectivo recibiste");
      return;
    }
    if (Number(montoInicial) < 0) {
      setError("El monto no puede ser negativo");
      return;
    }
    if (faltaObservacion) {
      setError("Contá de nuevo o explicá por qué el fondo no coincide");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/pos-ventas/turnos/abrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          localId,
          montoInicial: Number(montoInicial),
          observacionFondo: observacionFondo.trim() || null,
        }),
      });

      // Sin operario activo → modal de PIN encima (sin sacar del modal de turno).
      if (res.status === 428) {
        requerirOperador();
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Error al abrir turno");
        return;
      }

      onApertura(data.turno);
    } catch {
      setError("Error de conexion al abrir turno");
    } finally {
      setLoading(false);
    }
  };

  const ocupada = estado?.cajaOcupada;

  return (
    <div className="fixed inset-0 sunmi-overlay-strong flex items-center justify-center p-4 z-50 overflow-y-auto">
      <SunmiCard className="w-full max-w-md p-4 my-4">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold">Apertura de Caja</h2>
          <div className="text-sm sunmi-text-muted mt-1">
            {vendedorNombre} &bull; {new Date().toLocaleDateString("es-AR")}
          </div>
        </div>

        {cargando ? (
          <div className="text-center py-6 text-sm sunmi-text-muted">Consultando el cierre anterior...</div>
        ) : (
          <div className="space-y-3">
            {/* Caja ya abierta por otra persona: un cajón, un turno. */}
            {ocupada && (
              <div className="rounded-lg px-3 py-2 text-sm sunmi-state-danger sunmi-text-danger">
                {ocupada.esPropio
                  ? `Ya tenés una caja abierta (turno #${ocupada.turnoId}) desde el ${new Date(ocupada.apertura).toLocaleString("es-AR")}. Cerrala antes de abrir otra.`
                  : `${ocupada.vendedorNombre} tiene la caja abierta en este local (turno #${ocupada.turnoId}, desde el ${new Date(ocupada.apertura).toLocaleString("es-AR")}). Hay que cerrarla antes de abrir otra.`}
              </div>
            )}

            {/* Lo que dejó el cierre anterior */}
            <div className="sunmi-surface-soft rounded-lg p-3">
              {fondoSugerido > 0 ? (
                <>
                  <div className="text-sm font-bold">
                    El cierre anterior dejó ${formatPrecio(fondoSugerido)} en el cajón.
                  </div>
                  {estado?.cierrePrevio?.cerradoPor && (
                    <div className="text-[11px] sunmi-text-muted mt-0.5">
                      Turno #{estado.cierrePrevio.turnoId}, cerrado por {estado.cierrePrevio.cerradoPor}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm font-bold">
                  El cierre anterior no dejó fondo registrado en el cajón.
                </div>
              )}
              <div className="text-[12px] sunmi-text-muted mt-1">
                Contá la plata que hay ahora y confirmá cuánto recibiste de verdad.
              </div>
            </div>

            <div>
              <label className="text-sm sunmi-label mb-1 block font-semibold">
                ¿Cuánto efectivo recibiste realmente?
              </label>
              <SunmiInput
                type="number"
                step="0.01"
                min="0"
                value={montoInicial}
                onChange={(e) => setMontoInicial(e.target.value)}
                placeholder="0.00"
                className="text-2xl !text-center"
                autoFocus
              />
            </div>

            {/* Diferencia de recepción */}
            {montoInicial !== "" && !recepcion.coincide && (
              <div
                className="rounded-lg px-3 py-2"
                style={{ background: "color-mix(in srgb, var(--sunmi-warning, #f59e0b) 12%, transparent)", border: "1px solid var(--sunmi-warning, #f59e0b)" }}
              >
                <div className="text-sm font-bold">
                  {recepcion.diferencia > 0 ? "Recibiste de más" : "Recibiste de menos"}:{" "}
                  {recepcion.diferencia > 0 ? "+" : ""}${formatPrecio(recepcion.diferencia)}
                </div>
                <div className="text-[12px] sunmi-text-muted mt-0.5">{recepcion.mensaje}</div>
              </div>
            )}

            {recepcion.requiereObservacion && (
              <div>
                <label className="text-sm sunmi-label mb-1 block">
                  ¿Por qué no coincide? (obligatorio)
                </label>
                <textarea
                  value={observacionFondo}
                  onChange={(e) => setObservacionFondo(e.target.value)}
                  placeholder="Ej: el sobre traía 500 menos, lo avisé al encargado"
                  className="w-full sunmi-input text-sm resize-none"
                  rows={2}
                />
              </div>
            )}

            {error && (
              <div className="text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
                {error}
              </div>
            )}

            <SunmiButton
              color="amber"
              onClick={handleApertura}
              disabled={loading || montoInicial === "" || faltaObservacion || !!ocupada}
              className="!w-full min-h-14 !text-lg !font-bold"
            >
              {loading ? "Abriendo turno..." : "Abrir Turno"}
            </SunmiButton>
          </div>
        )}
      </SunmiCard>
    </div>
  );
}
