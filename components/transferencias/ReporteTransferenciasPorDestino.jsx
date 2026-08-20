"use client";

// Vista del reporte AGRUPADA POR LOCAL DESTINO. Un bloque por destino (acordeón)
// con nombre, importe total, cantidad de transferencias, ítems y última fecha;
// al expandir muestra el sublistado con "Ver transferencia", que navega a la
// página de detalle.
//
// Calca components/reportes-ventas/ReporteVentasPorCliente.jsx: mismas píldoras
// de orden, misma cabecera clicable con el chevron que rota, mismo sublistado.
// Ese archivo no se toca.
//
// La expansión de ESTOS grupos no contradice haber quitado las filas
// expandibles: lo que se eliminó fue el acordeón de la TABLA principal y
// MiniInfo. Acá el patrón es el de "Por cliente", donde el grupo es el
// contenedor natural de sus comprobantes. La tabla principal sigue sin expandir.

import { useEffect, useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import EstadoTransferenciaBadge, { DiferenciasBadge } from "@/components/transferencias/EstadoTransferenciaBadge";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Cantidades: enteros sin decimales, fraccionarios con hasta 3 útiles.
// `null` NO es cero: sin recepción cargada se muestra "—".
const fmtCant = (n) => {
  if (n === null || n === undefined) return "—";
  const x = Number(n);
  if (!isFinite(x)) return "—";
  return Number.isInteger(x) ? x.toLocaleString("es-AR") : x.toLocaleString("es-AR", { maximumFractionDigits: 3 });
};

function fmtFecha(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  // Ya declaraba la zona; le faltaba `hour12: false`. Del helper único.
  return fechaHoraAR(d);
}

// Mismas cinco píldoras que "Por cliente", con las etiquetas del dominio.
const ORDENES = [
  { v: "mayorImporte", label: "Mayor importe" },
  { v: "menorImporte", label: "Menor importe" },
  { v: "masTransferencias", label: "Más transferencias" },
  { v: "masReciente", label: "Más reciente" },
  { v: "nombreAZ", label: "Nombre A-Z" },
];

// `orden` es CONTROLADO por la página, no estado interno como en "Por cliente".
// El motivo es concreto: al volver del detalle hay que restaurar el orden que el
// usuario había elegido, y para eso tiene que vivir donde se arma el contexto de
// retorno.
export default function ReporteTransferenciasPorDestino({
  filtros,
  orden = "mayorImporte",
  onOrdenChange,
  onVerTransferencia,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [destinos, setDestinos] = useState(null);
  const [totales, setTotales] = useState(null);
  const [truncado, setTruncado] = useState(false);
  const [abierto, setAbierto] = useState(() => new Set());

  // Solo consulta cuando hay filtros vigentes — es decir, cuando el reporte ya
  // fue generado y esta tab está montada. La página no monta este componente
  // mientras la tab activa sea "Por transferencia".
  useEffect(() => {
    if (!filtros?.fechaDesde || !filtros?.fechaHasta) return;
    let vivo = true;
    (async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        desde: filtros.fechaDesde,
        hasta: filtros.fechaHasta,
        orden,
      });
      if (filtros.estado) params.set("estado", filtros.estado);
      try {
        const res = await fetch(`/api/transferencias/por-destino?${params}`, {
          credentials: "include",
          cache: "no-store",
        });
        const d = await res.json();
        if (!vivo) return;
        if (d.ok) {
          setDestinos(d.destinos || []);
          setTotales(d.totales || null);
          setTruncado(d.truncado === true);
        } else {
          setError(d.error || "No se pudo cargar la vista por destino.");
        }
      } catch {
        if (vivo) setError("Error de conexión.");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [filtros, orden]);

  const toggle = (key) =>
    setAbierto((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  const keyDe = (g) => (g.destinoId == null ? "sin-destino" : `d:${g.destinoId}`);

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
              onClick={() => onOrdenChange && onOrdenChange(o.v)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${orden === o.v ? "sunmi-pill-link" : "sunmi-surface-soft sunmi-text-muted hover:sunmi-text-strong"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {totales && (
          <div className="text-[11px] sunmi-text-muted">
            <span className="sunmi-text-strong font-semibold">{totales.destinos}</span> destino{totales.destinos === 1 ? "" : "s"} ·{" "}
            <span className="sunmi-text-strong font-semibold">{totales.transferencias}</span> transferencia{totales.transferencias === 1 ? "" : "s"} ·{" "}
            total <span className="sunmi-text-strong font-semibold tabular-nums">{money(totales.importeTotal)}</span>
          </div>
        )}
      </div>

      {/* Truncamiento explícito: el reporte es parcial y hay que decirlo. */}
      {truncado && (
        <div className="sunmi-state-warning sunmi-border rounded-lg px-3 py-2 flex items-start gap-2 text-[12px]">
          <TriangleAlert size={15} className="shrink-0 mt-0.5 sunmi-text-warning" />
          <span className="sunmi-text-strong">
            El período supera las 5000 transferencias. Se agruparon solo las 5000 más
            recientes: acotá el rango de fechas para ver el total completo.
          </span>
        </div>
      )}

      {loading && <div className="text-center py-6"><SunmiLoader /></div>}
      {!loading && error && (
        <div className="text-[12px] sunmi-text-danger sunmi-state-danger rounded px-2 py-1.5">{error}</div>
      )}
      {!loading && !error && destinos && destinos.length === 0 && (
        <div className="text-center py-8 sunmi-text-muted text-sm">
          No hay transferencias en el período seleccionado
        </div>
      )}

      <div className="space-y-2">
        {!loading && !error && (destinos || []).map((g) => {
          const key = keyDe(g);
          const exp = abierto.has(key);
          return (
            <div
              key={key}
              className={`sunmi-surface sunmi-border rounded-xl overflow-hidden transition-shadow ${exp ? "shadow-md" : ""}`}
            >
              {/* Cabecera del destino (clic = expandir/colapsar) */}
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-expanded={exp}
                className="w-full text-left p-3 flex items-center justify-between gap-3 sunmi-row-hover transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`shrink-0 grid place-items-center w-8 h-8 rounded-lg sunmi-surface-soft sunmi-text-link transition-transform duration-200 ${exp ? "rotate-180" : ""}`}
                  >
                    <ChevronDown size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold sunmi-text-strong truncate leading-tight">
                      {g.destinoNombre}
                    </div>
                    <div className="text-[11px] sunmi-text-muted mt-0.5">
                      {g.cantidadTransferencias} transferencia{g.cantidadTransferencias === 1 ? "" : "s"} · {g.cantidadItems} ítem{g.cantidadItems === 1 ? "" : "s"} · última {fmtFecha(g.ultimaTransferencia)}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[15px] sunmi-text-strong tabular-nums leading-tight">
                    {money(g.importeTotal)}
                  </div>
                  <div className="text-[10px] sunmi-text-link font-medium">
                    {exp
                      ? "Ocultar transferencias"
                      : `Ver ${g.cantidadTransferencias} transferencia${g.cantidadTransferencias === 1 ? "" : "s"}`}
                  </div>
                </div>
              </button>

              {/* Acordeón: sublistado de remitos del destino */}
              {exp && (
                <div className="border-t sunmi-divider sunmi-surface-soft">
                  <div className="p-2 space-y-1">
                    {g.transferencias.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 sunmi-surface sunmi-row-hover transition-colors flex-wrap"
                      >
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-[12px] sunmi-text-strong">#{t.id}</span>
                          <span className="sunmi-text-muted text-[11px]">{fmtFecha(t.fecha)}</span>
                          <EstadoTransferenciaBadge estado={t.estado} />
                          <DiferenciasBadge estado={t.estado} tieneDiferencias={t.tieneDiferencias} />
                          <span className="text-[11px] sunmi-text-muted">
                            {t.cantidadItems} ítem{t.cantidadItems === 1 ? "" : "s"} · env {fmtCant(t.cantidadEnviada)} · rec {fmtCant(t.cantidadRecibida)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="tabular-nums font-mono font-semibold text-[13px] sunmi-text-strong">
                            {money(t.totalCosto)}
                          </span>
                          <SunmiButton
                            color="amber"
                            onClick={() => onVerTransferencia && onVerTransferencia(t.id)}
                            className="text-[11px] px-2.5 py-1"
                          >
                            Ver transferencia
                          </SunmiButton>
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
