// lib/integraciones/azul-chat/pedidosEventos.js
//
// CAPACIDAD `pedidos_eventos`: LOS PEDIDOS QUE UN LOCAL SOLICITÓ, COMO EVENTOS,
// PARA QUE AZUL CHAT LOS RECUPERE DE A TANDAS (Tanda 4A).
//
// Solo lectura. La persona, el permiso (`pedidos.ver`) y el local los resolvió
// `autorizarIntegracion` antes de llegar acá: el local sale de la AUTORIZACIÓN,
// nunca del cuerpo.
//
// ── QUÉ ES UN PEDIDO_SOLICITADO ───────────────────────────────────────────
//
// `PosTransferencia` es EL PEDIDO. `pos-transferencias/solicitar` lo pasa de
// Borrador o Preparando a "Solicitado" y, en el MISMO `update`, escribe
// `solicitadoAt`. Es el único lugar que escribe esa columna, y nada la vuelve
// a tocar: un pedido solicitado pasa a Enviado o a Cancelado, pero no vuelve a
// Borrador. Por eso el hecho es `solicitadoAt` no nulo, sea cual sea el estado
// de hoy: un pedido que ya se envió también se solicitó, y uno que se canceló
// también. Por eso esta lectura NO usa `sinCancelados` (lib/pedidos/estados.js),
// a propósito: es la única excepción de pedidos con ese motivo.
//
// Es un evento del local que PIDIÓ: `destinoId` (el que recibe lo pedido). El
// origen —quien despacha, normalmente el depósito— no recibe este evento.
//
// Dos cosas que conviene saber del lado de Azul Chat:
//   · cancelar un pedido Solicitado lo BORRABA hasta la Tanda 9A, y el evento
//     desaparecía del ERP. Desde la 9A lo MARCA (estado "Cancelado",
//     `canceladoAt`), así que el PEDIDO_SOLICITADO de un pedido cancelado
//     sigue saliendo: se solicitó. Es un cambio esperado. La cancelación misma
//     no se publica como evento; lo que sigue pendiente lo dice
//     `pedidos_pendientes`;
//   · `lineas` es la cantidad de líneas del pedido AL LEERLO. Mientras está
//     Solicitado, el depósito puede ajustarlas (`pos-transferencias/detalle/*`),
//     así que dos lecturas del mismo evento pueden traer números distintos. La
//     clave del evento no cambia.
//
// ── EL CURSOR Y EL MARGEN ─────────────────────────────────────────────────
//
// El cursor es el compartido (`cursorDeEventos.js`) sobre (`solicitadoAt`, id).
//
// `solicitadoAt` se escribe con el reloj del proceso y se compromete en el
// mismo `update`, que no está dentro de una transacción interactiva: queda
// visible en milisegundos. Se usa el mismo margen de 60 s que
// `transferencias_eventos` —sobra holgura— para que las capacidades de eventos
// tengan una sola regla. Lo vigila `frontera.test.mjs` (quién escribe la
// columna y que no lo haga dentro de una transacción con timeout).
//
// ── LA CLAVE DEL EVENTO ───────────────────────────────────────────────────
//
// `PEDIDO_SOLICITADO:<id>:<solicitadoAt ISO>`. `admin/reset-operativo` borra los
// pedidos y su secuencia puede volver a dar un id: la fecha los distingue.
//
// ── QUÉ NO SALE ───────────────────────────────────────────────────────────
//
// Ni productos, ni cantidades, ni precios, ni quién lo pidió: el id, la fecha,
// el origen y cuántas líneas tiene.

import { crearCursor, despuesDe, ejecutarEventos, ordenPor } from "./cursorDeEventos.js";

export const VERSION_CONTRATO = 1;
export const CAPACIDAD = "pedidos_eventos";
export const TIPO_PEDIDO_SOLICITADO = "PEDIDO_SOLICITADO";

/** Lo que una solicitud tarda, como máximo y con holgura, en ser visible. Ver arriba. */
export const MARGEN_DE_VISIBILIDAD_MS = 60 * 1000;

export const CURSOR = crearCursor({ campoFecha: "fechaSolicitud", campoId: "pedidoId" });

/** El orden total de los eventos. El cursor depende de que sea EXACTAMENTE éste. */
export const ORDEN_EVENTOS = ordenPor("solicitadoAt");

/** Los pedidos que pidió el local, solicitados, estrictamente después de `desde` y no más nuevos que `hasta`. */
export function whereEventos({ localId, desde, hasta }) {
  const where = { destinoId: localId, solicitadoAt: { not: null, lte: hasta } };
  if (desde) where.OR = despuesDe("solicitadoAt", desde);
  return where;
}

/** Lo mínimo: el id, la fecha, el origen con nombre y cuántas líneas. */
export const SELECT_EVENTO = Object.freeze({
  id: true,
  solicitadoAt: true,
  origen: Object.freeze({ select: Object.freeze({ id: true, nombre: true }) }),
  _count: Object.freeze({ select: Object.freeze({ detalles: true }) }),
});

/** La clave estable del evento. Ver "LA CLAVE DEL EVENTO". */
export function idDeEvento(pedidoId, fechaSolicitudISO) {
  return `${TIPO_PEDIDO_SOLICITADO}:${pedidoId}:${fechaSolicitudISO}`;
}

/** Una fila de `PosTransferencia` (con `SELECT_EVENTO`) → el evento. */
export function aEvento(p) {
  const fechaSolicitud = new Date(p.solicitadoAt).toISOString();
  return {
    tipo: TIPO_PEDIDO_SOLICITADO,
    eventoId: idDeEvento(p.id, fechaSolicitud),
    pedidoId: p.id,
    fechaSolicitud,
    origen: { id: p.origen.id, nombre: p.origen.nombre },
    lineas: p._count?.detalles ?? 0,
  };
}

/**
 * Ejecuta la capacidad para una autorización ya concedida.
 *
 * @param {{localId:number, grupoId:number}} autorizacion
 * @param {{desde?:unknown, limite?:unknown}} parametros
 * @param {{db:object, ahora?:number}} deps `db` es el cliente Prisma.
 */
export function pedidosEventos(autorizacion, parametros, { db, ahora = Date.now() }) {
  return ejecutarEventos({
    autorizacion,
    parametros,
    db,
    ahora,
    definicion: {
      capacidad: CAPACIDAD,
      version: VERSION_CONTRATO,
      cursor: CURSOR,
      margenMs: MARGEN_DE_VISIBILIDAD_MS,
      whereEventos,
      orden: ORDEN_EVENTOS,
      select: SELECT_EVENTO,
      aEvento,
      buscar: (args) => db.posTransferencia.findMany(args),
    },
  });
}
