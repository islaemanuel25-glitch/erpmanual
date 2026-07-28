"use client";

// Vista de reportes AGRUPADA POR CLIENTE. Una tarjeta por cliente con tickets,
// total, unidades, última compra y desglose de pagos; acordeón con los tickets
// originales y "Ver ticket" (abre el modal de detalle con Reimprimir/PDF/
// Compartir/Corregir). NO fusiona tickets ni modifica ventas.

import { useEffect, useState } from "react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

const TZ_AR = "America/Argentina/Cordoba";
const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCant = (n) => { const x = Number(n); return Number.isInteger(x) ? x.toLocaleString("es-AR") : x.toLocaleString("es-AR", { maximumFractionDigits: 3 }); };
function fmtFecha(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ_AR, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
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
    <div className="mt-3 space-y-3">
      {/* Orden */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] sunmi-text-muted">Ordenar por:</span>
        <div className="flex flex-wrap gap-1">
          {ORDENES.map((o) => (
            <SunmiButton key={o.v} color={orden === o.v ? "amber" : "slate"} onClick={() => setOrden(o.v)} className="text-[11px] px-2 py-1">
              {o.label}
            </SunmiButton>
          ))}
        </div>
      </div>

      {totales && (
        <div className="text-[12px] sunmi-text-muted">
          {totales.clientes} cliente{totales.clientes === 1 ? "" : "s"} · {totales.tickets} ticket{totales.tickets === 1 ? "" : "s"} · total {money(totales.total)}
        </div>
      )}

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
            <div key={key} className="sunmi-surface rounded-lg">
              {/* Cabecera de la tarjeta */}
              <button type="button" onClick={() => toggle(key)} className="w-full text-left p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {c.nombre}
                    {c.documento ? <span className="sunmi-text-muted ml-1 text-[11px]">({c.documento})</span> : null}
                    {c.clienteId == null ? <span className="sunmi-text-muted ml-1 text-[11px]">(sin cliente)</span> : null}
                  </div>
                  <div className="text-[11px] sunmi-text-muted mt-0.5">
                    {c.tickets} ticket{c.tickets === 1 ? "" : "s"} · {fmtCant(c.unidadesTotales)} u · última {fmtFecha(c.ultimaCompra)}
                  </div>
                  {c.pagos?.length > 0 && (
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[11px] sunmi-text-muted">
                      {c.pagos.map((p) => (
                        <span key={p.medio}>{p.label} <span className="tabular-nums">{money(p.monto)}</span></span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold tabular-nums">{money(c.totalAcumulado)}</div>
                  <div className="text-[11px] sunmi-text-link">{exp ? "▲ ocultar" : "▼ tickets"}</div>
                </div>
              </button>

              {/* Acordeón: tickets originales */}
              {exp && (
                <div className="border-t sunmi-divider p-2 space-y-1">
                  {c.ventas.map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-2 text-[12px] px-1 py-1">
                      <div className="min-w-0">
                        <span className="font-mono font-semibold">#{v.numero ?? v.id}</span>
                        <span className="sunmi-text-muted ml-2">{fmtFecha(v.fecha)}</span>
                        <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] ${v.estado === "fiado" ? "sunmi-state-warning sunmi-text-accent" : "sunmi-state-success sunmi-text-success"}`}>{v.estado}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="tabular-nums font-mono">{money(v.total)}</span>
                        <SunmiButton color="slate" onClick={() => onVerTicket && onVerTicket(v.id)} className="text-[11px] px-2 py-1">Ver ticket</SunmiButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
