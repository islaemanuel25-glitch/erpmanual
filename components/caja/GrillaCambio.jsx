"use client";

// Grilla del CAMBIO que queda en el cajón.
//
// Cada fila muestra tres cosas juntas: cuántos se contaron, cuántos quedan y
// cuánto suma lo que queda. La columna "contadas" no es decorativa — es lo que
// hace evidente el tope. Sin ella, "no podés dejar 5" aparece como una regla
// caída del cielo.
//
// No existe una fila de "billetes que se retiran": lo que sale es lo contado
// menos lo que queda, y eso lo calcula la página.
//
// Las denominaciones vienen de lib/caja/conteoBilletes. Dispersarlas es la forma
// segura de que dejen de coincidir con las del conteo.

import SunmiInput from "@/components/sunmi/SunmiInput";
import {
  CLAVE_MONEDAS,
  filasCambio,
  normalizarCantidad,
  normalizarMonedas,
  ajustarCantidad,
  totalDesglose,
} from "@/lib/caja/conteoBilletes";

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function GrillaCambio({
  desgloseContado = {},
  desgloseCambio = {},
  onCambiar,
  total = null,
}) {
  const filas = filasCambio({ desgloseContado, desgloseCambio });
  const monedasContadas = normalizarMonedas(desgloseContado[CLAVE_MONEDAS]);
  const monedasQuedan = normalizarMonedas(desgloseCambio[CLAVE_MONEDAS]);
  const hayConteoDetallado = filas.some((f) => f.contadas !== null);
  const monedasExceden = hayConteoDetallado && monedasQuedan > monedasContadas;
  const totalMostrado = total == null ? totalDesglose(desgloseCambio) : total;

  const set = (clave, valor) => onCambiar?.({ ...desgloseCambio, [clave]: valor });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[3.6rem_2.6rem_1fr_auto] sm:grid-cols-[5rem_3.5rem_1fr_6.5rem] items-center gap-1.5 text-[10px] sunmi-text-muted uppercase tracking-wide">
        <span>Billete</span>
        <span className="text-center">Contadas</span>
        <span className="text-center">Quedan</span>
        <span className="text-right">Subtotal</span>
      </div>

      <div className="space-y-1.5">
        {filas.map(({ valor, etiqueta, contadas, quedan, subtotalQueda, excede }) => (
          <div
            key={valor}
            className="grid grid-cols-[3.6rem_2.6rem_1fr_auto] sm:grid-cols-[5rem_3.5rem_1fr_6.5rem] items-center gap-1.5"
          >
            <label
              htmlFor={`cambio-${valor}`}
              className={`text-[13px] font-semibold tabular-nums ${
                excede ? "sunmi-text-danger" : "sunmi-text-strong"
              }`}
            >
              {etiqueta}
            </label>

            <span className="text-[12px] text-center tabular-nums sunmi-text-muted">
              {contadas === null ? "—" : contadas}
            </span>

            <div className="flex items-center gap-1 min-w-0">
              <BotonPaso
                signo="−"
                etiqueta={`Dejar un billete menos de ${etiqueta}`}
                onClick={() => onCambiar?.(ajustarCantidad(desgloseCambio, valor, -1))}
                deshabilitado={quedan === 0}
              />
              <SunmiInput
                id={`cambio-${valor}`}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={desgloseCambio[valor] ?? ""}
                onChange={(e) => set(valor, e.target.value)}
                placeholder="0"
                className="text-center tabular-nums min-w-0 !px-1"
              />
              <BotonPaso
                signo="+"
                etiqueta={`Dejar un billete más de ${etiqueta}`}
                onClick={() => onCambiar?.(ajustarCantidad(desgloseCambio, valor, 1))}
                // El tope se aplica acá para que el botón no ofrezca lo imposible.
                deshabilitado={contadas !== null && quedan >= contadas}
              />
            </div>

            <div
              className={`text-[13px] text-right tabular-nums font-mono ${
                excede ? "sunmi-text-danger" : quedan ? "sunmi-text-strong" : "sunmi-text-muted"
              }`}
            >
              {money(subtotalQueda)}
            </div>
          </div>
        ))}

        {/* Monedas y billetes chicos: se deja un IMPORTE, no una cantidad. */}
        <div className="grid grid-cols-[3.6rem_2.6rem_1fr_auto] sm:grid-cols-[5rem_3.5rem_1fr_6.5rem] items-center gap-1.5 pt-1">
          <label
            htmlFor="cambio-monedas"
            className={`text-[12px] font-semibold leading-tight ${
              monedasExceden ? "sunmi-text-danger" : "sunmi-text-strong"
            }`}
          >
            Monedas / otros
          </label>
          <span className="text-[12px] text-center tabular-nums sunmi-text-muted">
            {hayConteoDetallado ? money(monedasContadas) : "—"}
          </span>
          <SunmiInput
            id="cambio-monedas"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={desgloseCambio[CLAVE_MONEDAS] ?? ""}
            onChange={(e) => set(CLAVE_MONEDAS, e.target.value)}
            placeholder="0.00"
            className="text-center tabular-nums min-w-0 !px-1"
          />
          <div
            className={`text-[13px] text-right tabular-nums font-mono ${
              monedasExceden ? "sunmi-text-danger" : monedasQuedan ? "sunmi-text-strong" : "sunmi-text-muted"
            }`}
          >
            {money(monedasQuedan)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t sunmi-border">
        <span className="text-sm font-semibold sunmi-text-muted">Cambio que queda</span>
        <span className="text-lg font-bold font-mono tabular-nums sunmi-text-strong">
          {money(totalMostrado)}
        </span>
      </div>
    </div>
  );
}

/** Botón táctil de ±1. Área grande: se usa con el dedo en un mostrador. */
function BotonPaso({ signo, etiqueta, onClick, deshabilitado = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      className="shrink-0 w-8 h-8 rounded-md sunmi-btn-base sunmi-btn-slate text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {signo}
    </button>
  );
}

export { normalizarCantidad };
