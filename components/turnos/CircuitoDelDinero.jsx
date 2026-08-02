"use client";

// Circuito del dinero físico de un turno: de dónde vino el fondo, qué se contó,
// qué se retiró y qué quedó para el turno siguiente.
//
// REGLA DE PRESENTACIÓN: `null` y `0` NO son lo mismo y no se muestran igual.
//   · null → el turno es ANTERIOR al circuito. Se muestra "—" y, si no hay ningún
//     dato, la sección entera no aparece: inventar ceros haría creer que se
//     retiró $0 cuando en realidad nadie registró nada.
//   · 0 → alguien decidió explícitamente no retirar nada. Se muestra "$0".
//
// Móvil: cards apiladas. Escritorio: dos columnas.

import SunmiCard from "@/components/sunmi/SunmiCard";
import Link from "next/link";

const fmt = (n) =>
  Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Importe que distingue ausencia de cero. */
function Monto({ valor, clase = "" }) {
  if (valor === null || valor === undefined) {
    return <span className="sunmi-text-muted" title="Este turno es anterior al circuito de caja">—</span>;
  }
  return <span className={clase}>${fmt(valor)}</span>;
}

function Dato({ etiqueta, children, ayuda }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b sunmi-divider last:border-0">
      <div className="min-w-0">
        <div className="text-[12px] sunmi-text-muted leading-tight">{etiqueta}</div>
        {ayuda && <div className="text-[11px] sunmi-text-muted opacity-70 leading-tight">{ayuda}</div>}
      </div>
      <div className="text-sm font-semibold shrink-0 text-right">{children}</div>
    </div>
  );
}

export default function CircuitoDelDinero({ turno }) {
  if (!turno) return null;

  const t = turno;
  const hayApertura =
    t.fondoSugeridoApertura != null || t.fondoRecibidoApertura != null || t.fondoOrigenTurnoId != null;
  const hayCierre =
    t.efectivoRetiradoCierre != null || t.fondoDejadoCierre != null || t.fondoConsumidoEnTurnoId != null;

  // Turno enteramente anterior al circuito: no se dibuja una sección de guiones.
  if (!hayApertura && !hayCierre) {
    return (
      <SunmiCard>
        <h3 className="text-sm font-bold mb-1">Entrega del efectivo</h3>
        <p className="text-[12px] sunmi-text-muted">
          Este cierre es anterior al circuito de entrega y fondo, así que no registra cuánto se
          retiró ni cuánto quedó en el cajón. Sus cifras de caja no cambiaron.
        </p>
      </SunmiCard>
    );
  }

  const dif = t.diferenciaFondoApertura;
  const difClase =
    dif == null || Number(dif) === 0 ? "" : Number(dif) > 0 ? "sunmi-text-warning" : "sunmi-text-danger";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* ── APERTURA ── */}
      <SunmiCard>
        <h3 className="text-sm font-bold mb-2">Al abrir</h3>
        <Dato etiqueta="Fondo que dejó el cierre anterior" ayuda="Lo que el sistema sugirió">
          <Monto valor={t.fondoSugeridoApertura} />
        </Dato>
        <Dato etiqueta="Fondo realmente recibido" ayuda="Lo que el cajero contó y confirmó">
          <Monto valor={t.fondoRecibidoApertura} />
        </Dato>
        <Dato etiqueta="Diferencia de recepción">
          <Monto valor={dif} clase={difClase} />
        </Dato>
        <Dato etiqueta="Fondo inicial del turno" ayuda="Es el recibido, no el sugerido">
          <Monto valor={t.montoInicial} />
        </Dato>
        <Dato etiqueta="Viene del turno">
          {t.fondoOrigenTurnoId ? (
            <Link href={`/modulos/turnos/${t.fondoOrigenTurnoId}`} className="sunmi-text-link underline">
              #{t.fondoOrigenTurnoId}
            </Link>
          ) : (
            <span className="sunmi-text-muted">—</span>
          )}
        </Dato>
        {t.observacionFondoApertura && (
          <div className="mt-2 text-[12px] sunmi-surface-soft rounded px-2 py-1.5">
            <span className="sunmi-text-muted">Observación de apertura: </span>
            {t.observacionFondoApertura}
          </div>
        )}
      </SunmiCard>

      {/* ── CIERRE ── */}
      <SunmiCard>
        {/* Esperado, contado y diferencia NO se repiten acá: viven una sola vez,
            arriba, en "Resultado del cierre". Tenerlos en dos tarjetas obligaba a
            comparar cifras iguales y era parte de por qué la pantalla no se leía. */}
        <h3 className="text-sm font-bold mb-2">Entrega del efectivo</h3>
        <Dato etiqueta="Se retiró del cajón">
          <Monto valor={t.efectivoRetiradoCierre} />
        </Dato>
        <Dato etiqueta="Quedó de fondo" ayuda="Para el turno siguiente">
          <Monto valor={t.fondoDejadoCierre} clase="sunmi-text-link" />
        </Dato>
        <Dato etiqueta="Destino del retiro">
          {t.destinoRetiroCierre || <span className="sunmi-text-muted">—</span>}
        </Dato>
        <Dato etiqueta="Lo recibió">
          {t.recibidoPorCierre || <span className="sunmi-text-muted">—</span>}
        </Dato>
        <Dato etiqueta="Fondo consumido por el turno">
          {t.fondoConsumidoEnTurnoId ? (
            <Link href={`/modulos/turnos/${t.fondoConsumidoEnTurnoId}`} className="sunmi-text-link underline">
              #{t.fondoConsumidoEnTurnoId}
            </Link>
          ) : t.fondoDejadoCierre != null ? (
            <span className="sunmi-text-warning">todavía sin tomar</span>
          ) : (
            <span className="sunmi-text-muted">—</span>
          )}
        </Dato>
        {t.observaciones && (
          <div className="mt-2 text-[12px] sunmi-surface-soft rounded px-2 py-1.5">
            <span className="sunmi-text-muted">Observación del cierre: </span>
            {t.observaciones}
          </div>
        )}
      </SunmiCard>
    </div>
  );
}
