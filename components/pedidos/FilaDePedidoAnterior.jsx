"use client";

// components/pedidos/FilaDePedidoAnterior.jsx
//
// UNA FILA TOCABLE DE UN PEDIDO ANTERIOR. La de "Pedidos anteriores" en la
// entrada de Pedidos y la de cada pedido en el historial: la MISMA pieza, no
// una copia en cada pantalla. Salió de `app/modulos/pedidos/page.jsx` el
// 2026-10-22, cuando el historial del celular la necesitó.
//
//   Pedido #N                                                       ›
//   <estado> · <fecha corta> · N productos
//
// Si es de hoy, "hoy HH:MM" en vez de la fecha. El estado llega ya en
// palabras del local (`lib/pedidos/estadoParaElLocal.js`): esta pieza no sabe
// de estados.

import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { productosDelHistorial } from "@/lib/pedidos/lineasDelPedido";

const productos = (n) => (n === 1 ? "producto" : "productos");

/** "hoy 14:05", o la fecha corta si no es de hoy: "21/10". */
function cuandoDeLaFila(fecha) {
  if (!fecha) return null;
  return fechaArgentinaISO(fecha) === hoyArgentinaISO() ? `hoy ${horaAR(fecha)}` : diaMesAR(fecha);
}

/** El renglón de abajo: estado, cuándo y cuántos productos, si el dato está. */
export function lineaDeLaFila(pedido, estado) {
  const partes = [estado, cuandoDeLaFila(pedido.solicitadoAt ?? pedido.createdAt)];
  const n = productosDelHistorial(pedido);
  if (n != null) partes.push(`${n} ${productos(n)}`);
  return partes.filter(Boolean).join(" · ");
}

export default function FilaDePedidoAnterior({ pedido, estado, onAbrir }) {
  return (
    <SunmiActionCard data-pedido-anterior={pedido.posId} onClick={onAbrir}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm3 font-semibold sunmi-text-strong">{`Pedido #${pedido.posId}`}</p>
          <p className="text-sm2 sunmi-text-muted">{lineaDeLaFila(pedido, estado)}</p>
        </div>
        <span aria-hidden="true" className="sunmi-text-muted">›</span>
      </div>
    </SunmiActionCard>
  );
}
