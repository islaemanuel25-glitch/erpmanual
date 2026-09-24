"use client";

// components/finanzas/pagos/ResumenDeCuentasPorPagar.jsx
//
// EL BLOQUE GRANDE DE ARRIBA: cuánto se debe en lo que se está mirando.
//
// ── EL PATRÓN ES EL DE LA CUENTA DEL PERÍODO DE TRANSFERENCIAS ──────────
//
// `CuentaDelPeriodoCerrado`: el rótulo chico, el importe grande y debajo de qué
// habla. Mismo marco, mismas clases. No se reusa aquélla porque sabe de
// períodos —su rótulo, su aviso y el atajo al corte salen de
// `descripcionDelPeriodo`— y acá no hay período.
//
// ── QUÉ NÚMERO VA GRANDE ─────────────────────────────────────────────────
//
// El saldo, que es la pregunta por la que se abre la pantalla: cuánto falta
// pagar. En "Pagados" el saldo es siempre cero, así que ahí va lo pagado.
//
// Las sumas salen de `resumenDeCuentas`, en centavos. No es una métrica nueva:
// es sumar los saldos que la lista ya muestra fila por fila.

import { formatearMoneda } from "@/lib/moneda";
import { FILTRO_CUENTAS } from "@/lib/finanzas/pagosProveedores";

/** "1 cuenta", "3 cuentas". */
function cantidad(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

export default function ResumenDeCuentasPorPagar({ filtro, resumen, textoVacio }) {
  const pagados = filtro === FILTRO_CUENTAS.PAGADAS;
  const r = resumen || {};

  return (
    <section className="sunmi-bg-card rounded-xl2 p-4 space-y-3 border sunmi-border">
      <div>
        <div className="text-xs sunmi-text-muted">{pagados ? "Pagado" : "Saldo pendiente"}</div>
        <div className="text-xl2 font-semibold sunmi-text-strong tabular-nums">
          {formatearMoneda(pagados ? r.pagado : r.saldo)}
        </div>
        <div className="text-sm2 sunmi-text-muted">
          {cantidad(r.cantidad || 0, "cuenta", "cuentas")}
          {r.cantidad ? ` · ${cantidad(r.proveedores || 0, "proveedor", "proveedores")}` : ""}
        </div>
      </div>

      {/* Sin cuentas, el bloque dice por qué está en cero —como el período vacío
          de transferencias— en vez de dejar un cero solo. */}
      {!r.cantidad && textoVacio && <div className="text-sm2 sunmi-text-muted">{textoVacio}</div>}

      {/* Los otros dos importes, para que el grande tenga contexto. En "Pagados"
          no: ahí total y pagado son el mismo número. */}
      {r.cantidad > 0 && !pagados && (
        <>
          <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
          <div className="text-sm2 sunmi-text-muted tabular-nums">
            Total {formatearMoneda(r.total)} · Pagado {formatearMoneda(r.pagado)}
          </div>
        </>
      )}
    </section>
  );
}
