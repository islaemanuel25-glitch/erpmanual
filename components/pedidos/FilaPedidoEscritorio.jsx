"use client";

// components/pedidos/FilaPedidoEscritorio.jsx
//
// UN PEDIDO ANTERIOR EN UN RENGLÓN, EN LA COMPUTADORA (2026-10-25). Lo usan
// "Pedidos anteriores" de la entrada y "Ver todo el historial", que son el
// mismo renglón —una pieza, no una copia en cada vista—:
//
//   Pedido #11 | 21/10 | Recibido | 18 productos |              [Ver pedido]
//
// Cada columna con ANCHO FIJO, para que los renglones queden alineados entre
// sí aunque cambien los números o el estado. El estado llega en palabras del
// local (`lib/pedidos/estadoParaElLocal.js`): Recibido en la etiqueta slate,
// Cancelado con el texto en rojo, los demás en el color de siempre de su
// estado (`COLOR_DEL_ESTADO`).
//
// En el celular la fila es otra (`FilaDePedidoAnterior`), y no se toca.

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPill from "@/components/sunmi/SunmiPill";
import { diaMesAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { productosDelHistorial } from "@/lib/pedidos/lineasDelPedido";
import { COLOR_DEL_ESTADO, ESTADO_LOCAL } from "@/lib/pedidos/estadoParaElLocal";

const productos = (n) => (n === 1 ? "producto" : "productos");

/** COPIA de `cuandoDeLaFila` de `FilaDePedidoAnterior` (no está exportada): "hoy 14:05", o "21/10". */
function cuandoDeLaFila(fecha) {
  if (!fecha) return null;
  return fechaArgentinaISO(fecha) === hoyArgentinaISO() ? `hoy ${horaAR(fecha)}` : diaMesAR(fecha);
}

/** La etiqueta del estado: Recibido en slate, Cancelado en texto rojo. */
function EtiquetaDeEstado({ estado }) {
  if (estado === ESTADO_LOCAL.CANCELADO) {
    return <span className="text-sm2 font-semibold sunmi-text-danger">{estado}</span>;
  }
  const color = estado === ESTADO_LOCAL.RECIBIDO ? "slate" : COLOR_DEL_ESTADO[estado] ?? "slate";
  return <SunmiPill color={color}>{estado}</SunmiPill>;
}

export default function FilaPedidoEscritorio({ pedido, estado, onVer }) {
  const n = productosDelHistorial(pedido);
  return (
    <div data-pedido-anterior={pedido.posId} className="flex items-center gap-3 py-2">
      <span className="w-32 shrink-0 text-sm3 font-semibold sunmi-text-strong">{`Pedido #${pedido.posId}`}</span>
      <span className="w-28 shrink-0 text-sm2 sunmi-text-muted">{cuandoDeLaFila(pedido.solicitadoAt ?? pedido.createdAt) ?? ""}</span>
      <span data-estado-anterior="" className="w-40 shrink-0">
        <EtiquetaDeEstado estado={estado} />
      </span>
      <span className="w-32 shrink-0 text-sm2 sunmi-text-muted">{n != null ? `${n} ${productos(n)}` : ""}</span>
      <SunmiButton color="slate" onClick={onVer} className="ml-auto shrink-0">
        Ver pedido
      </SunmiButton>
    </div>
  );
}
