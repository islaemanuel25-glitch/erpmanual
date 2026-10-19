"use client";

// components/finanzas/sueldos/PiezasSueldos.jsx
//
// LAS PIEZAS DE FINANZAS → SUELDOS que usan dos vistas: la tarjeta de pagos de
// un empleado (historial y "Pagar sueldo") y el renglón tocable del resumen.
// Se arman con `Bloque` y `Renglon` del Resumen y con `SunmiActionCard`, el
// mismo renglón tocable de las cajas de Tesorería: no hay piezas parecidas al
// lado.

import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import { Bloque, Renglon } from "@/components/finanzas/PiezasDelResumen";
import { formatearMoneda } from "@/lib/moneda";

/**
 * LA TARJETA DE PAGOS de un empleado en el período: "DD/MM · Tipo", debajo de
 * dónde salió la plata, y el monto; al pie, el total.
 */
export function TarjetaDePagos({ titulo, pagos = [], total = 0 }) {
  return (
    <Bloque titulo={titulo}>
      {pagos.length === 0 ? (
        <p className="text-sm2 sunmi-text-muted">Sin pagos este período</p>
      ) : (
        <>
          {pagos.map((p) => (
            <Renglon key={p.pagoId} rotulo={p.titulo} nota={p.origen} valor={formatearMoneda(p.monto)} />
          ))}
          <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
          <Renglon rotulo="Total" valor={formatearMoneda(total)} fuerte />
        </>
      )}
    </Bloque>
  );
}

/** Un renglón tocable: el nombre en negrita, una línea debajo, el total y "›". */
export function RenglonTocable({ titulo, detalle, valor, onClick, etiqueta }) {
  return (
    <SunmiActionCard onClick={onClick} aria-label={etiqueta}>
      <div className="flex w-full items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm3 font-semibold sunmi-text-strong truncate">{titulo}</div>
          <div className="text-xs2 sunmi-text-muted">{detalle}</div>
        </div>
        <div className="shrink-0 text-sm3 font-medium tabular-nums sunmi-text-strong">{valor}</div>
        <span className="shrink-0 text-lg2 sunmi-text-muted" aria-hidden="true">
          ›
        </span>
      </div>
    </SunmiActionCard>
  );
}
