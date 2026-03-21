"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

function formatPrecio(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ResumenKpis({ resumen }) {
  if (!resumen) return null;

  const { ventaBruta, comisionTotal, netoRecibido, costoVendido, gananciaNeta, margenPct } =
    resumen;

  return (
    <SunmiCard className="p-3">
      <SunmiSeparator label="Resumen" />
      <p className="text-[11px] sunmi-text-muted mt-1 mb-2">
        Totales desde campos persistidos en <strong>Venta</strong> (mismo rango de fechas y local
        activo).
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <div className="sunmi-surface p-3 rounded-lg text-center">
          <div className="text-[10px] sunmi-text-muted">Venta bruta</div>
          <div className="text-lg font-bold tabular-nums">${formatPrecio(ventaBruta)}</div>
        </div>
        <div className="sunmi-surface p-3 rounded-lg text-center">
          <div className="text-[10px] sunmi-text-muted">Comisión total</div>
          <div className="text-lg font-bold tabular-nums sunmi-text-accent">
            ${formatPrecio(comisionTotal)}
          </div>
        </div>
        <div className="sunmi-surface p-3 rounded-lg text-center">
          <div className="text-[10px] sunmi-text-muted">Neto recibido</div>
          <div className="text-lg font-bold tabular-nums sunmi-text-success">
            ${formatPrecio(netoRecibido)}
          </div>
        </div>
        <div className="sunmi-surface p-3 rounded-lg text-center">
          <div className="text-[10px] sunmi-text-muted">Costo vendido</div>
          <div className="text-lg font-bold tabular-nums sunmi-text-muted">
            ${formatPrecio(costoVendido)}
          </div>
        </div>
        <div className={`${gananciaNeta < 0 ? "sunmi-state-danger" : "sunmi-state-success"} p-3 rounded-lg text-center`}>
          <div className={`text-[10px] ${gananciaNeta < 0 ? "sunmi-text-danger" : "sunmi-text-success"}`}>Ganancia neta</div>
          <div className={`text-lg font-bold tabular-nums ${gananciaNeta < 0 ? "sunmi-text-danger" : "sunmi-text-success"}`}>
            ${formatPrecio(gananciaNeta)}
          </div>
        </div>
        <div className="sunmi-surface p-3 rounded-lg text-center">
          <div className="text-[10px] sunmi-text-muted">Margen %</div>
          <div className="text-lg font-bold tabular-nums">
            {margenPct == null ? "—" : `${formatPrecio(margenPct)} %`}
          </div>
          <div className="text-[9px] sunmi-text-muted mt-0.5">Σ ganancia / Σ neto</div>
        </div>
      </div>
    </SunmiCard>
  );
}
