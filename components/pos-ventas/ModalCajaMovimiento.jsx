"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalCajaMovimiento({ turnoId, onClose, onSuccess }) {
  const router = useRouter();
  const [tipo, setTipo] = useState("INGRESO");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const handleGuardar = async () => {
    setError("");
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      setError("Monto debe ser mayor a 0");
      return;
    }

    if (!motivo.trim()) {
      setError("Motivo es obligatorio");
      return;
    }

    setGuardando(true);
    try {
      const res = await fetch("/api/pos-ventas/caja-movimientos/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ turnoId, tipo, monto: montoNum, motivo: motivo.trim() }),
      });

      // Sin operario activo → bloqueo de operario (parejo con la pantalla de venta).
      if (res.status === 428) {
        router.replace("/bloqueo-operador");
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Error al registrar movimiento");
        return;
      }
      onSuccess?.(data.item);
      onClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="sunmi-pos-panel rounded-xl shadow-2xl w-full max-w-md mx-4 p-5 space-y-4">
        <h2 className="text-lg font-bold sunmi-pos-text-accent text-center">
          Movimiento de Caja
        </h2>

        {/* Tipo: INGRESO / RETIRO */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo("INGRESO")}
            className={`py-3 rounded-lg text-sm font-bold transition-colors ${
              tipo === "INGRESO"
                ? "bg-green-600 text-white"
                : "sunmi-pos-btn-secondary"
            }`}
          >
            + INGRESO
          </button>
          <button
            type="button"
            onClick={() => setTipo("RETIRO")}
            className={`py-3 rounded-lg text-sm font-bold transition-colors ${
              tipo === "RETIRO"
                ? "bg-red-600 text-white"
                : "sunmi-pos-btn-secondary"
            }`}
          >
            - RETIRO
          </button>
        </div>

        {/* Monto */}
        <div>
          <label className="text-xs sunmi-pos-muted mb-1 block">Monto ($)</label>
          <SunmiInput
            type="number"
            min="0"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            autoFocus
            className="text-xl font-bold text-center"
          />
        </div>

        {/* Motivo */}
        <div>
          <label className="text-xs sunmi-pos-muted mb-1 block">Motivo <span className="text-red-400">*</span></label>
          <SunmiInput
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: cambio, pago proveedor..."
          />
        </div>

        {error && (
          <div className="text-xs text-red-500 text-center">{error}</div>
        )}

        {/* Botones */}
        <div className="flex gap-2">
          <SunmiButton
            color="slate"
            onClick={onClose}
            disabled={guardando}
            className="flex-1"
          >
            Cancelar
          </SunmiButton>
          <SunmiButton
            color={tipo === "INGRESO" ? "green" : "red"}
            onClick={handleGuardar}
            disabled={guardando || !monto || !motivo.trim()}
            className="flex-1"
          >
            {guardando
              ? "Guardando..."
              : tipo === "INGRESO"
              ? "Registrar Ingreso"
              : "Registrar Retiro"}
          </SunmiButton>
        </div>
      </div>
    </div>
  );
}
