"use client";

// components/finanzas/pagos/CamposDeOrigenDelPago.jsx
//
// CON QUÉ SE PAGA Y DE DÓNDE SALE LA PLATA: medio, ubicación de origen y, si es
// efectivo, el turno de cuyo cajón sale.
//
// ── POR QUÉ ES UNA PIEZA ─────────────────────────────────────────────────
//
// Porque el mismo formulario vive en dos lugares: registrar un pago desde
// Finanzas y el pago inicial al cerrar una compra. Se sacó TAL CUAL de
// `ModalRegistrarPago`, con su búsqueda de turnos adentro, para que las dos
// pantallas no puedan pedir el turno de dos maneras distintas.
//
// Los valores los guarda quien la usa (controlada); lo único propio es la lista
// de turnos, que depende del origen y del medio elegidos.

import { useEffect, useState } from "react";

import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import { horaAR, fechaAR } from "@/lib/fechas/formatearFechaHora";
import { medioTocaLaCaja } from "@/lib/finanzas/pagosProveedores";

/** Un campo con su rótulo arriba. */
export function Campo({ rotulo, children }) {
  return (
    <div className="space-y-1">
      <div className="text-sm2 sunmi-text-muted">{rotulo}</div>
      {children}
    </div>
  );
}

export default function CamposDeOrigenDelPago({
  /** Mientras es false no se buscan turnos: el formulario no está a la vista. */
  activo = true,
  medios = [],
  origenes = [],
  medio,
  onMedio,
  origen,
  onOrigen,
  turnoId,
  onTurno,
  onError,
}) {
  const [turnos, setTurnos] = useState([]);
  const [cargandoTurnos, setCargandoTurnos] = useState(false);

  const efectivo = medioTocaLaCaja(medio);

  // Los turnos abiertos del origen, solo cuando hacen falta.
  useEffect(() => {
    if (!activo || !efectivo || !origen) {
      setTurnos([]);
      return;
    }
    let vigente = true;
    setCargandoTurnos(true);
    onTurno?.("");
    (async () => {
      try {
        const url = new URL(
          "/api/finanzas/pagos-proveedores/turnos-operativos",
          window.location.origin
        );
        url.searchParams.set("origen", origen);
        const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudieron leer los turnos abiertos.");
        if (!vigente) return;
        setTurnos(j.turnos || []);
        if ((j.turnos || []).length === 1) onTurno?.(String(j.turnos[0].id));
      } catch (e) {
        if (vigente) {
          setTurnos([]);
          onError?.(e.message);
        }
      } finally {
        if (vigente) setCargandoTurnos(false);
      }
    })();
    return () => {
      vigente = false;
    };
    // `onTurno` y `onError` son del padre y cambian de identidad en cada render:
    // meterlos acá volvería a buscar los turnos sin que nada haya cambiado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, efectivo, origen]);

  return (
    <>
      <Campo rotulo="Medio de pago">
        <SunmiSelectAdv value={medio} onChange={(v) => onMedio?.(v)}>
          {medios.map((m) => (
            <SunmiSelectOption key={m.valor} value={m.valor}>
              {m.texto}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </Campo>

      <Campo rotulo="De dónde sale el dinero">
        <SunmiSelectAdv
          value={origen}
          onChange={(v) => onOrigen?.(v)}
          placeholder="Elegí la ubicación"
        >
          {origenes.map((o) => (
            <SunmiSelectOption key={o.localId} value={String(o.localId)}>
              {o.nombre}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </Campo>

      {efectivo && origen && (
        <Campo rotulo="Turno de caja">
          {cargandoTurnos ? (
            <div className="text-xs sunmi-text-muted">Buscando turnos abiertos…</div>
          ) : turnos.length === 0 ? (
            <SunmiAviso tono="warning" titulo="Sin turno abierto">
              El efectivo sale de un cajón que está operando, y esta ubicación no tiene ninguno.
            </SunmiAviso>
          ) : (
            <SunmiSelectAdv
              value={turnoId}
              onChange={(v) => onTurno?.(v)}
              placeholder="Elegí el turno"
            >
              {turnos.map((t) => (
                <SunmiSelectOption key={t.id} value={String(t.id)}>
                  {`${t.quien || "Turno"} · abierto ${fechaAR(t.apertura)} ${horaAR(t.apertura)}`}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          )}
        </Campo>
      )}
    </>
  );
}
