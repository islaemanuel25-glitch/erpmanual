"use client";

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function ModalAperturaTurno({
  localId,
  vendedorNombre,
  onApertura,
}) {
  const [montoInicial, setMontoInicial] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleApertura = async () => {
    if (!montoInicial && montoInicial !== "0") {
      setError("Ingresa el monto inicial en caja");
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
        }),
      });

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
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-md p-4">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold">Apertura de Caja</h2>
          <div className="text-sm text-slate-400 mt-1">
            {vendedorNombre} &bull;{" "}
            {new Date().toLocaleDateString("es-AR")}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-slate-300 mb-1 block">
              Monto inicial en caja
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
            <div className="text-[11px] text-slate-500 mt-1 text-center">
              Efectivo que hay en caja al iniciar el turno
            </div>
          </div>

          {/* Montos rapidos */}
          <div className="grid grid-cols-3 gap-2">
            {[0, 5000, 10000].map((monto) => (
              <SunmiButton
                key={monto}
                color={Number(montoInicial) === monto ? "amber" : "cyan"}
                onClick={() => setMontoInicial(String(monto))}
                className="!text-sm !py-2"
              >
                ${monto.toLocaleString()}
              </SunmiButton>
            ))}
          </div>

          {error && (
            <div className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <SunmiButton
            color="amber"
            onClick={handleApertura}
            disabled={loading || (!montoInicial && montoInicial !== "0")}
            className="!w-full min-h-14 !text-lg !font-bold"
          >
            {loading ? "Abriendo turno..." : "Abrir Turno"}
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
