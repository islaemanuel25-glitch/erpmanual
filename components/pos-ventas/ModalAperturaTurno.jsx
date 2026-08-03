"use client";

import { useState, useEffect } from "react";
import { useOperadorContext } from "@/app/context/OperadorContext";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

/**
 * Apertura de caja: el cajero declara cuánto efectivo recibió.
 *
 * La herencia automática del fondo entre turnos está DESACTIVADA. Mientras un
 * local pueda tener varios cajeros trabajando a la vez, el sistema no sabe qué
 * cierre corresponde a qué cajón físico: ofrecerle a uno el fondo que dejó otro
 * sería adivinar, y esa plata aparecería o faltaría en el arqueo equivocado.
 * Vuelve cuando exista CajaFisica.
 *
 * Lo único que impide abrir es tener YA un turno propio abierto en este local.
 * Que haya otros cajeros trabajando se informa, no bloquea.
 */
export default function ModalAperturaTurno({ localId, vendedorNombre, onApertura }) {
  const { requerirOperador } = useOperadorContext();
  const [montoInicial, setMontoInicial] = useState("");
  const [observacionFondo, setObservacionFondo] = useState("");
  const [estado, setEstado] = useState(null);
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
        if (d.ok) setEstado(d);
      } catch {
        // Sin estado, la apertura sigue funcionando: se pide el monto a secas.
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const otrosTurnos = estado?.otrosTurnosAbiertos || [];
  const turnoPropio = estado?.turnoPropioAbierto || null;

  const handleApertura = async () => {
    if (montoInicial === "") {
      setError("Ingresá cuánto efectivo recibiste para comenzar");
      return;
    }
    if (Number(montoInicial) < 0) {
      setError("El monto no puede ser negativo");
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
          <div className="text-center py-6 text-sm sunmi-text-muted">Cargando…</div>
        ) : (
          <div className="space-y-3">
            {/* ÚNICO caso bloqueante: este mismo usuario ya tiene su caja abierta. */}
            {turnoPropio && (
              <div className="rounded-lg px-3 py-2 text-sm sunmi-state-danger sunmi-text-danger">
                Ya tenés un turno abierto en este local (#{turnoPropio.turnoId}) desde el{" "}
                {new Date(turnoPropio.apertura).toLocaleString("es-AR")}. Cerralo antes de abrir otro.
              </div>
            )}

            {/* Informativo: otros cajeros trabajando. NO impide abrir. */}
            {!turnoPropio && otrosTurnos.length > 0 && (
              <div className="rounded-lg px-3 py-2 sunmi-surface-soft">
                <div className="text-sm font-bold">Hay otros turnos abiertos en este local.</div>
                <div className="text-[12px] sunmi-text-muted mt-0.5">
                  {otrosTurnos.map((t) => `${t.vendedorNombre} (#${t.turnoId})`).join(" · ")}
                </div>
                <div className="text-[12px] sunmi-text-muted mt-1">
                  Podés abrir el tuyo igual. Cada turno lleva sus propias ventas y su propio arqueo.
                </div>
              </div>
            )}

            {/* Riesgo operativo real: cajón compartido. Avisa, no bloquea. */}
            <div
              className="rounded-lg px-3 py-2"
              style={{
                background: "color-mix(in srgb, var(--sunmi-warning, #f59e0b) 12%, transparent)",
                border: "1px solid var(--sunmi-warning, #f59e0b)",
              }}
            >
              <div className="text-[12px] leading-snug">
                Cada turno debe trabajar con su propio cajón o dinero separado. Si comparten
                efectivo, los arqueos pueden mostrar diferencias incorrectas.
              </div>
            </div>

            <div>
              <label className="text-sm sunmi-label mb-1 block font-semibold">
                ¿Cuánto efectivo recibiste para comenzar?
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
                disabled={!!turnoPropio}
              />
              <div className="text-[11px] sunmi-text-muted mt-1 text-center">
                Contá la plata con la que arrancás. No se hereda del cierre anterior.
              </div>
            </div>

            <div>
              <label className="text-sm sunmi-label mb-1 block">Observación (opcional)</label>
              <textarea
                value={observacionFondo}
                onChange={(e) => setObservacionFondo(e.target.value)}
                placeholder="Ej: me lo entregó el encargado"
                className="w-full sunmi-input text-sm resize-none"
                rows={2}
                disabled={!!turnoPropio}
              />
            </div>

            {error && (
              <div className="text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
                {error}
              </div>
            )}

            <SunmiButton
              color="amber"
              onClick={handleApertura}
              disabled={loading || montoInicial === "" || !!turnoPropio}
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
