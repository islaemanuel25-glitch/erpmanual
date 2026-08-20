"use client";

// Vista de reportes AGRUPADA POR CLIENTE. Un bloque por cliente (acordeón) con
// nombre, total comprado, cantidad de tickets y última compra; al expandir muestra
// el sublistado de tickets con "Ver venta" (navega a la página de detalle).
// NO fusiona tickets ni modifica ventas — solo presentación.

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCant = (n) => { const x = Number(n); return Number.isInteger(x) ? x.toLocaleString("es-AR") : x.toLocaleString("es-AR", { maximumFractionDigits: 3 }); };
function fmtFecha(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  // Ya declaraba la zona; le faltaba `hour12: false`. Del helper único.
  return fechaHoraAR(d);
}

const ORDENES = [
  { v: "total_desc", label: "Mayor total" },
  { v: "total_asc", label: "Menor total" },
  { v: "tickets_desc", label: "Más tickets" },
  { v: "reciente", label: "Más reciente" },
  { v: "nombre_asc", label: "Nombre A-Z" },
];

export default function ReporteVentasPorCliente({ filtros, onVerTicket }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientes, setClientes] = useState(null);
  const [totales, setTotales] = useState(null);
  const [orden, setOrden] = useState("total_desc");
  const [abierto, setAbierto] = useState(() => new Set()); // keys de tarjetas expandidas

  useEffect(() => {
    if (!filtros?.fechaDesde || !filtros?.fechaHasta) return;
    let vivo = true;
    (async () => {
      setLoading(true); setError("");
      const params = new URLSearchParams({ fechaDesde: filtros.fechaDesde, fechaHasta: filtros.fechaHasta, orden });
      if (filtros.localId) params.set("localId", String(filtros.localId));
      if (filtros.formaPago) params.set("formaPago", filtros.formaPago);
      try {
        const res = await fetch(`/api/reportes-ventas/por-cliente?${params}`, { credentials: "include" });
        const d = await res.json();
        if (!vivo) return;
        if (d.ok) { setClientes(d.clientes || []); setTotales(d.totales || null); }
        else setError(d.error || "No se pudo cargar la vista por cliente.");
      } catch {
        if (vivo) setError("Error de conexión.");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [filtros, orden]);

  const toggle = (key) => setAbierto((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const keyDe = (c) => (c.clienteId == null ? "cf" : `c:${c.clienteId}`);

  return (
    <div className="space-y-3">
      {/* Orden + totales del período */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] sunmi-text-muted">Ordenar por</span>
          {ORDENES.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setOrden(o.v)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${orden === o.v ? "sunmi-pill-link" : "sunmi-surface-soft sunmi-text-muted hover:sunmi-text-strong"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {totales && (
          <div className="text-[11px] sunmi-text-muted">
            <span className="sunmi-text-strong font-semibold">{totales.clientes}</span> cliente{totales.clientes === 1 ? "" : "s"} ·{" "}
            <span className="sunmi-text-strong font-semibold">{totales.tickets}</span> ticket{totales.tickets === 1 ? "" : "s"} ·{" "}
            total <span className="sunmi-text-strong font-semibold tabular-nums">{money(totales.total)}</span>
          </div>
        )}
      </div>

      {loading && <div className="text-center py-6"><SunmiLoader /></div>}
      {!loading && error && <div className="text-[12px] sunmi-text-danger sunmi-state-danger rounded px-2 py-1.5">{error}</div>}
      {!loading && !error && clientes && clientes.length === 0 && (
        <div className="text-center py-8 sunmi-text-muted text-sm">No hay ventas en el período seleccionado</div>
      )}

      <div className="space-y-2">
        {!loading && !error && (clientes || []).map((c) => {
          const key = keyDe(c);
          const exp = abierto.has(key);
          return (
            <div key={key} className={`sunmi-surface sunmi-border rounded-xl overflow-hidden transition-shadow ${exp ? "shadow-md" : ""}`}>
              {/* Cabecera del cliente (clic = expandir/colapsar) */}
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-expanded={exp}
                className="w-full text-left p-3 flex items-center justify-between gap-3 sunmi-row-hover transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`shrink-0 grid place-items-center w-8 h-8 rounded-lg sunmi-surface-soft sunmi-text-link transition-transform duration-200 ${exp ? "rotate-180" : ""}`}>
                    <ChevronDown size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold sunmi-text-strong truncate leading-tight">
                      {c.nombre}
                      {c.documento ? <span className="sunmi-text-muted ml-1 text-[11px] font-normal">({c.documento})</span> : null}
                      {c.clienteId == null ? <span className="sunmi-text-muted ml-1 text-[11px] font-normal">(sin cliente)</span> : null}
                    </div>
                    <div className="text-[11px] sunmi-text-muted mt-0.5">
                      {c.tickets} ticket{c.tickets === 1 ? "" : "s"} · {fmtCant(c.unidadesTotales)} u · última {fmtFecha(c.ultimaCompra)}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[15px] sunmi-text-strong tabular-nums leading-tight">{money(c.totalAcumulado)}</div>
                  <div className="text-[10px] sunmi-text-link font-medium">
                    {exp ? "Ocultar tickets" : `Ver ${c.tickets} ticket${c.tickets === 1 ? "" : "s"}`}
                  </div>
                </div>
              </button>

              {/* Acordeón: desglose de pagos + tickets originales */}
              {exp && (
                <div className="border-t sunmi-divider sunmi-surface-soft">
                  {c.pagos?.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pt-2 text-[11px] sunmi-text-muted">
                      {c.pagos.map((p) => (
                        <span key={p.medio}>{p.label} <span className="tabular-nums sunmi-text-strong">{money(p.monto)}</span></span>
                      ))}
                    </div>
                  )}
                  <div className="p-2 space-y-1">
                    {c.ventas.map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 sunmi-surface sunmi-row-hover transition-colors">
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-[12px] sunmi-text-strong">#{v.numero ?? v.id}</span>
                          <span className="sunmi-text-muted text-[11px]">{fmtFecha(v.fecha)}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${v.estado === "fiado" ? "sunmi-state-warning sunmi-text-accent" : "sunmi-state-success sunmi-text-success"}`}>
                            {v.estado === "fiado" ? "Pendiente" : "Cobrado"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="tabular-nums font-mono font-semibold text-[13px] sunmi-text-strong">{money(v.total)}</span>
                          <SunmiButton color="amber" onClick={() => onVerTicket && onVerTicket(v.id)} className="text-[11px] px-2.5 py-1">Ver venta</SunmiButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
