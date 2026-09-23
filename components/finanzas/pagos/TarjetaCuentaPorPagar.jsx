"use client";

// components/finanzas/pagos/TarjetaCuentaPorPagar.jsx
//
// UNA CUENTA POR PAGAR EN LA LISTA.
//
// Dice lo mínimo para decidir si hay que abrirla: a quién se le debe, de qué
// compra, de quién es el gasto, cuánto era, cuánto se pagó, cuánto falta y
// cuándo vence. Los tres importes y el estado llegan RESUELTOS del servidor
// —`estadoDeCuenta`—; acá no se suma ni se resta nada.
//
// ── EL ESTADO ES TEXTO, NO SOLO UN COLOR ──────────────────────────────────
//
// La pastilla dice "Pendiente", "Parcial" o "Pagada". El tono ayuda, pero en
// catorce temas un color solo no se distingue.

import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import SunmiPill from "@/components/sunmi/SunmiPill";
import { formatearMoneda } from "@/lib/moneda";
import { ESTADO_CUENTA, diaLegible } from "@/lib/finanzas/pagosProveedores";

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

export default function TarjetaCuentaPorPagar({ cuenta, onAbrir }) {
  return (
    <SunmiActionCard
      onClick={() => onAbrir?.(cuenta)}
      aria-label={`Abrir la cuenta de ${cuenta?.proveedor?.nombre || "el proveedor"}`}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="min-w-0">
          <div className="text-base2 font-semibold sunmi-text-strong truncate">
            {cuenta?.proveedor?.nombre || "—"}
          </div>
          <div className="text-xs2 sunmi-text-muted truncate">{rotuloDeCompra(cuenta)}</div>
        </div>
        <SunmiPill color={COLOR_ESTADO_CUENTA[cuenta?.estado] || "slate"}>
          {cuenta?.rotuloEstado || cuenta?.estado}
        </SunmiPill>
      </div>

      <div className="text-xs2 sunmi-text-muted">
        Gasto de <span className="sunmi-text-strong">{cuenta?.localGasto?.nombre || "—"}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 w-full">
        <ImporteConRotulo rotulo="Total" valor={cuenta?.total} />
        <ImporteConRotulo rotulo="Pagado" valor={cuenta?.pagado} />
        <ImporteConRotulo rotulo="Saldo" valor={cuenta?.saldo} fuerte />
      </div>

      <div className="text-xs2 sunmi-text-muted">
        Vence: {diaLegible(cuenta?.vencimientoProveedor)}
      </div>
    </SunmiActionCard>
  );
}
