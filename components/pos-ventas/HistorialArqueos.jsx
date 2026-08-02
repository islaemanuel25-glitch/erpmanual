"use client";

// Historial de arqueos de un turno.
//
// Muestra cada corte por separado y NO una "diferencia acumulada": sumar las
// diferencias de todos los cortes cuenta el mismo faltante una vez por arqueo
// posterior. Un faltante de $1.000 detectado a las 10:47 sigue faltando a las
// 12:25 y a las 14:03 — es el mismo, no $3.000. Lo que sí se resume: la
// diferencia del corte final, la máxima detectada y cuántos cortes tuvieron
// diferencia.
//
// Móvil: cards. Escritorio: tabla. Sin scroll horizontal obligatorio.

import { useEffect, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

const TZ_AR = "America/Argentina/Cordoba";

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function hora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ_AR, hour: "2-digit", minute: "2-digit",
  }).format(d);
}

function fechaHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ_AR, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

/** Cero exacto = correcto. Un centavo ya es diferencia. */
function clasificar(diferencia) {
  const c = Math.round((Number(diferencia) || 0) * 100);
  if (c === 0) return { label: "Correcto", clase: "sunmi-state-success sunmi-text-success" };
  return c > 0
    ? { label: "Sobrante", clase: "sunmi-state-warning sunmi-text-warning" }
    : { label: "Faltante", clase: "sunmi-state-danger sunmi-text-danger" };
}

function Badge({ diferencia }) {
  const { label, clase } = clasificar(diferencia);
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${clase}`}>
      {label}
    </span>
  );
}

export default function HistorialArqueos({ turnoId }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!turnoId) return undefined;
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const res = await fetch(`/api/pos-ventas/arqueos/listar?turnoId=${turnoId}`, {
          credentials: "include",
          cache: "no-store",
        });
        const d = await res.json();
        if (vivo && d.ok) setDatos(d);
      } catch {
        // Silencioso: el historial es informativo y no puede romper el detalle.
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [turnoId]);

  if (cargando) {
    return <SunmiCard><div className="text-center py-6"><SunmiLoader /></div></SunmiCard>;
  }

  const arqueos = datos?.arqueos || [];
  const r = datos?.resumen;

  if (arqueos.length === 0) {
    return (
      <SunmiCard>
        <div className="text-center py-8 sunmi-text-muted text-sm">
          Este turno no tiene arqueos registrados
        </div>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="space-y-3">
      {/* Métricas del historial. NO hay diferencia acumulada, a propósito. */}
      {r && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Tile label="Arqueos" valor={r.cantidad} />
          <Tile label="Con diferencia" valor={r.cantidadConDiferencia} />
          <Tile
            label="Máxima diferencia"
            valor={money(r.maximaDiferencia)}
            clase={clasificar(r.maximaDiferencia).clase.split(" ")[1]}
          />
          <Tile
            label="Diferencia final"
            valor={r.tieneFinal ? money(r.diferenciaFinal) : "—"}
            clase={r.tieneFinal ? clasificar(r.diferenciaFinal).clase.split(" ")[1] : "sunmi-text-muted"}
          />
        </div>
      )}

      {/* Móvil: cards */}
      <div className="md:hidden space-y-2">
        {arqueos.map((a, i) => (
          <div key={a.id} className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold sunmi-text-strong text-[14px] leading-tight">
                  {a.tipo === "FINAL" ? "Arqueo final" : `Arqueo #${i + 1}`}
                  <span className="sunmi-text-muted font-normal ml-1.5">{hora(a.fechaHora)}</span>
                </div>
                <div className="text-[11px] sunmi-text-muted">
                  {hora(a.periodoDesde)} a {hora(a.periodoHasta)}
                </div>
              </div>
              <Badge diferencia={a.diferencia} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-[12px]">
              <Dato label="Esperado" valor={money(a.efectivoEsperado)} />
              <Dato label="Contado" valor={money(a.efectivoContado)} />
              <Dato
                label="Diferencia"
                valor={money(a.diferencia)}
                clase={clasificar(a.diferencia).clase.split(" ")[1]}
              />
            </div>
            <div className="text-[11px] sunmi-text-muted">
              {a.realizadoPor || "—"}
              {a.minutosDemora > 0 && ` · ${a.minutosDemora} min de demora`}
              {a.cantidadPostergaciones > 0 && ` · ${a.cantidadPostergaciones} postergación${a.cantidadPostergaciones === 1 ? "" : "es"}`}
            </div>
            {a.observacion && (
              <div className="text-[12px] sunmi-text-muted italic">{a.observacion}</div>
            )}
          </div>
        ))}
      </div>

      {/* Escritorio: tabla */}
      <div className="hidden md:block overflow-x-auto">
        <SunmiTable
          headers={[
            "Arqueo",
            "Hora",
            "Período",
            { label: "Esperado", className: "text-right" },
            { label: "Contado", className: "text-right" },
            { label: "Diferencia", className: "text-right" },
            "Estado",
            { label: "Demora", className: "text-right" },
            { label: "Posterg.", className: "text-center" },
            "Responsable",
            "Observación",
          ]}
        >
          {arqueos.map((a, i) => (
            <tr key={a.id} className="align-middle sunmi-row-hover transition-colors">
              <td className="px-2.5 py-3 font-semibold sunmi-text-strong text-[13px] whitespace-nowrap">
                {a.tipo === "FINAL" ? "Final" : `#${i + 1}`}
              </td>
              <td className="px-2.5 py-3 font-mono text-[12px] whitespace-nowrap">{fechaHora(a.fechaHora)}</td>
              <td className="px-2.5 py-3 font-mono text-[11px] sunmi-text-muted whitespace-nowrap">
                {hora(a.periodoDesde)} → {hora(a.periodoHasta)}
              </td>
              <td className="px-2.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                {money(a.efectivoEsperado)}
              </td>
              <td className="px-2.5 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                {money(a.efectivoContado)}
              </td>
              <td
                className={`px-2.5 py-3 text-right font-mono tabular-nums font-bold whitespace-nowrap ${clasificar(a.diferencia).clase.split(" ")[1]}`}
              >
                {money(a.diferencia)}
              </td>
              <td className="px-2.5 py-3"><Badge diferencia={a.diferencia} /></td>
              <td className="px-2.5 py-3 text-right tabular-nums whitespace-nowrap sunmi-text-muted">
                {a.minutosDemora > 0 ? `${a.minutosDemora} min` : "—"}
              </td>
              <td className="px-2.5 py-3 text-center tabular-nums sunmi-text-muted">
                {a.cantidadPostergaciones || "—"}
              </td>
              <td className="px-2.5 py-3 text-[12px] whitespace-nowrap">{a.realizadoPor || "—"}</td>
              <td className="px-2.5 py-3 text-[12px] sunmi-text-muted max-w-[200px] truncate">
                {a.observacion || "—"}
              </td>
            </tr>
          ))}
        </SunmiTable>
      </div>
    </SunmiCard>
  );
}

function Tile({ label, valor, clase = "sunmi-text-strong" }) {
  return (
    <div className="sunmi-surface-soft sunmi-border rounded-lg px-3 py-2 min-w-0">
      <div className="text-[11px] sunmi-text-muted leading-tight truncate">{label}</div>
      <div className={`text-sm sm:text-base font-bold font-mono tabular-nums leading-tight ${clase}`}>
        {valor}
      </div>
    </div>
  );
}

function Dato({ label, valor, clase = "sunmi-text-strong" }) {
  return (
    <div>
      <div className="text-[10px] sunmi-text-muted">{label}</div>
      <div className={`tabular-nums font-mono ${clase}`}>{valor}</div>
    </div>
  );
}
