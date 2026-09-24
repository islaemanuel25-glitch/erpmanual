"use client";

// components/finanzas/pagos/FilaCuentaPorPagar.jsx
//
// UNA CUENTA POR PAGAR, COMO FILA ADENTRO DE SU DÍA.
//
// El marco es `FilaConImporte`, el mismo de una transferencia: la fila entera
// abre la cuenta y el "Ver ›" de la derecha es la señal de que se puede tocar.
// Acá queda lo que dice una cuenta, en el mismo orden que una transferencia:
//
//   arriba   → "Compra #248 · Als", el número fuerte y el proveedor apagado;
//   abajo    → el estado y el vencimiento, en aviso si ya venció; en Pagados,
//              una cuenta saldada dice solo "Pagada";
//   derecha  → UNA sola cifra, la de la pestaña (`importeDeLaCuenta`).
//
// El proveedor es de la fila y no del grupo: los grupos son días. Total, pagado,
// saldo, factura y fecha prevista quedan en el detalle.
//
// La ubicación del gasto aparece solo cuando se miran varias —la ruta lo dice
// con `variasUbicaciones`—: con una sola, repetirla en cada fila no informa.

import FilaConImporte from "@/components/periodo/FilaConImporte";
import { formatearMoneda } from "@/lib/moneda";
import { ESTADO_CUENTA, FILTRO_CUENTAS, diaLegible, filtroDeCuentas } from "@/lib/finanzas/pagosProveedores";
import { cuentaVencida, importeDeLaCuenta } from "@/lib/finanzas/calendarioDePagos";

export default function FilaCuentaPorPagar({ cuenta, filtro, hoy, variasUbicaciones = false, onAbrir }) {
  const compra = cuenta?.pedidoProveedorId ? `Compra #${cuenta.pedidoProveedorId}` : "Compra";
  const proveedor = cuenta?.proveedor?.nombre || "Sin proveedor";
  const vencida = cuentaVencida(cuenta, hoy);
  const vence = vencida
    ? `Venció ${diaLegible(cuenta?.vencimientoProveedor)}`
    : `Vence ${diaLegible(cuenta?.vencimientoProveedor)}`;
  // En Pagados, una cuenta saldada dice "Pagada" y nada más: un vencimiento —o
  // un "Sin fecha"— sobre una deuda que ya no existe no informa nada. Pendientes
  // y Todos siguen diciendo el vencimiento como antes.
  const conVencimiento = !(
    filtroDeCuentas(filtro) === FILTRO_CUENTAS.PAGADAS && cuenta?.estado === ESTADO_CUENTA.PAGADA
  );

  return (
    <FilaConImporte
      importe={formatearMoneda(importeDeLaCuenta(cuenta, filtro))}
      onAbrir={() => onAbrir?.(cuenta)}
      etiqueta={`Abrir la cuenta de ${proveedor}, ${compra.toLowerCase()}`}
    >
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-base font-semibold sunmi-text-strong tabular-nums">{compra}</span>
        <span className="text-sm3 sunmi-text-muted">· {proveedor}</span>
        {variasUbicaciones && cuenta?.localGasto?.nombre && (
          <span className="text-sm3 sunmi-text-muted">· {cuenta.localGasto.nombre}</span>
        )}
      </div>
      <div className={`text-sm2 ${vencida ? "sunmi-text-warning" : "sunmi-text-muted"}`}>
        {cuenta?.rotuloEstado || cuenta?.estado}
        {conVencimiento ? " · " : null}
        {conVencimiento ? vence : null}
      </div>
    </FilaConImporte>
  );
}
