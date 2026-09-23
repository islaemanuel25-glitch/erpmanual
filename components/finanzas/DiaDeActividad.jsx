"use client";

// components/finanzas/DiaDeActividad.jsx
//
// UN DÍA DE ACTIVIDAD ECONÓMICA: los turnos y los movimientos de caja de ese
// día, adentro del mismo marco.
//
// ── EL MARCO Y LA BANDA SON LOS DE TRANSFERENCIAS ────────────────────────
//
// `DiaConBanda`, la pieza que se extrajo de `DiaDeTransferencias` cuando esta
// pantalla apareció. No es una copia parecida: es el mismo componente, así que
// las dos listas se leen igual y no pueden derivar.
//
// ── EL TOTAL DE LA BANDA SON LAS VENTAS DEL DÍA ──────────────────────────
//
// Y no la suma de todos los renglones. Sumar ventas, ingresos y retiros en un
// solo número daría algo que no significa nada: un retiro de recaudación es la
// misma venta saliendo del cajón, así que restarla la contaría dos veces con
// signo cambiado. La banda dice lo que se vendió; los movimientos dicen lo suyo
// en su propia fila.
//
// ── EL MOTIVO DE UN MOVIMIENTO SE MUESTRA, NO SE INTERPRETA ──────────────
//
// "Panadería" es texto que alguien tipeó en el POS. Acá se dibuja tal cual, con
// el prefijo "Motivo:" que lo marca como lo que es. No se convierte en un pago a
// proveedor y no se clasifica como gasto: ese hecho no existe todavía.

import SunmiButton from "@/components/sunmi/SunmiButton";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import { HECHO, rotuloDelDiaFinanciero } from "@/lib/finanzas/actividadFinanciera";
import { formatearMoneda } from "@/lib/moneda";

export default function DiaDeActividad({ dia, onAbrirTurno }) {
  return (
    <DiaConBanda
      titulo={dia?.titulo}
      subtitulo={rotuloDelDiaFinanciero(dia)}
      importe={formatearMoneda(dia?.ventas)}
    >
      {(dia?.hechos || []).map((h) => (
        <FilaDeHecho key={h.clave} hecho={h} onAbrirTurno={onAbrirTurno} />
      ))}
    </DiaConBanda>
  );
}

/**
 * UN HECHO DEL DÍA.
 *
 * Los tres —turno, ingreso y retiro— se dibujan igual y abren lo mismo: el
 * TURNO. No es una simplificación: un movimiento de caja no tiene pantalla
 * propia en ninguna parte del ERP, y el documento que lo explica es el turno en
 * el que ocurrió. Ésa es su referencia de origen y viaja en `hecho.origen`.
 */
function FilaDeHecho({ hecho, onAbrirTurno }) {
  const turnoId =
    hecho?.tipo === HECHO.TURNO ? hecho?.origen?.id : hecho?.origen?.turnoId;
  const sePuedeAbrir = Boolean(turnoId && onAbrirTurno);

  // El signo se dibuja con el dato que trae el hecho, no con una resta escrita
  // acá: el importe guardado es positivo en los dos casos y lo que dice si sale
  // o entra es la clase del movimiento.
  const sale = hecho?.tipo === HECHO.RETIRO;
  const entra = hecho?.tipo === HECHO.INGRESO;
  const signo = sale ? "−" : entra ? "+" : "";

  const contenido = (
    <>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-base font-semibold sunmi-text-strong">{hecho?.titulo}</span>
          {hecho?.anulado && <span className="text-sm3 sunmi-text-warning">· anulado</span>}
        </div>
        <div className="text-sm2 sunmi-text-muted">{hecho?.subtitulo}</div>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1">
        <div
          className={`text-base2 font-semibold tabular-nums ${
            hecho?.esRecaudacion ? "sunmi-text-muted" : "sunmi-text-strong"
          }`}
        >
          {signo}
          {formatearMoneda(hecho?.importe)}
        </div>
        {sePuedeAbrir && <div className="text-sm2 font-medium sunmi-text-accent">Ver ›</div>}
      </div>
    </>
  );

  // El separador va ARRIBA de cada fila. La banda queda encima de la primera,
  // así que la línea también la separa de ella y la tarjeta no termina en una
  // línea colgando. Mismo criterio que la lista de transferencias.
  const separador = "border-t sunmi-divider";

  if (!sePuedeAbrir) {
    return (
      <div className={`px-4 py-3.5 flex items-center justify-between gap-3 ${separador}`}>
        {contenido}
      </div>
    );
  }

  return (
    <SunmiButton
      type="button"
      color="ghost"
      onClick={() => onAbrirTurno?.(turnoId)}
      className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 min-h-0 rounded-none text-left ${separador}`}
    >
      {contenido}
    </SunmiButton>
  );
}
