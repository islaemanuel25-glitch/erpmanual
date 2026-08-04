"use client";

// Grilla de conteo: cantidad por billete, subtotal por fila y total.
//
// La geometría de las columnas NO se define acá: viene de geometriaGrilla, que
// la comparte con la grilla del cambio. Escribirla dos veces era lo que hacía
// que las etiquetas y los subtotales de los dos bloques no arrancaran en la
// misma x.
//
// Las denominaciones tampoco se declaran acá: vienen de lib/caja/conteoBilletes.

import SunmiInput from "@/components/sunmi/SunmiInput";
import {
  DENOMINACIONES,
  CLAVE_MONEDAS,
  normalizarCantidad,
  subtotalDenominacion,
  totalDesglose,
  ajustarCantidad,
} from "@/lib/caja/conteoBilletes";
import {
  GRID_CONTEO,
  CELDA_SUBTOTAL,
  CELDA_ETIQUETA,
  CELDA_CONTROL,
  BOTON_PASO,
  HUECO_BOTON,
  importeGrilla,
} from "@/components/caja/geometriaGrilla";

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TablaDenominaciones({
  desglose = {},
  onCambiar,
  // Tope por denominación: en el paso de retiro son los billetes contados.
  topes = null,
  idPrefijo = "den",
  titulo,
}) {
  const total = totalDesglose(desglose);

  const setCantidad = (clave, valor) => {
    onCambiar?.({ ...desglose, [clave]: valor });
  };

  return (
    <div className="space-y-2">
      {/* Este rótulo existe SOLO en móvil. En escritorio era una fila de más que
          la grilla del cambio no tiene, y corría los 21 px que desalineaban las
          dos tablas fila por fila. Arriba en escritorio el título del bloque y
          el encabezado de columnas ya dicen lo mismo. */}
      {titulo && <div className="text-xs sunmi-text-muted xl:hidden">{titulo}</div>}

      <div className={`${GRID_CONTEO} text-[10px] sunmi-text-muted uppercase tracking-wide`}>
        <span>Billete</span>
        <span className="text-center">Cantidad</span>
        <span className="text-right">Subtotal</span>
      </div>

      <div className="space-y-1.5">
        {DENOMINACIONES.map(({ valor, etiqueta }) => {
          const cantidad = normalizarCantidad(desglose[valor]);
          const tope = topes ? normalizarCantidad(topes[valor]) : null;
          const excede = tope !== null && cantidad > tope;
          return (
            <div key={valor} className={GRID_CONTEO}>
              <label
                htmlFor={`${idPrefijo}-${valor}`}
                className={`${CELDA_ETIQUETA} ${excede ? "sunmi-text-danger" : "sunmi-text-strong"}`}
              >
                {etiqueta}
              </label>

              <div className={CELDA_CONTROL}>
                <BotonPaso
                  signo="−"
                  etiqueta={`Quitar un billete de ${etiqueta}`}
                  onClick={() => onCambiar?.(ajustarCantidad(desglose, valor, -1))}
                  deshabilitado={cantidad === 0}
                />
                <SunmiInput
                  id={`${idPrefijo}-${valor}`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={desglose[valor] ?? ""}
                  onChange={(e) => setCantidad(valor, e.target.value)}
                  placeholder="0"
                  className="text-center tabular-nums min-w-0 !px-1"
                />
                <BotonPaso
                  signo="+"
                  etiqueta={`Agregar un billete de ${etiqueta}`}
                  onClick={() => onCambiar?.(ajustarCantidad(desglose, valor, 1))}
                />
              </div>

              <div
                className={`${CELDA_SUBTOTAL} ${
                  excede ? "sunmi-text-danger" : cantidad ? "sunmi-text-strong" : "sunmi-text-muted"
                }`}
              >
                {importeGrilla(subtotalDenominacion(valor, cantidad))}
                {excede && <span className="block text-[10px] leading-tight">contaste {tope}</span>}
              </div>
            </div>
          );
        })}

        {/* Monedas y billetes chicos: se carga el IMPORTE, no una cantidad. Usa
            la MISMA grilla y un hueco del tamaño de un botón, para que el input
            arranque en la misma x que los de arriba. Antes ocupaba toda la celda
            del medio y quedaba corrido 35 px a la izquierda. */}
        <div className={GRID_CONTEO}>
          <label
            htmlFor={`${idPrefijo}-monedas`}
            className={`${CELDA_ETIQUETA} sunmi-text-strong`}
          >
            Monedas / otros
          </label>
          <div className={CELDA_CONTROL}>
            <button type="button" tabIndex={-1} aria-hidden="true" className={HUECO_BOTON} />
            <SunmiInput
              id={`${idPrefijo}-monedas`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={desglose[CLAVE_MONEDAS] ?? ""}
              onChange={(e) => setCantidad(CLAVE_MONEDAS, e.target.value)}
              placeholder="0.00"
              className="text-center tabular-nums min-w-0 !px-1"
            />
            <button type="button" tabIndex={-1} aria-hidden="true" className={HUECO_BOTON} />
          </div>
          <div className={`${CELDA_SUBTOTAL} sunmi-text-muted`}>
            {importeGrilla(Number(desglose[CLAVE_MONEDAS]) || 0)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t sunmi-border">
        <span className="text-sm font-semibold sunmi-text-muted">Total</span>
        <span className="text-lg font-bold font-mono tabular-nums sunmi-text-accent">{money(total)}</span>
      </div>
    </div>
  );
}

/** Botón táctil de ±1. Mismo tamaño que en la grilla del cambio. */
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
