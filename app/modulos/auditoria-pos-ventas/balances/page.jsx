"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { useAuditoriaBalances } from "@/hooks/useAuditoriaBalances";
import SinPermisos from "@/components/auth/SinPermisos";

import ResumenKpis from "@/components/auditoria-pos-ventas/ResumenKpis";
import TablaMediosPago from "@/components/auditoria-pos-ventas/TablaMediosPago";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

function fmt(n) {
  return Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function VariacionBadge({ valor, sufijo = "%" }) {
  if (valor == null) return <span className="text-[10px] sunmi-text-muted">—</span>;
  const v = Number(valor);
  if (v === 0) return <span className="text-[10px] sunmi-text-muted">0{sufijo}</span>;
  const cls = v > 0 ? "sunmi-text-success" : "sunmi-text-danger";
  return <span className={`text-[10px] font-semibold ${cls}`}>{v > 0 ? "+" : ""}{fmt(v)}{sufijo}</span>;
}

const LABELS_MEDIO = {
  efectivo: "Efectivo", debito: "Débito", credito: "Crédito",
  mercadopago: "Mercado Pago", fiado: "Fiado", otros: "Otros",
};

function ComparacionPanel({ comparacion }) {
  if (!comparacion || !comparacion.rangoB) return null;

  const { rangoA, rangoB, variacion } = comparacion;

  const filas = [
    { label: "Tickets", a: rangoA.totalTickets, b: rangoB.totalTickets, var: variacion?.ticketsPct },
    { label: "Venta bruta", a: `$${fmt(rangoA.ventaBruta)}`, b: `$${fmt(rangoB.ventaBruta)}`, var: variacion?.ventaBrutaPct },
    { label: "Ganancia", a: `$${fmt(rangoA.ganancia)}`, b: `$${fmt(rangoB.ganancia)}`, var: variacion?.gananciaPct },
    { label: "Ticket prom.", a: rangoA.ticketPromedio != null ? `$${fmt(rangoA.ticketPromedio)}` : "—", b: rangoB.ticketPromedio != null ? `$${fmt(rangoB.ticketPromedio)}` : "—", var: variacion?.ticketPromedioPct },
    { label: "Comisión", a: `$${fmt(rangoA.comision)}`, b: `$${fmt(rangoB.comision)}` },
    { label: "Neto", a: `$${fmt(rangoA.neto)}`, b: `$${fmt(rangoB.neto)}` },
    { label: "Costo", a: `$${fmt(rangoA.costo)}`, b: `$${fmt(rangoB.costo)}` },
    { label: "Margen", a: rangoA.margenPct != null ? `${fmt(rangoA.margenPct)}%` : "—", b: rangoB.margenPct != null ? `${fmt(rangoB.margenPct)}%` : "—" },
  ];

  // Comparación por medio de pago
  const mediosA = rangoA.medios || [];
  const mediosB = rangoB.medios || [];
  const medioBMap = new Map();
  for (const m of mediosB) medioBMap.set(m.medio, m);

  const mediosConMovimiento = mediosA.filter((m) => {
    const b = medioBMap.get(m.medio);
    return m.bruto !== 0 || m.ganancia !== 0 || (b && (b.bruto !== 0 || b.ganancia !== 0));
  });

  return (
    <>
      <SunmiCard className="p-0 overflow-hidden">
        <div className="px-4 py-2 sunmi-surface rounded-t-lg">
          <span className="text-[11px] sm:text-xs font-semibold sunmi-text-accent">
            Comparación global
          </span>
        </div>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[11px] sm:text-xs">
            <thead>
              <tr className="sunmi-thead">
                <th className="text-left px-2 py-1.5 font-semibold">Métrica</th>
                <th className="text-right px-2 py-1.5 font-semibold">Rango actual</th>
                <th className="text-right px-2 py-1.5 font-semibold">Rango anterior</th>
                <th className="text-right px-2 py-1.5 font-semibold">Variación</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.label} className="hover:bg-[var(--hover-bg)]">
                  <td className="px-2 py-1.5 font-medium">{f.label}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{f.a}</td>
                  <td className="px-2 py-1.5 text-right font-mono sunmi-text-muted">{f.b}</td>
                  <td className="px-2 py-1.5 text-right">
                    {f.var != null ? <VariacionBadge valor={f.var} /> : <span className="sunmi-text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SunmiCard>

      {mediosConMovimiento.length > 0 && (
        <SunmiCard className="p-0 overflow-hidden">
          <div className="px-4 py-2 sunmi-surface rounded-t-lg">
            <span className="text-[11px] sm:text-xs font-semibold sunmi-text-accent">
              Comparación por medio de pago
            </span>
          </div>
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-[11px] sm:text-xs">
              <thead>
                <tr className="sunmi-thead">
                  <th className="text-left px-2 py-1.5 font-semibold">Medio</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Bruto actual</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Bruto anterior</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Var.</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Ganancia actual</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Ganancia anterior</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Var.</th>
                </tr>
              </thead>
              <tbody>
                {mediosConMovimiento.map((mA) => {
                  const mB = medioBMap.get(mA.medio) || { bruto: 0, ganancia: 0 };
                  const varBruto = mB.bruto !== 0 ? ((mA.bruto - mB.bruto) / Math.abs(mB.bruto) * 100) : (mA.bruto !== 0 ? null : 0);
                  const varGan = mB.ganancia !== 0 ? ((mA.ganancia - mB.ganancia) / Math.abs(mB.ganancia) * 100) : (mA.ganancia !== 0 ? null : 0);
                  return (
                    <tr key={mA.medio} className="hover:bg-[var(--hover-bg)]">
                      <td className="px-2 py-1.5 font-medium">{LABELS_MEDIO[mA.medio] || mA.medio}</td>
                      <td className="px-2 py-1.5 text-right font-mono">${fmt(mA.bruto)}</td>
                      <td className="px-2 py-1.5 text-right font-mono sunmi-text-muted">${fmt(mB.bruto)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <VariacionBadge valor={varBruto != null ? Number(varBruto.toFixed(2)) : null} />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">${fmt(mA.ganancia)}</td>
                      <td className="px-2 py-1.5 text-right font-mono sunmi-text-muted">${fmt(mB.ganancia)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <VariacionBadge valor={varGan != null ? Number(varGan.toFixed(2)) : null} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SunmiCard>
      )}
    </>
  );
}

export default function AuditoriaBalancesPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [comparar, setComparar] = useState(false);
  const [fechaDesde2, setFechaDesde2] = useState("");
  const [fechaHasta2, setFechaHasta2] = useState("");

  const { loading, error, resumen, medios, comparacion, cargar } = useAuditoriaBalances();

  useEffect(() => {
    const hoy = hoyArgentinaISO();
    setFechaDesde(hoy);
    setFechaHasta(hoy);
  }, []);

  const ejecutarConsulta = useCallback(() => {
    cargar(fechaDesde, fechaHasta, comparar ? fechaDesde2 : null, comparar ? fechaHasta2 : null);
  }, [cargar, fechaDesde, fechaHasta, comparar, fechaDesde2, fechaHasta2]);

  if (!perfil || cargandoUsuario) return null;
  if (loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("reportes.ver")) {
    return <SinPermisos />;
  }

  const localNombre = contexto?.nombre || "";
  const rangoLabel = fechaDesde && fechaHasta && resumen ? `${fechaDesde} → ${fechaHasta}` : "";

  return (
    <div className="p-2 lg:p-3 space-y-2 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold leading-tight">Balances</h1>
          <p className="text-[11px] sunmi-text-muted">
            {localNombre || "—"}
            {rangoLabel && <span className="ml-1">· {rangoLabel}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SunmiBackButton href="/modulos/auditoria-pos-ventas" />
          <div className="flex flex-wrap items-end justify-end gap-1.5">
            <div>
              <label className="text-[9px] sunmi-text-muted mb-0.5 block">Desde</label>
              <SunmiInput type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="!py-1 text-xs !border !border-[var(--pos-link)]" />
            </div>
            <div>
              <label className="text-[9px] sunmi-text-muted mb-0.5 block">Hasta</label>
              <SunmiInput type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="!py-1 text-xs !border !border-[var(--pos-link)]" />
            </div>
            <SunmiButton color="amber" onClick={ejecutarConsulta} disabled={loading} className="!py-1 text-xs">
              {loading ? "Cargando..." : "Consultar"}
            </SunmiButton>
          </div>
        </div>
      </div>

      {/* Toggle comparación */}
      <div className="space-y-2">
        <button
          onClick={() => setComparar(!comparar)}
          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
            comparar
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "sunmi-surface sunmi-text-muted hover:sunmi-text-primary"
          }`}
        >
          <span className={`inline-block w-2 h-2 rounded-full transition-colors ${comparar ? "bg-white" : "bg-current opacity-40"}`} />
          {comparar ? "Comparando con rango anterior" : "Comparar con otro período"}
        </button>
        {comparar && (
          <div className="flex flex-wrap items-end gap-1.5 pl-1 border-l-2 border-[var(--accent)] ml-1">
            <div>
              <label className="text-[9px] sunmi-text-muted mb-0.5 block">Desde (ant.)</label>
              <SunmiInput type="date" value={fechaDesde2} onChange={(e) => setFechaDesde2(e.target.value)} className="!py-1 text-xs !border !border-[var(--pos-link)]" />
            </div>
            <div>
              <label className="text-[9px] sunmi-text-muted mb-0.5 block">Hasta (ant.)</label>
              <SunmiInput type="date" value={fechaHasta2} onChange={(e) => setFechaHasta2(e.target.value)} className="!py-1 text-xs !border !border-[var(--pos-link)]" />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">{error}</div>
      )}

      {loading && <div className="text-center py-10"><SunmiLoader /></div>}

      {!loading && resumen && (
        <>
          <ResumenKpis resumen={resumen} />

          {comparacion && comparacion.rangoB && (
            <ComparacionPanel comparacion={comparacion} />
          )}

          <SunmiCard className="p-0 overflow-hidden">
            <div className="px-4 py-2 sunmi-surface rounded-t-lg">
              <span className="text-[11px] sm:text-xs font-semibold sunmi-text-accent">
                Desglose por medio de pago
              </span>
            </div>
            <div className="p-3">
              <TablaMediosPago items={medios} />
            </div>
          </SunmiCard>
        </>
      )}

      {!loading && !resumen && !error && (
        <SunmiCard className="p-3">
          <p className="text-center py-4 sunmi-text-muted text-sm">
            Seleccioná un rango de fechas y pulsá <strong>Consultar</strong> para auditar los datos.
          </p>
        </SunmiCard>
      )}
    </div>
  );
}
