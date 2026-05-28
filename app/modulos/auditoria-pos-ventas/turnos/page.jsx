"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { useAuditoriaTurnos } from "@/hooks/useAuditoriaTurnos";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiDateRangePicker from "@/components/sunmi/SunmiDateRangePicker";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import {
  AlertTriangle,
  Clock,
  UserCheck,
  Sun,
  Sunset,
  Moon,
  ChevronRight,
  ChevronDown,
  MessageSquare,
} from "lucide-react";

// --- Formateo ---

function fmt(n) {
  return Number(n ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtHora(d) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("es-AR", { timeStyle: "short" });
  } catch {
    return "";
  }
}

function fmtFechaCorta(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function fmtFechaLargaSecundaria(d) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("es-AR", {
      weekday: "long",
    });
  } catch {
    return "";
  }
}

// --- Franjas (solo frontend) ---

function getFranja(apertura) {
  if (!apertura) return "noche";
  const h = new Date(apertura).getHours();
  if (h >= 6 && h < 13) return "manana";
  if (h >= 13 && h < 20) return "tarde";
  return "noche";
}

const FRANJAS_CONFIG = {
  manana: { label: "Mañana", icon: Sun,    cls: "text-amber-500",  borderCls: "border-l-amber-400",  bgIcon: "bg-amber-50",  dotCls: "bg-amber-400"  },
  tarde:  { label: "Tarde",  icon: Sunset, cls: "text-orange-500", borderCls: "border-l-orange-400", bgIcon: "bg-orange-50", dotCls: "bg-orange-400" },
  noche:  { label: "Noche",  icon: Moon,   cls: "text-indigo-500", borderCls: "border-l-indigo-400", bgIcon: "bg-indigo-50", dotCls: "bg-indigo-400" },
};

const FRANJAS_ORDEN = ["manana", "tarde", "noche"];

function getFechaKey(apertura) {
  if (!apertura) return "sin-fecha";
  const d = new Date(apertura);
  if (isNaN(d.getTime())) return "sin-fecha";
  // Día calendario en hora Argentina, no UTC. Sin esto un turno abierto a las
  // 22:00 ART caería en el día siguiente UTC y agruparía mal en la lista.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

function agruparTurnos(turnos, franjaFiltro, ordenApertura) {
  if (!turnos || turnos.length === 0) return [];

  const porDia = new Map();
  for (const t of turnos) {
    const diaKey = getFechaKey(t.apertura);
    if (!porDia.has(diaKey)) porDia.set(diaKey, []);
    porDia.get(diaKey).push(t);
  }

  const dias = [...porDia.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([diaKey, turnosDia]) => {
      const porFranja = new Map();
      for (const t of turnosDia) {
        const f = getFranja(t.apertura);
        if (franjaFiltro !== "todos" && f !== franjaFiltro) continue;
        if (!porFranja.has(f)) porFranja.set(f, []);
        porFranja.get(f).push(t);
      }

      const franjas = FRANJAS_ORDEN.filter((f) => porFranja.has(f)).map((f) => {
        let items = [...porFranja.get(f)];
        items.sort((a, b) => {
          const da = new Date(a.apertura).getTime();
          const db = new Date(b.apertura).getTime();
          return ordenApertura === "desc" ? db - da : da - db;
        });

        items = items.map((t, idx) => ({ ...t, _cajaIndex: idx + 1 }));

        const totales = items.reduce(
          (acc, t) => ({
            tickets: acc.tickets + (t.ventasCount ?? 0),
            bruto:   acc.bruto   + (t.ventaBruta    ?? 0),
            neto:    acc.neto    + (t.neto           ?? 0),
            costo:   acc.costo   + (t.costo          ?? 0),
            ganancia:acc.ganancia+ (t.gananciaTurno  ?? 0),
          }),
          { tickets: 0, bruto: 0, neto: 0, costo: 0, ganancia: 0 }
        );
        return { key: f, items, totales };
      });

      return { diaKey, fecha: turnosDia[0].apertura, franjas };
    })
    .filter((d) => d.franjas.length > 0);

  return dias;
}

function margenBajoTicket(t) {
  const neto = Number(t.neto ?? 0);
  const gn   = Number(t.gananciaTurno ?? 0);
  if (neto <= 0) return false;
  if (gn < 0)   return false;
  return gn / neto < 0.05;
}

// --- Alerta ventas sin turno ---
function AlertaSinTurno({ sinTurno }) {
  const [open, setOpen] = useState(false);
  if (!sinTurno || sinTurno.total === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-5 py-3">
      <button onClick={() => setOpen(!open)} className="w-full text-left flex items-center gap-2.5">
        <AlertTriangle size={15} className="sunmi-text-danger flex-shrink-0" />
        <span className="text-[13px] sunmi-text-muted flex-1">
          {sinTurno.total} venta{sinTurno.total !== 1 ? "s" : ""} sin caja asignada
        </span>
        <ChevronRight size={15} className={`sunmi-text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="sunmi-text-muted text-[10px] uppercase tracking-wider">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2">Forma pago</th>
                <th className="px-2 py-2">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {sinTurno.items.slice(0, 20).map((v) => (
                <tr key={v.id} className="hover:bg-[var(--hover-bg)] border-t border-[var(--border)]">
                  <td className="px-2 py-2 whitespace-nowrap text-xs font-mono">#{v.numero}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs">
                    {v.fecha
                      ? new Date(v.fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
                      : "—"}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs text-right font-mono">${fmt(v.total)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs capitalize">{v.formaPago}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs">{v.vendedor?.nombre || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sinTurno.total > 20 && (
            <p className="text-[11px] sunmi-text-muted mt-2">Mostrando 20 de {sinTurno.total}</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Fila de caja expandible ---
function TurnoRow({ turno }) {
  const t = turno;
  const [expandido, setExpandido] = useState(false);
  const esCerrado  = t.cierre !== null;
  const ganNeg     = Number(t.gananciaTurno ?? 0) < 0;
  const mBajo      = margenBajoTicket(t) && !ganNeg;
  const hayAlertas = ganNeg || mBajo || (t.diferenciaEfectivo != null && t.diferenciaEfectivo !== 0);

  const persona = t.operador?.nombre?.trim() || t.vendedor?.nombre?.trim() || "Sin nombre";
  const cajaN   = t._cajaIndex ?? 1;

  const horaStr = t.cierre
    ? `${fmtHora(t.apertura)} → ${fmtHora(t.cierre)}`
    : fmtHora(t.apertura);

  const tieneDesglose = t.ventas && (t.ventas.efectivo || t.ventas.digital || t.ventas.fiado);
  const tieneMovimientos = t.movimientos && t.movimientos.length > 0;
  const tieneObs = !!t.observaciones;

  // Badge de arqueo
  const arqueoBadge = (() => {
    if (!esCerrado) return null;
    const dif = t.diferenciaEfectivo;
    if (dif === null || dif === undefined)
      return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap sunmi-badge-muted">Sin arqueo</span>;
    if (dif === 0)
      return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap sunmi-badge-success">Cuadró ✓</span>;
    if (dif > 0)
      return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap sunmi-badge-accent">Sobra ${fmt(dif)}</span>;
    return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap sunmi-badge-danger">Falta ${fmt(Math.abs(dif))}</span>;
  })();

  // Badges compartidos
  const estadoBadge = (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
      esCerrado ? "sunmi-badge-success" : "sunmi-badge-accent"
    }`}>
      {esCerrado ? "Cerrado" : "Abierto"}
    </span>
  );

  const alertasBadges = hayAlertas && (
    <>
      {ganNeg && (
        <span className="sunmi-badge-danger text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
          <AlertTriangle size={9} /> Pérdida
        </span>
      )}
      {mBajo && (
        <span className="sunmi-badge-accent text-[10px] px-2 py-0.5 rounded-full font-bold">
          Margen bajo
        </span>
      )}
      {t.diferenciaEfectivo != null && t.diferenciaEfectivo !== 0 && (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
          t.diferenciaEfectivo < 0 ? "sunmi-badge-danger" : "sunmi-badge-accent"
        }`}>
          Dif: ${fmt(t.diferenciaEfectivo)}
        </span>
      )}
    </>
  );

  // Panel expandido compartido
  const panelExpandido = expandido && (
    <div className="border-t border-[var(--border)] px-4 py-2 sunmi-surface-soft space-y-2">
      {/* Desglose desktop: línea horizontal */}
      {tieneDesglose && (
        <div className="hidden sm:flex items-center gap-4 flex-wrap">
          <div className="flex items-baseline gap-1.5 border-r border-[var(--border)] pr-4">
            <span className="text-[10px] uppercase sunmi-text-muted">Efectivo</span>
            <span className="text-[12px] font-semibold tabular-nums">${fmt(t.ventas.efectivo)}</span>
          </div>
          <div className="flex items-baseline gap-1.5 border-r border-[var(--border)] pr-4">
            <span className="text-[10px] uppercase sunmi-text-muted">Digital</span>
            <span className="text-[12px] font-semibold tabular-nums">${fmt(t.ventas.digital)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase sunmi-text-muted">Fiado</span>
            <span className="text-[12px] font-semibold tabular-nums">${fmt(t.ventas.fiado)}</span>
          </div>
        </div>
      )}

      {/* Desglose mobile: lista vertical */}
      {tieneDesglose && (
        <div className="flex sm:hidden flex-col divide-y divide-[var(--border)]">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[10px] uppercase sunmi-text-muted">Efectivo</span>
            <span className="text-[12px] font-semibold tabular-nums">${fmt(t.ventas.efectivo)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[10px] uppercase sunmi-text-muted">Digital</span>
            <span className="text-[12px] font-semibold tabular-nums">${fmt(t.ventas.digital)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[10px] uppercase sunmi-text-muted">Fiado</span>
            <span className="text-[12px] font-semibold tabular-nums">${fmt(t.ventas.fiado)}</span>
          </div>
        </div>
      )}

      {/* Movimientos de caja */}
      {tieneMovimientos && (
        <div>
          <p className="text-[10px] uppercase sunmi-text-muted mb-1">Movimientos</p>
          <div className="space-y-1">
            {t.movimientos.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-[12px]">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  m.tipo === "INGRESO" ? "sunmi-badge-success" : "sunmi-badge-danger"
                }`}>
                  {m.tipo === "INGRESO" ? "Ingreso" : "Retiro"}
                </span>
                <span className="flex-1 truncate">{m.motivo || "Sin motivo"}</span>
                <span className={`font-semibold tabular-nums ${
                  m.tipo === "INGRESO" ? "sunmi-text-success" : "sunmi-text-danger"
                }`}>
                  {m.tipo === "INGRESO" ? "+" : "-"}${fmt(m.monto)}
                </span>
                {m.usuario?.nombre && (
                  <span className="text-[11px] sunmi-text-muted hidden sm:inline">{m.usuario.nombre}</span>
                )}
                {m.createdAt && (
                  <span className="text-[11px] sunmi-text-muted tabular-nums">{fmtHora(m.createdAt)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observaciones */}
      {tieneObs && (
        <div className="flex gap-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex-shrink-0 mt-0.5">
            <MessageSquare size={16} className="text-amber-600" />
          </div>
          <div>
            <div className="text-[10px] text-amber-700 uppercase tracking-wider font-semibold mb-1">
              Observaciones del cajero
            </div>
            <p className="text-[13px] text-amber-900">{t.observaciones}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl overflow-hidden">

      {/* ===== LAYOUT MOBILE (< sm) ===== */}
      <div className="flex sm:hidden flex-col">
        {/* Cabecera */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-[13px] font-semibold text-[var(--foreground)] leading-tight">
            Caja {cajaN} · {persona}
          </p>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <Clock size={11} className="sunmi-text-muted flex-shrink-0" />
            <span className="text-[11px] sunmi-text-muted tabular-nums">{horaStr}</span>
            {estadoBadge}
            {arqueoBadge}
            {alertasBadges}
          </div>
        </div>

        {/* KPIs 2x2 */}
        <div className="px-4 pb-2">
          <div className="grid grid-cols-2 gap-1">
            <div className="sunmi-surface rounded-lg px-3 py-2">
              <p className="text-[10px] sunmi-text-muted uppercase">Tickets</p>
              <p className="text-[13px] font-semibold tabular-nums">{t.ventasCount ?? 0}</p>
            </div>
            <div className="sunmi-surface rounded-lg px-3 py-2">
              <p className="text-[10px] sunmi-text-muted uppercase">Bruto</p>
              <p className="text-[13px] font-semibold tabular-nums">${fmt(t.ventaBruta)}</p>
            </div>
            <div className="sunmi-surface rounded-lg px-3 py-2">
              <p className="text-[10px] sunmi-text-muted uppercase">Neto</p>
              <p className="text-[13px] font-semibold tabular-nums sunmi-text-accent">${fmt(t.neto ?? 0)}</p>
            </div>
            <div className="sunmi-surface rounded-lg px-3 py-2">
              <p className="text-[10px] sunmi-text-muted uppercase">Ganancia</p>
              <p className={`text-[13px] font-bold tabular-nums ${ganNeg ? "sunmi-text-danger" : "sunmi-text-success"}`}>
                ${fmt(t.gananciaTurno)}
              </p>
            </div>
          </div>
        </div>

        {/* Footer mobile */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setExpandido(!expandido)}
            className="text-[11px] sunmi-text-muted hover:text-[var(--foreground)] transition-colors"
          >
            {expandido ? "▲ cerrar" : "▼ ver desglose"}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); window.location.href = `/modulos/auditoria-pos-ventas/turnos/${t.id}`; }}
            className="sunmi-btn-base sunmi-btn-cyan !h-7 !text-[12px] !px-3 !rounded-lg font-semibold inline-flex items-center gap-1"
          >
            Ver detalle <ChevronRight size={13} />
          </button>
        </div>

        {/* Panel expandido mobile */}
        {panelExpandido}
      </div>

      {/* ===== LAYOUT DESKTOP (>= sm) ===== */}
      <div
        className="hidden sm:flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover-bg)] transition-colors cursor-pointer select-none"
        onClick={() => setExpandido(!expandido)}
      >
        {/* Nombre + hora + badges */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--foreground)] truncate leading-tight">
            Caja {cajaN} · {persona}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock size={11} className="sunmi-text-muted flex-shrink-0" />
              <span className="text-[11px] sunmi-text-muted tabular-nums">{horaStr}</span>
            </span>
            {t.operador?.nombre && t.vendedor?.nombre && t.operador.nombre !== t.vendedor.nombre && (
              <span className="text-[11px] sunmi-text-muted flex items-center gap-0.5">
                <UserCheck size={10} className="shrink-0" />
                {t.vendedor.nombre}
              </span>
            )}
            {estadoBadge}
            {arqueoBadge}
            {alertasBadges}
          </div>
        </div>

        {/* Tickets */}
        <div className="text-right w-12 flex-shrink-0">
          <p className="text-[10px] sunmi-text-muted mb-0.5">Tickets</p>
          <p className="text-[13px] font-semibold tabular-nums text-[var(--foreground)]">
            {t.ventasCount ?? 0}
          </p>
        </div>

        {/* Bruto */}
        <div className="text-right w-28 flex-shrink-0 hidden md:block">
          <p className="text-[10px] sunmi-text-muted mb-0.5">Bruto</p>
          <p className="text-[13px] font-semibold tabular-nums text-[var(--foreground)]">
            ${fmt(t.ventaBruta)}
          </p>
        </div>

        {/* Neto */}
        <div className="text-right w-28 flex-shrink-0 hidden md:block">
          <p className="text-[10px] sunmi-text-muted mb-0.5">Neto</p>
          <p className="text-[13px] font-semibold tabular-nums sunmi-text-accent">
            ${fmt(t.neto ?? 0)}
          </p>
        </div>

        {/* Ganancia */}
        <div className="text-right w-28 flex-shrink-0">
          <p className="text-[10px] sunmi-text-muted mb-0.5">Ganancia</p>
          <p className={`text-[14px] font-bold tabular-nums ${
            ganNeg ? "sunmi-text-danger" : "sunmi-text-success"
          }`}>
            ${fmt(t.gananciaTurno)}
          </p>
        </div>

        {/* Chevron expandir */}
        <ChevronDown size={14} className={`transition-transform duration-200 flex-shrink-0 sunmi-text-muted ${expandido ? "rotate-180" : ""}`} />

        {/* CTA */}
        <div className="flex-shrink-0 pl-2 border-l border-[var(--border)]">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); window.location.href = `/modulos/auditoria-pos-ventas/turnos/${t.id}`; }}
            className="sunmi-btn-base sunmi-btn-cyan !h-7 !text-[12px] !px-3 !rounded-lg font-semibold inline-flex items-center gap-1"
          >
            Ver detalle <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Panel expandido desktop */}
      <div className="hidden sm:block">
        {panelExpandido}
      </div>
    </div>
  );
}

// --- Total de franja ---
function FranjaTotalBar({ franjaKey, totales, cantCajas }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl overflow-hidden mt-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 text-center gap-px bg-[var(--border)]">
        <div className="py-3 px-3 bg-[var(--card-bg)]">
          <div className="text-[10px] sunmi-text-muted uppercase tracking-wider mb-0.5">Cajas</div>
          <div className="text-[15px] font-extrabold tabular-nums">{cantCajas}</div>
        </div>
        <div className="py-3 px-3 bg-[var(--card-bg)]">
          <div className="text-[10px] sunmi-text-muted uppercase tracking-wider mb-0.5">Tickets</div>
          <div className="text-[15px] font-extrabold tabular-nums">{totales.tickets}</div>
        </div>
        <div className="py-3 px-3 bg-[var(--card-bg)]">
          <div className="text-[10px] sunmi-text-muted uppercase tracking-wider mb-0.5">Bruto</div>
          <div className="text-[15px] font-extrabold tabular-nums">${fmt(totales.bruto)}</div>
        </div>
        <div className="py-3 px-3 bg-[var(--card-bg)]">
          <div className="text-[10px] sunmi-text-muted uppercase tracking-wider mb-0.5">Neto</div>
          <div className="text-[15px] font-extrabold tabular-nums sunmi-text-accent">${fmt(totales.neto)}</div>
        </div>
        <div className="py-3 px-3 bg-[var(--card-bg)] col-span-2 sm:col-span-1">
          <div className="text-[10px] sunmi-text-muted uppercase tracking-wider mb-0.5">Ganancia</div>
          <div className={`text-[15px] font-extrabold tabular-nums ${totales.ganancia < 0 ? "sunmi-text-danger" : "sunmi-text-success"}`}>
            ${fmt(totales.ganancia)}
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--card-bg)_95%,var(--foreground)_5%)] px-5 py-2.5">
        <span className="text-[13px] font-bold text-[var(--foreground)]">
          Total {FRANJAS_CONFIG[franjaKey].label}
        </span>
        <span className="text-[13px] font-extrabold tabular-nums ml-3">${fmt(totales.bruto)}</span>
      </div>
    </div>
  );
}

// --- Bloque de franja ---
function BloqueGrupoFranja({ franjaKey, items, totales, fecha }) {
  const cfg  = FRANJAS_CONFIG[franjaKey];
  const Icon = cfg.icon;
  const [abierto, setAbierto] = useState(false);

  const FRANJA_HEADER_STYLES = {
    manana: { bg: "bg-amber-100",  border: "border-l-amber-500",  text: "text-amber-800"  },
    tarde:  { bg: "bg-orange-100", border: "border-l-orange-500", text: "text-orange-800" },
    noche:  { bg: "bg-indigo-100", border: "border-l-indigo-500", text: "text-indigo-800" },
  };
  const hs = FRANJA_HEADER_STYLES[franjaKey];

  return (
    <div>
      {/* Header franja — clickeable */}
      <div
        className={`mb-4 px-4 py-3 border-l-[4px] ${hs.border} ${hs.bg} rounded-r-xl border border-[var(--border)] cursor-pointer select-none`}
        onClick={() => setAbierto(!abierto)}
      >
        {/* Fila 1: título + ganancia + chevron */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon size={18} className={hs.text} />
            <div>
              <h3 className={`text-[16px] font-extrabold leading-tight ${hs.text}`}>
                {cfg.label}
              </h3>
              <p className="text-[12px] sunmi-text-muted mt-0.5">
                {fmtFechaCorta(fecha)} · {items.length} caja{items.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] sunmi-text-muted">Ganancia total</p>
              <p className={`text-[15px] font-extrabold tabular-nums ${totales.ganancia < 0 ? "sunmi-text-danger" : "sunmi-text-success"}`}>
                ${fmt(totales.ganancia)}
              </p>
            </div>
            <ChevronDown size={18} className={`${hs.text} transition-transform ${abierto ? "rotate-180" : ""}`} />
          </div>
        </div>
        {/* Fila 2: totales inline */}
        <div className="flex flex-wrap items-center gap-4 mt-2 pt-2 border-t border-black/10">
          {[
            { label: "Cajas", value: items.length },
            { label: "Tickets", value: totales.tickets },
            { label: "Bruto", value: `$${fmt(totales.bruto)}` },
            { label: "Neto", value: `$${fmt(totales.neto)}`, cls: "sunmi-text-accent" },
            { label: "Ganancia", value: `$${fmt(totales.ganancia)}`, cls: totales.ganancia < 0 ? "sunmi-text-danger" : "sunmi-text-success" },
          ].map((k) => (
            <div key={k.label} className="flex items-baseline gap-1">
              <span className={`text-[10px] uppercase tracking-wide opacity-70 ${hs.text}`}>{k.label}</span>
              <span className={`text-[12px] font-bold tabular-nums ${k.cls || hs.text}`}>{k.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lista de filas de cajas (acordeón) */}
      {abierto && (
        <div className="flex flex-col gap-2">
          {items.map((t) => (
            <TurnoRow key={t.id} turno={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Bloque de dia ---
function BloqueDia({ fecha, franjas }) {
  const sec = fmtFechaLargaSecundaria(fecha);
  return (
    <div>
      {franjas.length > 1 && (
        <div className="flex items-baseline gap-3 mb-6 pb-3 border-b border-[var(--border)]">
          <h2 className="text-lg font-extrabold tabular-nums text-[var(--foreground)]">{fmtFechaCorta(fecha)}</h2>
          {sec && <span className="text-sm sunmi-text-muted capitalize">{sec}</span>}
        </div>
      )}

      <div className="space-y-10">
        {franjas.map((f) => (
          <BloqueGrupoFranja key={f.key} franjaKey={f.key} items={f.items} totales={f.totales} fecha={fecha} />
        ))}
      </div>
    </div>
  );
}

// --- Page ---
export default function AuditoriaTurnosPage() {
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const SK = "auditoria-turnos-filtros";

  const [fechaDesde, setFechaDesde] = useState(() => {
    try { return sessionStorage.getItem(SK + "-desde") || ""; } catch { return ""; }
  });
  const [fechaHasta, setFechaHasta] = useState(() => {
    try { return sessionStorage.getItem(SK + "-hasta") || ""; } catch { return ""; }
  });
  const [busqueda, setBusqueda]       = useState("");
  const [franjaFiltro, setFranjaFiltro] = useState("todos");
  const [ordenApertura, setOrdenApertura] = useState("desc");

  const { loading, error, resumen, turnos, sinTurno, cargar } = useAuditoriaTurnos();

  useEffect(() => {
    try {
      if (fechaDesde) sessionStorage.setItem(SK + "-desde", fechaDesde);
      if (fechaHasta) sessionStorage.setItem(SK + "-hasta", fechaHasta);
    } catch {}
  }, [fechaDesde, fechaHasta]);

  const cajeros = useMemo(() => {
    if (!turnos || !Array.isArray(turnos)) return [];
    const nombres = new Set();
    turnos.forEach((t) => {
      if (t.vendedor?.nombre) nombres.add(t.vendedor.nombre);
      if (t.operador?.nombre) nombres.add(t.operador.nombre);
    });
    return [...nombres].sort();
  }, [turnos]);

  const turnosFiltrados = useMemo(() => {
    if (!turnos || !Array.isArray(turnos)) return [];
    if (!busqueda) return turnos;
    return turnos.filter((t) => {
      const nombres = [t.vendedor?.nombre, t.operador?.nombre].filter(Boolean);
      return nombres.some((n) => n === busqueda);
    });
  }, [turnos, busqueda]);

  const diasAgrupados = useMemo(
    () => agruparTurnos(turnosFiltrados, franjaFiltro, ordenApertura),
    [turnosFiltrados, franjaFiltro, ordenApertura]
  );

  useEffect(() => {
    if (!fechaDesde && !fechaHasta) {
      const hoy = hoyArgentinaISO();
      setFechaDesde(hoy);
      setFechaHasta(hoy);
    }
  }, []);

  useEffect(() => {
    if (fechaDesde && fechaHasta && !resumen && !loading && !error) {
      cargar(fechaDesde, fechaHasta, 1, 25);
    }
  }, [fechaDesde, fechaHasta]);

  const ejecutarConsulta = useCallback((desdeOverride, hastaOverride) => {
    const desde = desdeOverride ?? fechaDesde;
    const hasta = hastaOverride ?? fechaHasta;
    cargar(desde, hasta, 1, 25);
  }, [cargar, fechaDesde, fechaHasta]);

  if (!perfil || cargandoUsuario) return null;
  if (loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisos = perfil?.permisos || [];
  const esAdmin  = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("reportes.ver")) return <SinPermisos />;

  const localNombre = contexto?.nombre || "";
  const rangoLabel  = fechaDesde && fechaHasta && resumen
    ? `${fmtFechaCorta(fechaDesde)} → ${fmtFechaCorta(fechaHasta)}`
    : "";

  return (
    <div className="max-w-[1280px] mx-auto px-6 lg:px-8 pb-24">

      {/* ========== 1) ENCABEZADO ========== */}
      <div className="pt-6 pb-5 bg-[var(--card-bg)] -mx-6 lg:-mx-8 px-6 lg:px-8 border-b border-[var(--border)] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-black tracking-tight text-[var(--foreground)] leading-none">
              Cajas
            </h1>
            <p className="text-[13px] sunmi-text-muted mt-1.5">
              {localNombre || "Cajas y arqueos"}
              {rangoLabel && <span className="ml-1">· {rangoLabel}</span>}
            </p>

            {/* Tabs de franja */}
            <div className="inline-flex rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--app-bg)_100%,transparent)] p-1 gap-1 mt-4">
              {[
                { key: "todos",  label: "Todos"   },
                { key: "manana", label: "Mañana"  },
                { key: "tarde",  label: "Tarde"   },
                { key: "noche",  label: "Noche"   },
              ].map((seg) => (
                <button
                  key={seg.key}
                  type="button"
                  onClick={() => setFranjaFiltro(seg.key)}
                  className={`px-4 py-2 text-[13px] font-semibold rounded-lg transition-all ${
                    franjaFiltro === seg.key
                      ? "bg-[var(--pos-accent)] text-white shadow-sm"
                      : "text-[var(--foreground)] opacity-60 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--foreground)_10%)]"
                  }`}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Volver + fechas + Consultar */}
          <div className="flex flex-col items-end gap-3 sm:pt-1 w-full sm:w-auto">
            <SunmiBackButton href="/modulos/auditoria-pos-ventas" />
            <div className="flex flex-wrap items-end justify-end gap-3">
              {cajeros.length > 1 && (
                <div className="hidden sm:block">
                  <label className="text-[10px] sunmi-text-muted mb-1 block font-semibold uppercase tracking-wider">Cajero</label>
                  <SunmiSelectAdv
                    value={busqueda}
                    onChange={(val) => setBusqueda(val)}
                    placeholder="Todos los cajeros"
                    searchable
                    className="min-w-[180px] !py-2 text-[13px] [&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
                  >
                    <SunmiSelectOption value="">Todos los cajeros</SunmiSelectOption>
                    {cajeros.map((nombre) => (
                      <SunmiSelectOption key={nombre} value={nombre}>
                        {nombre}
                      </SunmiSelectOption>
                    ))}
                  </SunmiSelectAdv>
                </div>
              )}
              <SunmiDateRangePicker
                valueDesde={fechaDesde}
                valueHasta={fechaHasta}
                onChangeDesde={setFechaDesde}
                onChangeHasta={setFechaHasta}
                onApply={(desde, hasta) => {
                  setFechaDesde(desde);
                  setFechaHasta(hasta);
                  cargar(desde, hasta, 1, 25);
                }}
                maxDate={hoyArgentinaISO()}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ========== 2) CONTENIDO ========== */}

      {error && (
        <div className="text-[13px] sunmi-text-danger text-center sunmi-state-danger rounded-xl px-5 py-4 mt-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-20">
          <SunmiLoader />
        </div>
      )}

      {!loading && resumen && (
        <div className="space-y-5 mt-2">
          <AlertaSinTurno sinTurno={sinTurno} />

          {diasAgrupados.length === 0 && (
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-10">
              <p className="text-[14px] sunmi-text-muted text-center">
                Sin cajas en el período{filtroActivoTexto(franjaFiltro, busqueda)}.
              </p>
            </div>
          )}

          <div className="space-y-12">
            {diasAgrupados.map((dia) => (
              <BloqueDia key={dia.diaKey} fecha={dia.fecha} franjas={dia.franjas} />
            ))}
          </div>
        </div>
      )}

      {!loading && !resumen && !error && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-10 mt-8">
          <p className="text-center py-8 sunmi-text-muted text-[14px]">
            Seleccioná un rango de fechas y pulsá{" "}
            <strong className="text-[var(--foreground)]">Consultar</strong> para auditar los datos.
          </p>
        </div>
      )}

    </div>
  );
}

function filtroActivoTexto(franjaFiltro, busqueda) {
  const parts = [];
  if (busqueda.trim()) parts.push("con el filtro de búsqueda");
  if (franjaFiltro !== "todos") parts.push(`franja ${franjaFiltro}`);
  if (parts.length === 0) return "";
  return ` (${parts.join(", ")})`;
}