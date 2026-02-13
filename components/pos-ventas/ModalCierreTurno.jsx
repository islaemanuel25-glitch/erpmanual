"use client";

import { useState, useEffect } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ModalCierreTurno({ turno, onCerrar, onCerrado }) {
  const [montoReal, setMontoReal] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(
          `/api/pos-ventas/turnos/resumen?turnoId=${turno.id}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok) setResumen(data);
      } catch {
        console.error("Error cargando resumen");
      }
    };
    cargar();
  }, [turno.id]);

  const handleCierre = async () => {
    if (!montoReal) {
      setError("Ingresa el monto real contado en caja");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/pos-ventas/turnos/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          turnoId: turno.id,
          montoRealEfectivo: Number(montoReal),
          observaciones,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Error al cerrar turno");
        return;
      }

      onCerrado(data.turno);
    } catch {
      setError("Error de conexion al cerrar turno");
    } finally {
      setLoading(false);
    }
  };

  if (!resumen) {
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
        <SunmiCard className="w-full max-w-md p-4 text-center py-8">
          <span className="text-sm text-slate-400">
            Cargando resumen del turno...
          </span>
        </SunmiCard>
      </div>
    );
  }

  const esperado =
    Number(turno.montoInicial) + Number(resumen.totalEfectivo);
  const diferencia = montoReal ? Number(montoReal) - esperado : 0;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <SunmiCard className="w-full max-w-lg p-4 my-4">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold">Cierre de Caja</h2>
          <div className="text-sm text-slate-400 mt-1">
            Turno #{turno.id} &bull;{" "}
            {new Date(turno.apertura).toLocaleString("es-AR")}
          </div>
        </div>

        {/* Resumen del turno */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-slate-800/60 p-3 rounded-lg text-center">
            <div className="text-[10px] text-slate-400">Ventas</div>
            <div className="text-xl font-bold text-cyan-400">
              {resumen.cantidadVentas}
            </div>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-lg text-center">
            <div className="text-[10px] text-slate-400">Efectivo</div>
            <div className="text-xl font-bold text-emerald-400">
              ${formatPrecio(resumen.totalEfectivo)}
            </div>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-lg text-center">
            <div className="text-[10px] text-slate-400">Digital</div>
            <div className="text-xl font-bold text-amber-400">
              ${formatPrecio(resumen.totalDigital)}
            </div>
          </div>
        </div>

        {/* Desglose digital */}
        {Number(resumen.totalDigital) > 0 && (
          <div className="bg-slate-800/40 p-2 rounded-lg mb-4 text-xs text-slate-400 flex justify-around">
            {Number(resumen.desglose.mercadopago) > 0 && (
              <span>MP: ${formatPrecio(resumen.desglose.mercadopago)}</span>
            )}
            {Number(resumen.desglose.debito) > 0 && (
              <span>Debito: ${formatPrecio(resumen.desglose.debito)}</span>
            )}
            {Number(resumen.desglose.credito) > 0 && (
              <span>Credito: ${formatPrecio(resumen.desglose.credito)}</span>
            )}
          </div>
        )}

        {/* Detalle efectivo esperado */}
        <div className="bg-slate-800/40 p-3 rounded-lg mb-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Monto inicial</span>
            <span>${formatPrecio(turno.montoInicial)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">+ Ventas efectivo</span>
            <span className="text-emerald-400">
              +${formatPrecio(resumen.totalEfectivo)}
            </span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t border-slate-700 pt-1">
            <span>Efectivo esperado</span>
            <span className="text-amber-400">${formatPrecio(esperado)}</span>
          </div>
        </div>

        {/* Input monto real */}
        <div className="mb-3">
          <label className="text-sm text-slate-300 mb-1 block font-semibold">
            Monto REAL contado en caja (efectivo)
          </label>
          <SunmiInput
            type="number"
            step="0.01"
            min="0"
            value={montoReal}
            onChange={(e) => setMontoReal(e.target.value)}
            placeholder="0.00"
            className="text-2xl !text-center"
            autoFocus
          />
        </div>

        {/* Diferencia */}
        {montoReal && (
          <div
            className={`p-3 rounded-lg mb-3 text-center ${
              Math.abs(diferencia) < 0.01
                ? "bg-emerald-500/20 border border-emerald-500/50"
                : diferencia > 0
                ? "bg-blue-500/20 border border-blue-500/50"
                : "bg-red-500/20 border border-red-500/50"
            }`}
          >
            <div className="text-xs mb-1">
              {Math.abs(diferencia) < 0.01
                ? "Caja cuadrada"
                : diferencia > 0
                ? "Sobrante"
                : "Faltante"}
            </div>
            <div
              className={`text-3xl font-bold ${
                Math.abs(diferencia) < 0.01
                  ? "text-emerald-400"
                  : diferencia > 0
                  ? "text-blue-400"
                  : "text-red-400"
              }`}
            >
              {diferencia > 0 ? "+" : ""}${formatPrecio(diferencia)}
            </div>
          </div>
        )}

        {/* Observaciones */}
        <div className="mb-3">
          <label className="text-sm text-slate-300 mb-1 block">
            Observaciones (opcional)
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ej: Faltante por error en vuelto..."
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm resize-none"
            rows={2}
          />
        </div>

        {error && (
          <div className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5 mb-3">
            {error}
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-2">
          <SunmiButton
            color="slate"
            onClick={onCerrar}
            disabled={loading}
            className="flex-1 !py-3"
          >
            Cancelar
          </SunmiButton>
          <SunmiButton
            color="amber"
            onClick={handleCierre}
            disabled={loading || !montoReal}
            className="flex-1 !py-3 !font-bold"
          >
            {loading ? "Cerrando..." : "Cerrar Turno"}
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
