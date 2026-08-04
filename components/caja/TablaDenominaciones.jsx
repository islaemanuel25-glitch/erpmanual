"use client";

// Grilla de denominaciones: cantidad por billete, subtotal por fila y total.
//
// La usan LOS DOS pasos —contar el cajón y elegir qué sale— porque es la misma
// operación: traducir "cuántos de cada uno" a un importe. Duplicarla llevaría a
// que una de las dos se desactualice.
//
// Las denominaciones NO se declaran acá: vienen de lib/caja/conteoBilletes.
// Dispersarlas es la forma segura de que dejen de coincidir.

import SunmiInput from "@/components/sunmi/SunmiInput";
import {
  DENOMINACIONES,
  CLAVE_MONEDAS,
  normalizarCantidad,
  subtotalDenominacion,
  totalDesglose,
  ajustarCantidad,
} from "@/lib/caja/conteoBilletes";

const money = (n) =>
  `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TablaDenominaciones({
  desglose = {},
  onCambiar,
  // Tope por denominación: en el paso de retiro son los billetes contados. Sin
  // esto se podrían "sacar" billetes que no están en el cajón.
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
      {titulo && <div className="text-xs sunmi-text-muted">{titulo}</div>}

      <div className="space-y-1.5">
        {DENOMINACIONES.map(({ valor, etiqueta }) => {
          const cantidad = normalizarCantidad(desglose[valor]);
          const tope = topes ? normalizarCantidad(topes[valor]) : null;
          const excede = tope !== null && cantidad > tope;
          return (
            <div
              key={valor}
              className="grid grid-cols-[4.5rem_1fr_auto] sm:grid-cols-[6rem_1fr_7rem] items-center gap-2"
            >
              <label
                htmlFor={`${idPrefijo}-${valor}`}
                className={`text-sm font-semibold tabular-nums ${excede ? "sunmi-text-danger" : "sunmi-text-strong"}`}
              >
                {etiqueta}
              </label>

              <div className="flex items-center gap-1 min-w-0">
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
                  className="text-center tabular-nums min-w-0"
                />
                <BotonPaso
                  signo="+"
                  etiqueta={`Agregar un billete de ${etiqueta}`}
                  onClick={() => onCambiar?.(ajustarCantidad(desglose, valor, 1))}
                />
              </div>

              <div
                className={`text-sm text-right tabular-nums font-mono ${
                  excede ? "sunmi-text-danger" : cantidad ? "sunmi-text-strong" : "sunmi-text-muted"
                }`}
              >
                {money(subtotalDenominacion(valor, cantidad))}
                {excede && (
                  <span className="block text-[10px] leading-tight">contaste {tope}</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Monedas y billetes chicos: se carga el IMPORTE, no una cantidad. Con
            los valores actuales, contar monedas de $10 una por una no aporta. */}
        <div className="grid grid-cols-[4.5rem_1fr_auto] sm:grid-cols-[6rem_1fr_7rem] items-center gap-2 pt-1">
          <label htmlFor={`${idPrefijo}-monedas`} className="text-sm font-semibold sunmi-text-strong leading-tight">
            Monedas / otros
          </label>
          <SunmiInput
            id={`${idPrefijo}-monedas`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={desglose[CLAVE_MONEDAS] ?? ""}
            onChange={(e) => setCantidad(CLAVE_MONEDAS, e.target.value)}
            placeholder="0.00"
            className="text-center tabular-nums min-w-0"
          />
          <div className="text-sm text-right tabular-nums font-mono sunmi-text-muted">
            {money(Number(desglose[CLAVE_MONEDAS]) || 0)}
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

/** Botón táctil de ±1. Área grande: se usa con el dedo en un mostrador. */
function BotonPaso({ signo, etiqueta, onClick, deshabilitado = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      className="shrink-0 w-9 h-9 rounded-md sunmi-btn-base sunmi-btn-slate text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {signo}
    </button>
  );
}
