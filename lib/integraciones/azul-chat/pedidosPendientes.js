// lib/integraciones/azul-chat/pedidosPendientes.js
//
// CAPACIDAD `pedidos_pendientes`: LOS PEDIDOS QUE UN LOCAL PIDIÓ Y TODAVÍA NO
// LE MANDARON (Tanda 9A).
//
// Solo lectura. La persona, el permiso (`pedidos.ver`, el de `pedidos_eventos`)
// y el local los resolvió `autorizarIntegracion` antes de llegar acá: el local
// sale de la AUTORIZACIÓN, nunca del cuerpo. Sin parámetros.
//
// ── QUÉ ES UN PEDIDO PENDIENTE ────────────────────────────────────────────
//
// Un `PosTransferencia` del local que pidió (`destinoId`) en estado
// "Solicitado": ya lo pidió y el depósito todavía no lo despachó. No entran:
//   · Borrador o Preparando: el carrito, que todavía no se pidió;
//   · Enviando o Enviado: el depósito ya lo despachó (o lo está despachando);
//   · Cancelado: el local lo retiró (desde la Tanda 9A cancelar lo marca en vez
//     de borrarlo). Lo deja afuera `sinCancelados`, el filtro único de
//     `lib/pedidos/estados.js`, además del estado.
//
// Es la misma pregunta que el aviso "pedido pendiente" de `pedidos/carrito`,
// pero para todos los orígenes del local, no solo el depósito del grupo.
//
// ── LA ANTIGÜEDAD ─────────────────────────────────────────────────────────
//
// Horas COMPLETAS desde `solicitadoAt` hasta el momento de la consulta: un
// pedido de hace 90 minutos tiene 1. Nunca negativa. `solicitadoAt` la escribe
// solo `pos-transferencias/solicitar`, en el mismo update que pone el estado,
// así que un Solicitado siempre la tiene; si faltara, la antigüedad va en
// `null` y no se inventa.
//
// ── QUÉ NO SALE ───────────────────────────────────────────────────────────
//
// Ni productos, ni cantidades, ni quién lo pidió: el id, la fecha, el origen y
// cuántas líneas tiene. Las líneas se cuentan AL LEER: mientras está
// Solicitado, el depósito puede ajustarlas.

import { localDeLaAutorizacion } from "./cursorDeEventos.js";
import { ESTADO_PEDIDO, sinCancelados } from "../../pedidos/estados.js";

export const VERSION_CONTRATO = 1;
export const CAPACIDAD = "pedidos_pendientes";

const MS_POR_HORA = 60 * 60 * 1000;

/** Del más viejo al más nuevo; el id desempata. */
export const ORDEN_PENDIENTES = Object.freeze([
  Object.freeze({ solicitadoAt: "asc" }),
  Object.freeze({ id: "asc" }),
]);

/** Lo mínimo: el id, la fecha, el origen con nombre y cuántas líneas. */
export const SELECT_PENDIENTE = Object.freeze({
  id: true,
  solicitadoAt: true,
  origen: Object.freeze({ select: Object.freeze({ id: true, nombre: true }) }),
  _count: Object.freeze({ select: Object.freeze({ detalles: true }) }),
});

/** Horas completas entre `desde` y `ahora`; `null` si no hay fecha. */
export function antiguedadEnHoras(desde, ahora) {
  if (!desde) return null;
  const ms = ahora - new Date(desde).getTime();
  return Math.max(0, Math.floor(ms / MS_POR_HORA));
}

/** Una fila de `PosTransferencia` (con `SELECT_PENDIENTE`) → el pedido público. */
export function aPendiente(p, ahora) {
  return {
    id: p.id,
    solicitadoAt: p.solicitadoAt ? new Date(p.solicitadoAt).toISOString() : null,
    origen: { id: p.origen.id, nombre: p.origen.nombre },
    lineas: p._count?.detalles ?? 0,
    antiguedadHoras: antiguedadEnHoras(p.solicitadoAt, ahora),
  };
}

/**
 * Ejecuta la capacidad para una autorización ya concedida.
 *
 * @param {{localId:number, grupoId:number}} autorizacion
 * @param {object} _parametros ninguno: la puerta ya rechazó cualquier clave.
 * @param {{db:object, ahora?:number}} deps `db` es el cliente Prisma.
 */
export async function pedidosPendientes(autorizacion, _parametros, { db, ahora = Date.now() }) {
  const delLocal = await localDeLaAutorizacion(db, autorizacion);
  if (!delLocal.ok) return delLocal;
  const { local } = delLocal;

  // Los pedidos del local que siguen pedidos y sin despachar.
  const filas = await db.posTransferencia.findMany({
    where: sinCancelados({ destinoId: local.id, estado: ESTADO_PEDIDO.SOLICITADO }),
    orderBy: ORDEN_PENDIENTES,
    select: SELECT_PENDIENTE,
  });

  return {
    ok: true,
    datos: {
      capacidad: CAPACIDAD,
      version: VERSION_CONTRATO,
      local: { id: local.id, nombre: local.nombre },
      grupoId: autorizacion.grupoId,
      pedidos: filas.map((p) => aPendiente(p, ahora)),
    },
  };
}
