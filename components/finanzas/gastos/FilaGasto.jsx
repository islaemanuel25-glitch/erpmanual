"use client";

// components/finanzas/gastos/FilaGasto.jsx
//
// UN GASTO, COMO FILA ADENTRO DE SU DÍA.
//
// El marco es `FilaConImporte`, el mismo de una cuenta por pagar y de una
// transferencia: la fila entera abre el gasto y el "Ver ›" es la señal de que se
// puede tocar. Lo que dice, en el mismo orden que una cuenta:
//
//   arriba   → el concepto fuerte y el beneficiario apagado —y la ubicación,
//              solo cuando se miran varias (`variasUbicaciones`)—;
//   abajo    → la categoría, el estado y el vencimiento, en aviso si ya venció.
//              Un gasto pagado dice solo su categoría y "Pagado"; y si se pagó
//              desde el POS, debajo, de qué caja salió ("Caja #12 · efectivo");
//   derecha  → UNA sola cifra, la de la pestaña (`importeDeLaCuenta`): el saldo
//              en Pendientes, el total en Pagados y en Todos. Sin rótulo: el
//              resumen de arriba ya dice qué es.

import FilaConImporte from "@/components/periodo/FilaConImporte";
import { formatearMoneda } from "@/lib/moneda";
import { ESTADO_CUENTA, diaLegible } from "@/lib/finanzas/pagosProveedores";
import { importeDeLaCuenta } from "@/lib/finanzas/calendarioDePagos";
import { rotuloEstadoDelGasto } from "@/lib/finanzas/calendarioDeGastos";

/**
 * Si el gasto está pagado y si está vencido. Lo leen la fila del celular y la
 * tabla de escritorio (`TablaGastos`): una sola regla para las dos.
 */
export function situacionDelGasto(gasto, hoy) {
  const pagado = gasto?.estado === ESTADO_CUENTA.PAGADA;
  const vencido = !pagado && Boolean(gasto?.vencimiento) && gasto.vencimiento < hoy;
  return { pagado, vencido };
}

export default function FilaGasto({ gasto, filtro, hoy, variasUbicaciones = false, onAbrir }) {
  const { pagado, vencido } = situacionDelGasto(gasto, hoy);
  const vence = !gasto?.vencimiento
    ? "Sin vencimiento"
    : `${vencido ? "Venció" : "Vence"} ${diaLegible(gasto.vencimiento)}`;

  return (
    <FilaConImporte
      importe={formatearMoneda(importeDeLaCuenta(gasto, filtro))}
      onAbrir={() => onAbrir?.(gasto)}
      etiqueta={`Abrir el gasto ${gasto?.concepto || ""}`}
    >
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-base font-semibold sunmi-text-strong">{gasto?.concepto}</span>
        {gasto?.beneficiario && <span className="text-sm3 sunmi-text-muted">· {gasto.beneficiario}</span>}
        {variasUbicaciones && gasto?.local?.nombre && (
          <span className="text-sm3 sunmi-text-muted">· {gasto.local.nombre}</span>
        )}
      </div>
      <div className={`text-sm2 ${vencido ? "sunmi-text-warning" : "sunmi-text-muted"}`}>
        {gasto?.categoria?.nombre || "Sin categoría"}
        {" · "}
        {rotuloEstadoDelGasto(gasto)}
        {pagado ? null : " · "}
        {pagado ? null : vence}
      </div>
      {/* Lo pagado desde el POS dice de qué caja salió: "Caja #12 · efectivo". */}
      {gasto?.salioDeLaCaja ? <div className="text-sm2 sunmi-text-muted">{gasto.salioDeLaCaja}</div> : null}
    </FilaConImporte>
  );
}
