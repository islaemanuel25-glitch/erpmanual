"use client";

// Grilla del CAMBIO que queda en el cajón.
//
// Cada fila muestra tres cosas juntas: cuántos se contaron, cuántos quedan y
// cuánto suma lo que queda. La columna "contadas" no es decorativa — es lo que
// hace evidente el tope.
//
// La geometría viene de geometriaGrilla, compartida con la grilla de conteo: la
// primera y la última columna son las mismas en los dos bloques, así las
// etiquetas y los subtotales quedan alineados entre uno y otro.
//
// No existe una fila de "billetes que se retiran": lo que sale es lo contado
// menos lo que queda, y eso lo calcula la página.

import SunmiInput from "@/components/sunmi/SunmiInput";
import {
  CLAVE_MONEDAS,
  filasCambio,
  normalizarCantidad,
  normalizarMonedas,
  ajustarCantidad,
  totalDesglose,
} from "@/lib/caja/conteoBilletes";
import {
  GRID_CAMBIO,
  CELDA_SUBTOTAL,
  CELDA_ETIQUETA,
  CELDA_CONTROL,
  BOTON_PASO,
  HUECO_BOTON,
  importeGrilla,
} from "@/components/caja/geometriaGrilla";

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
      <div className={`${GRID_CAMBIO} text-[10px] sunmi-text-muted uppercase tracking-wide`}>
        <span>Billete</span>
        <span className="text-center">Contadas</span>
        <span className="text-center">Quedan</span>
        <span className="text-right">Subtotal</span>
      </div>

      <div className="space-y-1.5">
        {filas.map(({ valor, etiqueta, contadas, quedan, subtotalQueda, excede }) => (
          <div key={valor} className={GRID_CAMBIO}>
            <label
              htmlFor={`cambio-${valor}`}
              className={`${CELDA_ETIQUETA} ${excede ? "sunmi-text-danger" : "sunmi-text-strong"}`}
            >
              {etiqueta}
            </label>

            <span className="text-[12px] text-center tabular-nums sunmi-text-muted">
              {contadas === null ? "—" : contadas}
            </span>

            <div className={CELDA_CONTROL}>
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
              className={`${CELDA_SUBTOTAL} ${
                excede ? "sunmi-text-danger" : quedan ? "sunmi-text-strong" : "sunmi-text-muted"
              }`}
            >
              {importeGrilla(subtotalQueda)}
            </div>
          </div>
        ))}

        {/* Monedas: se deja un IMPORTE, no una cantidad. Misma grilla y huecos
            del tamaño de un botón, para que el input arranque en la misma x. */}
        <div className={GRID_CAMBIO}>
          <label
            htmlFor="cambio-monedas"
            className={`${CELDA_ETIQUETA} ${
              monedasExceden ? "sunmi-text-danger" : "sunmi-text-strong"
            }`}
          >
            Monedas / otros
          </label>
          {/* El tope de monedas se muestra en pesos enteros: con centavos no
              entra en la columna y partía en dos renglones. Se redondea HACIA
              ABAJO para no anunciar un tope mayor que el real — la validación
              sigue comparando al centavo. */}
          <span className="text-[11px] text-center tabular-nums sunmi-text-muted leading-tight min-w-0">
            {hayConteoDetallado ? Math.floor(monedasContadas).toLocaleString("es-AR") : "—"}
          </span>
          <div className={CELDA_CONTROL}>
            <button type="button" tabIndex={-1} aria-hidden="true" className={HUECO_BOTON} />
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
            <button type="button" tabIndex={-1} aria-hidden="true" className={HUECO_BOTON} />
          </div>
          <div
            className={`${CELDA_SUBTOTAL} ${
              monedasExceden ? "sunmi-text-danger" : monedasQuedan ? "sunmi-text-strong" : "sunmi-text-muted"
            }`}
          >
            {importeGrilla(monedasQuedan)}
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

/** Botón táctil de ±1. Mismo tamaño que en la grilla de conteo. */
function BotonPaso({ signo, etiqueta, onClick, deshabilitado = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      className={BOTON_PASO}
    >
      {signo}
    </button>
  );
}

export { normalizarCantidad };
