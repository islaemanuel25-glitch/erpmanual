"use client";

// components/finanzas/pagos/TarjetaCuentaPorPagar.jsx
//
// LO QUE COMPARTEN LAS PANTALLAS QUE MUESTRAN UNA CUENTA POR PAGAR: el tono
// del estado, el rótulo de la compra y un importe con su rótulo.
//
// La tarjeta que le daba nombre al archivo ya no existe: la lista pasó al
// patrón de Transferencias y cada cuenta es una fila —`FilaCuentaPorPagar`—.
// Lo que queda lo importan el detalle de la cuenta y la compra recibida; el
// archivo no se renombra en esta tanda para no mover tres importadores junto
// con un rediseño.
//
// ── EL ESTADO ES TEXTO, NO SOLO UN COLOR ──────────────────────────────────
//
// La pastilla dice "Pendiente", "Parcial" o "Pagada". El tono ayuda, pero en
// catorce temas un color solo no se distingue.

import { formatearMoneda } from "@/lib/moneda";
import { ESTADO_CUENTA } from "@/lib/finanzas/pagosProveedores";

/** El tono de la pastilla. Pendiente llama la atención; pagada ya no. */
export const COLOR_ESTADO_CUENTA = Object.freeze({
  [ESTADO_CUENTA.PENDIENTE]: "amber",
  [ESTADO_CUENTA.PARCIAL]: "cyan",
  [ESTADO_CUENTA.PAGADA]: "green",
});

/** "Compra #245 · Factura 0001-00012345", o solo la compra si no hay factura. */
export function rotuloDeCompra(cuenta) {
  const compra = cuenta?.pedidoProveedorId ? `Compra #${cuenta.pedidoProveedorId}` : "Compra";
  return cuenta?.factura ? `${compra} · Factura ${cuenta.factura}` : compra;
}

/** Un importe con su rótulo arriba. Los tres de la tarjeta usan éste. */
export function ImporteConRotulo({ rotulo, valor, fuerte = false }) {
  return (
    <div className="min-w-0">
      <div className="text-xs2 sunmi-text-muted">{rotulo}</div>
      <div
        className={`text-sm3 tabular-nums truncate ${
          fuerte ? "font-semibold sunmi-text-strong" : "sunmi-text-strong"
        }`}
      >
        {formatearMoneda(valor)}
      </div>
    </div>
  );
}
