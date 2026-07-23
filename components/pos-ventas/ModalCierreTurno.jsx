"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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

      // Sin operario activo → bloqueo de operario (parejo con la pantalla de venta).
      if (res.status === 428) {
        router.replace("/bloqueo-operador");
        return;
      }

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
      <div className="fixed inset-0 sunmi-pos-overlay flex items-center justify-center p-4 z-50">
        <SunmiCard className="w-full max-w-md p-4 text-center py-8">
          <span className="text-sm sunmi-pos-muted">
            Cargando resumen del turno...
          </span>
        </SunmiCard>
      </div>
    );
  }

  const totalIngresos = Number(resumen.totalIngresosCaja) || 0;
  const totalRetiros = Number(resumen.totalRetirosCaja) || 0;
  const esperado =
    Number(turno.montoInicial) + Number(resumen.totalEfectivo) + totalIngresos - totalRetiros;
  const diferencia = montoReal ? Number(montoReal) - esperado : 0;

  return (
    <div className="fixed inset-0 sunmi-pos-overlay flex items-center justify-center p-4 z-50 overflow-y-auto">
      <SunmiCard className="w-full max-w-lg p-4 my-4">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold">Cierre de Caja</h2>
          <div className="text-sm sunmi-pos-muted mt-1">
            Turno #{turno.id} &bull;{" "}
            {new Date(turno.apertura).toLocaleString("es-AR")}
          </div>
        </div>

        {/* Resumen del turno */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="sunmi-pos-bg-surface p-3 rounded-lg text-center">
            <div className="text-[10px] sunmi-pos-muted">Ventas</div>
            <div className="text-xl font-bold sunmi-pos-text-accent">
              {resumen.cantidadVentas}
            </div>
          </div>
          <div className="sunmi-pos-bg-surface p-3 rounded-lg text-center">
            <div className="text-[10px] sunmi-pos-muted">Efectivo</div>
            <div className="text-xl font-bold sunmi-pos-text-success">
              ${formatPrecio(resumen.totalEfectivo)}
            </div>
          </div>
          <div className="sunmi-pos-bg-surface p-3 rounded-lg text-center">
            <div className="text-[10px] sunmi-pos-muted">Digital</div>
            <div className="text-xl font-bold sunmi-pos-text-accent">
              ${formatPrecio(resumen.totalDigital)}
            </div>
          </div>
        </div>

        {/* Desglose digital + comisiones */}
        {Number(resumen.totalDigital) > 0 && (
          <div className="sunmi-pos-panel p-2 rounded-lg mb-4 space-y-1">
            <div className="text-xs sunmi-pos-muted flex justify-around">
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
            {Number(resumen.totalComision) > 0 && (
              <div className="text-xs sunmi-pos-muted flex justify-between border-t pt-1 mt-1" style={{ borderColor: 'var(--pos-panel-border)' }}>
                <span>Comision bancaria:</span>
                <span className="sunmi-pos-text-danger">-${formatPrecio(resumen.totalComision)}</span>
              </div>
            )}
            {Number(resumen.netoDigital) > 0 && (
              <div className="text-xs flex justify-between">
                <span className="sunmi-pos-muted">Neto digital:</span>
                <span className="sunmi-pos-text-accent font-semibold">${formatPrecio(resumen.netoDigital)}</span>
              </div>
            )}
          </div>
        )}

        {/* Detalle efectivo esperado */}
        <div className="sunmi-pos-panel p-3 rounded-lg mb-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="sunmi-pos-muted">Monto inicial</span>
            <span>${formatPrecio(turno.montoInicial)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="sunmi-pos-muted">+ Ventas efectivo</span>
            <span className="sunmi-pos-text-success">
              +${formatPrecio(resumen.totalEfectivo)}
            </span>
          </div>
          {totalIngresos > 0 && (
            <div className="flex justify-between text-sm">
              <span className="sunmi-pos-muted">+ Ingresos caja</span>
              <span className="sunmi-pos-text-success">
                +${formatPrecio(totalIngresos)}
              </span>
            </div>
          )}
          {totalRetiros > 0 && (
            <div className="flex justify-between text-sm">
              <span className="sunmi-pos-muted">- Retiros caja</span>
              <span className="sunmi-pos-text-danger">
                -${formatPrecio(totalRetiros)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold border-t pt-1" style={{ borderColor: 'var(--pos-panel-border)' }}>
            <span>Efectivo esperado</span>
            <span className="sunmi-pos-text-accent">${formatPrecio(esperado)}</span>
          </div>
        </div>

        {/* Input monto real */}
        <div className="mb-3">
          <label className="text-sm sunmi-pos-muted mb-1 block font-semibold">
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
                ? "sunmi-pos-panel"
                : diferencia > 0
                ? "sunmi-pos-panel"
                : ""
            }`}
            style={Math.abs(diferencia) >= 0.01 && diferencia <= 0 ? { background: 'color-mix(in srgb, var(--pos-danger) 15%, transparent)', border: '1px solid var(--pos-danger)' } : undefined}
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
                  ? "sunmi-pos-text-success"
                  : diferencia > 0
                  ? "sunmi-pos-text-accent"
                  : "sunmi-pos-text-danger"
              }`}
            >
              {diferencia > 0 ? "+" : ""}${formatPrecio(diferencia)}
            </div>
          </div>
        )}

        {/* Observaciones */}
        <div className="mb-3">
          <label className="text-sm sunmi-pos-muted mb-1 block">
            Observaciones (opcional)
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ej: Faltante por error en vuelto..."
            className="w-full sunmi-input text-sm resize-none"
            rows={2}
          />
        </div>

        {error && (
          <div className="text-xs sunmi-pos-text-danger text-center rounded px-2 py-1.5 mb-3" style={{ background: 'color-mix(in srgb, var(--pos-danger) 10%, transparent)', border: '1px solid var(--pos-danger)' }}>
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
