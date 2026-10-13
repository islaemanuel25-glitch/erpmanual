"use client";

// components/turnos-y-cierres/PiezasTurnosYCierres.jsx
//
// LAS PIEZAS DE "TURNOS Y CIERRES" (Figma EVJ2KvVCrY0oVSowfboymQ, página
// "Turnos y cierres · móvil"). Se arman con el kit y con las piezas que ya usa
// Finanzas en el celular —`Bloque` y `Renglon`—; lo propio es poco: la
// insignia de estado, la cifra en su recuadro y la fila de una salida.
//
// Los colores son SIEMPRE clases semánticas del tema: la insignia pinta su
// contorno con `border-current`, el mismo token que el texto, en los catorce
// temas. Los textos y tonos los decide `lib/turnosYCierres/pantallaTurnosYCierres.js`.

import { Bloque, Renglon } from "@/components/finanzas/PiezasDelResumen";
import { horaAR } from "@/lib/fechas/formatearFechaHora";
import { CLASE_TONO, FONDO_DE_TONO, conPorcentajes, plata, tonoDeMedio } from "@/lib/turnosYCierres/pantallaTurnosYCierres";

export { Bloque, Renglon };

/** Una insignia con contorno: "Cerrada", "Abierta", "1 falta". */
export function Insignia({ texto, tono = "muted" }) {
  if (!texto) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-current px-2.5 py-0.5 text-sm2 font-medium whitespace-nowrap ${CLASE_TONO[tono] || CLASE_TONO.muted}`}
    >
      {texto}
    </span>
  );
}

/** Una cifra en su recuadro: "Tickets 102", "Vendido $624.100,00". */
export function Cifra({ rotulo, valor, tono = "strong" }) {
  return (
    // `sunmi-bg` y no `sunmi-surface-soft`: en los temas claros el fondo de
    // campo es casi el de la tarjeta y el recuadro desaparecía.
    <div className="min-w-0 rounded-lg sunmi-bg px-3 py-2">
      <div className="text-xs2 font-medium sunmi-text-muted">{rotulo}</div>
      <div className={`text-base2 font-bold tabular-nums truncate ${CLASE_TONO[tono] || CLASE_TONO.strong}`}>{valor}</div>
    </div>
  );
}

/** El rótulo de una sección dentro de una tarjeta: "COBRADO". */
export function Rotulo({ children }) {
  return <h3 className="pt-1 text-xs2 font-semibold tracking-wider sunmi-text-muted">{children}</h3>;
}

/** Una salida de efectivo: etiqueta, descripción y hora, y el monto SIN signo. */
export function FilaDeSalida({ s }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 rounded-md sunmi-bg px-1.5 py-0.5 text-xs2 font-semibold sunmi-text-warning">
        {s.etiqueta}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm3 sunmi-text-strong truncate">{s.corta}</div>
        <div className="text-xs2 sunmi-text-muted">{horaAR(s.instante)}</div>
      </div>
      <div className="shrink-0 text-sm3 font-semibold tabular-nums sunmi-text-strong">{plata(s.monto)}</div>
    </div>
  );
}

/**
 * EL RECUADRO GRANDE: el resultado del turno o la diferencia de la caja, con un
 * fondo suave del tono (verde, rojo, naranja) y la cifra protagonista.
 */
export function Recuadro({ rotulo, valor, tono = "success", children = null }) {
  return (
    <div data-recuadro={tono} className={`rounded-xl px-4 py-3 ${FONDO_DE_TONO[tono] || FONDO_DE_TONO.muted}`}>
      <div className={`text-xs2 font-semibold tracking-wider ${CLASE_TONO[tono] || CLASE_TONO.muted}`}>{rotulo}</div>
      <div className={`text-xl3 font-bold tabular-nums ${CLASE_TONO[tono] || CLASE_TONO.strong}`}>{valor}</div>
      {children}
    </div>
  );
}

/**
 * LA BARRA DE "CÓMO SE COBRÓ": un tramo por medio, del ancho de su parte, y
 * debajo la leyenda con su punto de color, nombre y monto. El color es un token
 * del tema por medio (`tonoDeMedio`), pintado con `bg-current`.
 */
export function BarraDeMedios({ medios = [], conPorcentaje = false }) {
  const tramos = conPorcentajes(medios);
  if (!tramos.length) return <p className="text-sm2 sunmi-text-muted">Sin ventas.</p>;
  return (
    <div className="space-y-2">
      <div data-barra-medios className="flex h-2.5 w-full overflow-hidden rounded-full sunmi-bg">
        {tramos.map((m) => (
          <span key={m.medio} className={`h-full bg-current ${tonoDeMedio(m.medio)}`} style={{ width: `${m.ancho}%` }} />
        ))}
      </div>
      {!conPorcentaje ? (
        <div className="space-y-1">
          {tramos.map((m) => (
            <div key={m.medio} className="flex items-center gap-2 text-sm3">
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-full bg-current ${tonoDeMedio(m.medio)}`} />
              <span className="min-w-0 flex-1 sunmi-text-strong">{m.etiqueta}</span>
              <span className="tabular-nums font-medium sunmi-text-strong">{plata(m.monto)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Un renglón de importe que se lee en un tono (la diferencia, el fiado). */
export function RenglonConTono({ rotulo, valor, tono = "strong", fuerte = false }) {
  return <Renglon rotulo={rotulo} valor={valor} fuerte={fuerte} colorValor={CLASE_TONO[tono] || null} />;
}
