"use client";

// components/finanzas/gastos/ResumenDeGastos.jsx
//
// EL BLOQUE DE ARRIBA: la cifra de la pestaña en el período que se mira.
//
// El dibujo es `ResumenConImporte`, el de Pagos a proveedores y Transferencias.
// Acá queda qué dice en cada pestaña. El período es el de la FECHA DEL GASTO —no
// la del pago ni la del vencimiento—, así que los rótulos hablan de "gastos del
// período" y no de "pagado en el período", que sería otra pregunta:
//
//   · Pendientes → lo que falta pagar de los gastos del período, sumando saldos;
//   · Pagados    → lo que suman los gastos del período ya pagados;
//   · Todos      → lo que suman todos los gastos del período.
//
// ── LOS ANTERIORES VAN EN EL AVISO, NO EN EL NÚMERO ──────────────────────
//
// Son de antes del período, así que sumarlos lo haría mentir sobre el período
// que dice. Pero es plata que se debe, y el aviso enciende el borde, igual que
// las Vencidas de Pagos.

import ResumenConImporte from "@/components/periodo/ResumenConImporte";
import { formatearMoneda } from "@/lib/moneda";
import { FILTRO_CUENTAS, filtroDeCuentas } from "@/lib/finanzas/pagosProveedores";
import { totalDelPeriodo } from "@/lib/finanzas/calendarioDePagos";
import { rotuloDeGastos } from "@/lib/finanzas/calendarioDeGastos";

export const TEXTOS_DEL_RESUMEN_DE_GASTOS = Object.freeze({
  [FILTRO_CUENTAS.PENDIENTES]: {
    rotulo: "Saldo de gastos del período",
    vacio: "No hay gastos con saldo en este período.",
  },
  [FILTRO_CUENTAS.PAGADAS]: {
    rotulo: "Gastos pagados del período",
    vacio: "No hay gastos pagados en este período.",
  },
  [FILTRO_CUENTAS.TODAS]: {
    rotulo: "Gastos del período",
    vacio: "No hay gastos en este período.",
  },
});

export default function ResumenDeGastos({ filtro, descripcion, calendario }) {
  const textos = TEXTOS_DEL_RESUMEN_DE_GASTOS[filtroDeCuentas(filtro)];
  const d = descripcion || {};
  const { cantidad, importe } = totalDelPeriodo(calendario);
  const anteriores = calendario?.anteriores;

  return (
    <ResumenConImporte
      rotulo={textos.rotulo}
      importe={formatearMoneda(importe)}
      subtitulo={
        <>
          {d.titulo}
          {d.subtitulo ? ` · ${d.subtitulo}` : ""}
        </>
      }
      nota={cantidad === 0 ? textos.vacio : null}
      aviso={
        anteriores
          ? `${rotuloDeGastos(anteriores.cantidad)} con saldo de períodos anteriores por ${formatearMoneda(anteriores.importe)}.`
          : null
      }
    />
  );
}
