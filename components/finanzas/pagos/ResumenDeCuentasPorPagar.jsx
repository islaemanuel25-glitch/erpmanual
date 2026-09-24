"use client";

// components/finanzas/pagos/ResumenDeCuentasPorPagar.jsx
//
// EL BLOQUE DE ARRIBA: la cifra de la pestaña en el período que se mira.
//
// El dibujo es `ResumenConImporte`, el mismo del período de Transferencias:
// rótulo chico, importe grande y, debajo, de qué período habla. Acá queda qué
// dice en cada pestaña, que es la pregunta de cada una:
//
//   · Pendientes → lo que vence en el período, sumando saldos;
//   · Pagados    → lo que se terminó de pagar en el período, sumando totales;
//   · Todos      → la deuda que nació en el período, sumando totales.
//
// ── LAS VENCIDAS VAN EN EL AVISO, NO EN EL NÚMERO ────────────────────────
//
// No son del período —vencieron antes— así que sumarlas al número grande lo
// haría mentir sobre el período que dice. Pero son deuda viva, y el aviso
// enciende el borde igual que en Transferencias cuando el total puede moverse.

import ResumenConImporte from "@/components/periodo/ResumenConImporte";
import { formatearMoneda } from "@/lib/moneda";
import { FILTRO_CUENTAS, filtroDeCuentas } from "@/lib/finanzas/pagosProveedores";
import { rotuloDeCuentas, totalDelPeriodo } from "@/lib/finanzas/calendarioDePagos";

export const TEXTOS_DEL_RESUMEN = Object.freeze({
  [FILTRO_CUENTAS.PENDIENTES]: {
    rotulo: "Vence en el período",
    vacio: "No vence ninguna cuenta en este período.",
  },
  [FILTRO_CUENTAS.PAGADAS]: {
    rotulo: "Pagado en el período",
    vacio: "No se terminó de pagar ninguna cuenta en este período.",
  },
  [FILTRO_CUENTAS.TODAS]: {
    rotulo: "Deuda generada en el período",
    vacio: "No se generó ninguna deuda en este período.",
  },
});

export default function ResumenDeCuentasPorPagar({ filtro, descripcion, calendario }) {
  const textos = TEXTOS_DEL_RESUMEN[filtroDeCuentas(filtro)];
  const d = descripcion || {};
  const { cantidad, importe } = totalDelPeriodo(calendario);
  const vencidas = calendario?.vencidas;

  return (
    <ResumenConImporte
      rotulo={textos.rotulo}
      importe={formatearMoneda(importe)}
      // Dos nodos, como en Transferencias.
      subtitulo={
        <>
          {d.titulo}
          {d.subtitulo ? ` · ${d.subtitulo}` : ""}
        </>
      }
      nota={cantidad === 0 ? textos.vacio : null}
      aviso={
        vencidas
          ? `${rotuloDeCuentas(vencidas.cantidad)} ${vencidas.cantidad === 1 ? "vencida" : "vencidas"} por ${formatearMoneda(vencidas.importe)}.`
          : null
      }
    />
  );
}
