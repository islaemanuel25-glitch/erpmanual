"use client";

// Arqueos del turno: una tarjeta RESUMEN y, si el usuario quiere, el detalle.
//
// Antes se abrían los cinco cortes de entrada, cada uno con su propia grilla de
// esperado/contado/diferencia. En un turno como el 175 eso son cinco bloques
// idénticos empujando la información importante fuera de la pantalla, y encima el
// usuario tenía que restar dos tarjetas a ojo para saber qué había pasado en el
// medio. Ahora cada corte dice en una línea qué entró y qué salió desde el corte
// anterior.
//
// NO se suman las diferencias: un faltante detectado a las 10:47 sigue faltando a
// las 12:25 y a las 14:03; es el mismo, no tres veces.

import { useEffect, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import {
  desglosarEntreArqueos,
  resumenArqueosVista,
  // Se usa abajo para decidir si cada fila es un retiro real o un conteo
  // histórico. Faltaba: el componente lo llamaba sin importarlo y el bundle
  // quedaba con un identificador suelto → ReferenceError al desplegar la lista.
  etiquetaRegistro,
} from "@/lib/caja/vistaTurno";

const fmt = (n) =>
  Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "-";

function tono(dif) {
  const d = Number(dif) || 0;
  if (Math.round(d * 100) === 0) return "sunmi-text-success";
  return d > 0 ? "sunmi-text-warning" : "sunmi-text-danger";
}

function signo(dif) {
  const d = Number(dif) || 0;
  return `${d > 0 ? "+" : ""}$${fmt(d)}`;
}


export default function ArqueosDelTurno({ turnoId, movimientos = [], montoInicial = 0 }) {
  const [arqueos, setArqueos] = useState(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!turnoId) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/pos-ventas/arqueos/listar?turnoId=${turnoId}`, {
          credentials: "include",
        });
        const d = await res.json();
        if (vivo && d.ok) setArqueos(d.arqueos || []);
      } catch {
        if (vivo) setArqueos([]);
      }
    })();
    return () => { vivo = false; };
  }, [turnoId]);

  if (arqueos === null) {
    return (
      <SunmiCard>
        <h2 className="text-base font-bold mb-1">Retiros y conteos</h2>
        <p className="text-sm sunmi-text-muted">Cargando…</p>
      </SunmiCard>
    );
  }

  if (arqueos.length === 0) {
    return (
      <SunmiCard>
        <h2 className="text-base font-bold mb-1">Retiros y conteos</h2>
        <p className="text-sm sunmi-text-muted">No hubo retiros ni conteos en este turno.</p>
      </SunmiCard>
    );
  }

  const r = resumenArqueosVista(arqueos);
  const conDesglose = desglosarEntreArqueos(arqueos, movimientos, montoInicial);

  return (
    <SunmiCard>
      <h2 className="text-base font-bold mb-3">Retiros y conteos históricos</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <div className="text-[11px] sunmi-text-muted leading-tight">Cortes</div>
          <div className="text-lg font-bold tabular-nums">{r.cantidad}</div>
        </div>
        <div>
          <div className="text-[11px] sunmi-text-muted leading-tight">Con diferencia</div>
          <div className={`text-lg font-bold tabular-nums ${r.conDiferencia ? "sunmi-text-warning" : "sunmi-text-success"}`}>
            {r.conDiferencia}
          </div>
        </div>
        <div>
          <div className="text-[11px] sunmi-text-muted leading-tight">Mayor diferencia</div>
          <div className={`text-lg font-bold tabular-nums ${tono(r.mayorDiferencia)}`}>{signo(r.mayorDiferencia)}</div>
        </div>
        <div>
          <div className="text-[11px] sunmi-text-muted leading-tight">Diferencia final</div>
          <div className={`text-lg font-bold tabular-nums ${r.hayFinal ? tono(r.diferenciaFinal) : "sunmi-text-muted"}`}>
            {r.hayFinal ? signo(r.diferenciaFinal) : "—"}
          </div>
        </div>
      </div>

      <SunmiButton color="cyan" onClick={() => setAbierto((v) => !v)} className="!w-full min-h-11">
        {abierto ? "Ocultar detalle" : `Ver ${r.cantidad} registro${r.cantidad === 1 ? "" : "s"}`}
      </SunmiButton>

      {abierto && (
        <div className="mt-3 space-y-2">
          {conDesglose.map((a) => (
            <FilaRegistro key={a.id} a={a} />
          ))}
        </div>
      )}
    </SunmiCard>
  );
}

/**
 * Una fila del detalle: el registro y qué pasó desde el anterior.
 *
 * Está separada y EXPORTADA para poder renderizarla en una prueba sin montar
 * todo el componente —que antes de mostrar esto hace un fetch y espera un
 * click—. No es un adorno: el import de `etiquetaRegistro` faltaba, el bundle
 * quedó con un identificador suelto y la sección reventaba con ReferenceError
 * en producción. Ninguna prueba lo detectó porque ninguna ejecutaba este JSX.
 */
export function FilaRegistro({ a }) {
  return (
    <div className="rounded-lg sunmi-surface-soft p-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-sm font-bold">
          {hora(a.fechaHora)}
          <span className="ml-2 text-[11px] font-normal sunmi-text-muted">
            {etiquetaRegistro(a)}
          </span>
        </span>
        <span className={`text-base font-bold tabular-nums ${tono(a.diferencia)}`}>{signo(a.diferencia)}</span>
      </div>

      <div className="text-[11px] sunmi-text-muted mt-0.5">
        Período {hora(a.periodoDesde)} a {hora(a.periodoHasta)}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <div>
          <div className="text-[11px] sunmi-text-muted leading-tight">Esperado</div>
          <div className="text-sm font-semibold tabular-nums">${fmt(a.efectivoEsperado)}</div>
        </div>
        <div>
          <div className="text-[11px] sunmi-text-muted leading-tight">Contado</div>
          <div className="text-sm font-semibold tabular-nums">${fmt(a.efectivoContado)}</div>
        </div>
      </div>

      {/* La línea que evita tener que restar dos tarjetas a ojo. */}
      <p className="text-[12px] mt-2 leading-snug">{a.desdeAnterior?.texto}</p>

      {a.observacion && (
        <p className="text-[11px] sunmi-text-muted mt-1 leading-snug">“{a.observacion}”</p>
      )}
      {a.realizadoPor && (
        <p className="text-[11px] sunmi-text-muted mt-0.5">Lo hizo {a.realizadoPor}</p>
      )}
    </div>
  );
}
