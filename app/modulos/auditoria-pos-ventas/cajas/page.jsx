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
import { useAuditoriaCajas } from "@/hooks/useAuditoriaCajas";
import SinPermisos from "@/components/auth/SinPermisos";
import { ChevronDown, ChevronUp } from "lucide-react";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

function fmt(n) {
  return Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFecha(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch { return "—"; }
}

function BadgeDiferencia({ diferencia }) {
  if (diferencia == null) return <span className="text-[10px] sunmi-text-muted">—</span>;
  const v = Number(diferencia);
  if (v === 0) return <span className="text-[10px] font-semibold sunmi-text-success">Cuadra</span>;
  const cls = v > 0 ? "sunmi-badge-success" : "sunmi-badge-danger";
  const label = v > 0 ? `+$${fmt(v)} sobrante` : `-$${fmt(Math.abs(v))} faltante`;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${cls}`}>{label}</span>;
}

function BadgeEstado({ estado }) {
  if (estado === "cerrado") {
    return <span className="text-[10px] px-1.5 py-0.5 rounded font-medium sunmi-badge-success">Cerrado</span>;
  }
  return <span className="text-[10px] px-1.5 py-0.5 rounded font-medium sunmi-badge-accent">Abierto</span>;
}

function CajaCard({ caja }) {
  const [open, setOpen] = useState(false);
  const v = caja.ventas;
  const Icon = open ? ChevronUp : ChevronDown;

  return (
    <SunmiCard className="p-0 overflow-hidden">
      {/* Header clickeable */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-[var(--hover-bg)] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold">#{caja.turnoId}</span>
            <BadgeEstado estado={caja.estado} />
            <BadgeDiferencia diferencia={caja.diferencia} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0 mt-0.5">
            <span className="text-[10px] sunmi-text-muted">{fmtFecha(caja.apertura)}</span>
            {caja.cierre && <span className="text-[10px] sunmi-text-muted">→ {fmtFecha(caja.cierre)}</span>}
            <span className="text-[10px] sunmi-text-muted">{caja.responsable?.nombre || "—"}</span>
            {caja.operador && (
              <span className="text-[10px] sunmi-text-accent px-1.5 py-0.5 rounded sunmi-surface font-medium">Op: {caja.operador.nombre}</span>
            )}
            {caja.cerradoPor && caja.cerradoPor.id !== caja.responsable?.id && (
              <span className="text-[10px] sunmi-text-muted px-1.5 py-0.5 rounded sunmi-surface font-medium">Cerró: {caja.cerradoPor.nombre}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] sunmi-text-muted">Ventas</div>
            <div className="text-xs font-semibold font-mono">{v.cantidad}</div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] sunmi-text-muted">Bruto</div>
            <div className="text-xs font-semibold font-mono">${fmt(v.bruto)}</div>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-[10px] sunmi-text-muted">Ganancia</div>
            <div className={`text-xs font-semibold font-mono ${v.ganancia < 0 ? "sunmi-text-danger" : "sunmi-text-success"}`}>
              ${fmt(v.ganancia)}
            </div>
          </div>
          <Icon size={16} className="sunmi-text-muted" />
        </div>
      </button>

      {/* Detalle expandible */}
      {open && (
        <div className="border-t border-[var(--border)] px-3 py-2.5 space-y-3">
          {/* Grid de métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
            {[
              { label: "Monto inicial", value: `$${fmt(caja.montoInicial)}` },
              { label: "Efectivo", value: `$${fmt(v.efectivo)}` },
              { label: "Digital", value: `$${fmt(v.digital)}` },
              { label: "Fiado", value: `$${fmt(v.fiado)}` },
              { label: "Ingresos", value: `$${fmt(caja.totalIngresos)}`, cls: "sunmi-text-success" },
              { label: "Retiros", value: `$${fmt(caja.totalRetiros)}`, cls: "sunmi-text-danger" },
              { label: "Comisión", value: `$${fmt(v.comision)}` },
              { label: "Neto", value: `$${fmt(v.neto)}`, cls: "sunmi-text-success" },
              { label: "Costo", value: `$${fmt(v.costo)}`, cls: "sunmi-text-muted" },
              { label: "Descuento", value: `$${fmt(v.descuento)}` },
              { label: "Esperado", value: caja.esperado != null ? `$${fmt(caja.esperado)}` : "—", cls: "font-semibold" },
              { label: "Real", value: caja.real != null ? `$${fmt(caja.real)}` : "—", cls: "font-semibold" },
            ].map((k) => (
              <div key={k.label} className="sunmi-surface px-2 py-1.5 rounded-lg text-center">
                <div className="text-[9px] sunmi-text-muted leading-tight">{k.label}</div>
                <div className={`text-xs font-bold tabular-nums leading-snug ${k.cls || ""}`}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Movimientos de caja */}
          {caja.movimientos && caja.movimientos.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold sunmi-text-muted mb-1">Movimientos manuales</p>
              <div className="space-y-1">
                {caja.movimientos.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-[11px] sunmi-surface px-2 py-1 rounded">
                    <span className={`font-semibold ${m.tipo === "INGRESO" ? "sunmi-text-success" : "sunmi-text-danger"}`}>
                      {m.tipo === "INGRESO" ? "+" : "-"}${fmt(m.monto)}
                    </span>
                    <span className="sunmi-text-muted flex-1 truncate">{m.motivo || "Sin motivo"}</span>
                    <span className="sunmi-text-muted text-[10px]">{m.usuario?.nombre || "—"}</span>
                    <span className="sunmi-text-muted text-[10px]">{fmtFecha(m.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {caja.movimientos && caja.movimientos.length === 0 && (
            <p className="text-[10px] sunmi-text-muted">Sin movimientos manuales.</p>
          )}

          {caja.observaciones && (
            <p className="text-[10px] sunmi-text-muted">
              <span className="font-semibold">Obs:</span> {caja.observaciones}
            </p>
          )}
        </div>
      )}
    </SunmiCard>
  );
}

export default function AuditoriaCajasPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { loading, error, cajas, cargar } = useAuditoriaCajas();

  useEffect(() => {
    const hoy = hoyArgentinaISO();
    setFechaDesde(hoy);
    setFechaHasta(hoy);
  }, []);

  const ejecutarConsulta = useCallback(() => {
    cargar(fechaDesde, fechaHasta);
  }, [cargar, fechaDesde, fechaHasta]);

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
  const rangoLabel = fechaDesde && fechaHasta && cajas ? `${fechaDesde} → ${fechaHasta}` : "";

  // Resumen rápido
  const resumen = cajas ? {
    total: cajas.length,
    abiertas: cajas.filter((c) => c.estado === "abierto").length,
    conDiferencia: cajas.filter((c) => c.diferencia != null && c.diferencia !== 0).length,
    totalBruto: cajas.reduce((acc, c) => acc + (c.ventas?.bruto || 0), 0),
    diferenciaTotal: cajas.reduce((acc, c) => acc + (c.diferencia || 0), 0),
  } : null;

  return (
    <div className="p-2 lg:p-3 space-y-2 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold leading-tight">Cajas</h1>
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
              <SunmiInput type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="!py-1 text-xs" />
            </div>
            <div>
              <label className="text-[9px] sunmi-text-muted mb-0.5 block">Hasta</label>
              <SunmiInput type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="!py-1 text-xs" />
            </div>
            <SunmiButton color="amber" onClick={ejecutarConsulta} disabled={loading} className="!py-1 text-xs">
              {loading ? "Cargando..." : "Consultar"}
            </SunmiButton>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">{error}</div>
      )}

      {loading && (
        <div className="text-center py-10"><SunmiLoader /></div>
      )}

      {!loading && cajas && (
        <>
          {/* Mini resumen */}
          {resumen && (
            <div className="flex flex-wrap gap-1.5">
              <div className="sunmi-surface px-2.5 py-1.5 rounded-lg text-center">
                <div className="text-[9px] sunmi-text-muted">Cajas</div>
                <div className="text-sm font-bold">{resumen.total}</div>
              </div>
              {resumen.abiertas > 0 && (
                <div className="sunmi-surface px-2.5 py-1.5 rounded-lg text-center">
                  <div className="text-[9px] sunmi-text-muted">Abiertas</div>
                  <div className="text-sm font-bold sunmi-text-accent">{resumen.abiertas}</div>
                </div>
              )}
              {resumen.conDiferencia > 0 && (
                <div className="sunmi-surface px-2.5 py-1.5 rounded-lg text-center">
                  <div className="text-[9px] sunmi-text-muted">Con diferencia</div>
                  <div className="text-sm font-bold sunmi-text-danger">{resumen.conDiferencia}</div>
                </div>
              )}
              <div className="sunmi-surface px-2.5 py-1.5 rounded-lg text-center">
                <div className="text-[9px] sunmi-text-muted">Bruto total</div>
                <div className="text-sm font-bold">${fmt(resumen.totalBruto)}</div>
              </div>
              {resumen.diferenciaTotal !== 0 && (
                <div className="sunmi-surface px-2.5 py-1.5 rounded-lg text-center">
                  <div className="text-[9px] sunmi-text-muted">Dif. acumulada</div>
                  <div className={`text-sm font-bold ${resumen.diferenciaTotal < 0 ? "sunmi-text-danger" : "sunmi-text-success"}`}>
                    ${fmt(resumen.diferenciaTotal)}
                  </div>
                </div>
              )}
            </div>
          )}

          {cajas.length === 0 && (
            <SunmiCard className="p-3">
              <p className="text-center py-4 sunmi-text-muted text-sm">Sin cajas en el período seleccionado.</p>
            </SunmiCard>
          )}

          <div className="space-y-1.5">
            {cajas.map((c) => (
              <CajaCard key={c.turnoId} caja={c} />
            ))}
          </div>
        </>
      )}

      {!loading && !cajas && !error && (
        <SunmiCard className="p-3">
          <p className="text-center py-4 sunmi-text-muted text-sm">
            Seleccioná un rango de fechas y pulsá <strong>Consultar</strong> para auditar los datos.
          </p>
        </SunmiCard>
      )}
    </div>
  );
}
