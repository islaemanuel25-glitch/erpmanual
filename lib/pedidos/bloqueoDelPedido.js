// lib/pedidos/bloqueoDelPedido.js
//
// LOS BLOQUEOS DE UN PEDIDO AL DEPÓSITO, Y CUÁNDO EL DEPÓSITO YA LO EMPEZÓ.
//
// Un pedido (`PosTransferencia`) lo tocan dos lados: el local, que lo arma y le
// suma productos con `/api/pedidos/set-cantidad` —también después de enviarlo,
// hasta que el depósito lo empiece—, y el depósito, que lo prepara
// (`/api/pos-transferencias/detalle/editar`, `detalle/agregar`, `agregarItem`)
// y lo despacha (`/api/pos-transferencias/enviar`). Para que no se pisen, todos
// toman los MISMOS dos bloqueos, en el mismo orden, adentro de su transacción:
//
// 1. El del PAR depósito→local (`pg_advisory_xact_lock` de dos claves): hace
//    esperar a cualquier otro escritor del mismo par hasta que éste termine.
//    Va sobre el par y no sobre la fila porque al armar un pedido nuevo todavía
//    no hay fila: sin esto, dos pedidos simultáneos abrían dos borradores
//    (medido en 9e2f438). Es la forma de dos claves de 32 bits, que en
//    PostgreSQL no se pisa con la de una clave que usan Ofertas y la anulación
//    de ventas.
//
// 2. La fila del pedido, `FOR UPDATE`, releída: lo que se decida se decide con
//    el estado de AHORA, no con el que se leyó antes de esperar.
//
// Las funciones reciben `tx`, el cliente de la transacción: un bloqueo `xact`
// tomado afuera de una transacción se suelta en el acto y no protege nada.

import { ESTADO_PEDIDO, sinCancelados } from "./estados.js";

/** El bloqueo del par depósito→local. `origenId` es el depósito; `destinoId`, el local. */
export async function bloquearParDelPedido(tx, origenId, destinoId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(origenId)}::int, ${Number(destinoId)}::int)`;
}

/** La fila del pedido, bloqueada y releída. `null` si no existe. */
export async function bloquearFilaDelPedido(tx, posId) {
  const [fila] = await tx.$queryRaw`SELECT id, estado FROM "PosTransferencia" WHERE id = ${Number(posId)} FOR UPDATE`;
  return fila ?? null;
}

/**
 * ¿El depósito ya empezó este pedido enviado?
 *
 * No hay un estado "tomado" ni "preparando" para un pedido Solicitado: el
 * depósito lo prepara escribiendo lo PREPARADO en las líneas —`detalle/editar`
 * y `detalle/agregar` escriben `preparado`, y `agregarItem` también— y después
 * lo despacha con `enviar`, que es el único cambio de estado (Solicitado →
 * Enviando → Enviado). Así que "lo empezó" es una de dos:
 *
 * · ya no está Solicitado (salió o está saliendo), o
 * · alguna línea tiene algo preparado (`preparado > 0`).
 *
 * Lo que NO lo marca, y conviene saberlo: que el depósito QUITE una línea
 * (`detalle/quitar`, `eliminarItem`) no deja rastro en lo preparado.
 *
 * @param {object} cliente `tx` o `prisma`.
 * @param {{ id: number, estado: string }} pos
 */
export async function depositoEmpezo(cliente, pos) {
  if (!pos) return false;
  if (pos.estado !== ESTADO_PEDIDO.SOLICITADO) return true;
  const preparadas = await cliente.posTransferenciaDetalle.count({
    where: { posTransferenciaId: Number(pos.id), preparado: { gt: 0 }, pos: sinCancelados() },
  });
  return preparadas > 0;
}
