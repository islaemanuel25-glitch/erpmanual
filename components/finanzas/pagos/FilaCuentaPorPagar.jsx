"use client";

// components/finanzas/pagos/FilaCuentaPorPagar.jsx
//
// UNA CUENTA POR PAGAR, COMO FILA ADENTRO DEL GRUPO DE SU PROVEEDOR.
//
// ── EL PATRÓN ES EL DE LA FILA DE TRANSFERENCIAS ─────────────────────────
//
// `FilaDelDia` de `components/transferencias/DiaDeTransferencias.jsx`, la
// versión tocable: la fila ENTERA abre el detalle, y el "Ver ›" de la derecha es
// la señal de que se puede tocar, no el objetivo. Las mismas clases —alto,
// padding, separador arriba, columna derecha con el importe y la acción— para
// que las dos pantallas se lean igual en el teléfono.
//
// No se sacó una pieza común con aquélla: comparten el marco, pero adentro no
// hay nada igual —allá un número de transferencia, una hora y un estado de
// recepción; acá una compra, una ubicación, tres importes y un vencimiento—. Una
// pieza que recibiera "lo de la izquierda" y "lo de la derecha" sería un `div`
// con otro nombre.
//
// ── EL PROVEEDOR NO ESTÁ EN LA FILA ──────────────────────────────────────
//
// Lo dice la banda del grupo, arriba. Repetirlo en cada fila es leerlo dos veces.
//
// ── LOS IMPORTES Y EL ESTADO LLEGAN RESUELTOS ────────────────────────────
//
// Del servidor, por `estadoDeCuenta`. Acá no se suma ni se resta nada.

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPill from "@/components/sunmi/SunmiPill";
import { formatearMoneda } from "@/lib/moneda";
import { diaLegible } from "@/lib/finanzas/pagosProveedores";

import { COLOR_ESTADO_CUENTA } from "./TarjetaCuentaPorPagar";

export default function FilaCuentaPorPagar({ cuenta, onAbrir }) {
  const compra = cuenta?.pedidoProveedorId ? `Compra #${cuenta.pedidoProveedorId}` : "Compra";
  const proveedor = cuenta?.proveedor?.nombre || "el proveedor";

  return (
    <SunmiButton
      type="button"
      color="ghost"
      onClick={() => onAbrir?.(cuenta)}
      aria-label={`Abrir la cuenta de ${proveedor}, ${compra.toLowerCase()}`}
      // Las mismas clases que la fila tocable de transferencias: `ghost` sin
      // relleno, y los ejes que el botón cede puestos para que se vea como fila.
      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 min-h-0 rounded-none text-left border-t sunmi-divider"
    >
      <div className="min-w-0 flex-1 text-left space-y-0.5">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-base font-semibold sunmi-text-strong tabular-nums">{compra}</span>
          {cuenta?.factura && (
            <span className="text-sm3 sunmi-text-muted">· Factura {cuenta.factura}</span>
          )}
        </div>

        {/* El estado en palabras —la pastilla dice "Pendiente", "Parcial" o
            "Pagada"— y el vencimiento, que es lo que decide el orden del día. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <SunmiPill color={COLOR_ESTADO_CUENTA[cuenta?.estado] || "slate"}>
            {cuenta?.rotuloEstado || cuenta?.estado}
          </SunmiPill>
          <span className="text-sm2 sunmi-text-muted">Vence {diaLegible(cuenta?.vencimientoProveedor)}</span>
        </div>

        <div className="text-sm2 sunmi-text-muted break-words">
          Gasto de <span className="sunmi-text-strong">{cuenta?.localGasto?.nombre || "—"}</span>
        </div>
        <div className="text-sm2 sunmi-text-muted tabular-nums">
          Total {formatearMoneda(cuenta?.total)} · Pagado {formatearMoneda(cuenta?.pagado)}
        </div>
      </div>

      {/* LA COLUMNA DE LA DERECHA: el saldo arriba y la acción abajo, como el
          importe y el "Ver ›" de transferencias. Con rótulo, porque acá hay tres
          importes y el de la derecha tiene que decir cuál es. */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <div className="text-xs2 sunmi-text-muted">Saldo</div>
        <div className="text-base2 font-semibold sunmi-text-strong tabular-nums">
          {formatearMoneda(cuenta?.saldo)}
        </div>
        <div className="text-sm2 font-medium sunmi-text-accent">Ver ›</div>
      </div>
    </SunmiButton>
  );
}
