// lib/integraciones/azul-chat/cancelacionesEventos.js
//
// CAPACIDAD `cancelaciones_eventos`: LAS TRANSFERENCIAS DIRIGIDAS A UN LOCAL
// QUE SE CANCELARON, COMO EVENTOS, PARA QUE AZUL CHAT LAS RECUPERE DE A TANDAS
// (Tanda 4A).
//
// Solo lectura. La persona, el permiso (`transferencias.ver`) y el local los
// resolvió `autorizarIntegracion` antes de llegar acá: el local sale de la
// AUTORIZACIÓN, nunca del cuerpo.
//
// ── QUÉ ES UNA TRANSFERENCIA_CANCELADA ────────────────────────────────────
//
// `transferencias/cancelar`, en UNA transacción, revierte el stock del origen,
// revierte la venta vinculada si la hay y cierra el remito con
// `estado = "Cancelada"`, `canceladaEn = new Date()`, `canceladaPorId` y
// `motivoCancelacion`. Es el único lugar que escribe `canceladaEn`, y es
// terminal: una cancelada no se reabre. Por eso el hecho es `canceladaEn` no
// nula. Una cancelación anterior al 2026-08-20 —cuando la columna todavía no
// existía— la tiene nula y no se publica: no hay fecha que afirmar.
//
// Es un evento del local DESTINO, el mismo que recibió el TRANSFERENCIA_ENVIADA
// de ese remito: lo que le iba a llegar ya no llega.
//
// Por qué una capacidad aparte y no un segundo tipo en `envios_eventos`: cada
// una ordena por OTRA columna (`fechaEnvio` y `canceladaEn`). Mezclarlas en un
// cursor obligaría a un orden sobre dos columnas distintas en una sola consulta.
// Separadas, cada una tiene el cursor de siempre.
//
// ── EL CURSOR Y EL MARGEN ─────────────────────────────────────────────────
//
// El cursor es el compartido (`cursorDeEventos.js`) sobre (`canceladaEn`, id).
//
// `canceladaEn` se escribe con el reloj del proceso al final de la transacción
// de `cancelar`, que usa el timeout por defecto de Prisma (5 s). Margen: 60 s,
// el mismo de `transferencias_eventos` y por el mismo motivo. Lo vigila
// `frontera.test.mjs`.
//
// ── LA CLAVE DEL EVENTO ───────────────────────────────────────────────────
//
// `TRANSFERENCIA_CANCELADA:<id>:<canceladaEn ISO>`.
//
// ── QUÉ NO SALE ───────────────────────────────────────────────────────────
//
// Ni el motivo (es texto libre), ni quién canceló, ni productos, ni la venta:
// el id del remito, la fecha de cancelación, el origen y, si vino de un pedido,
// su id.

import { crearCursor, despuesDe, ejecutarEventos, ordenPor } from "./cursorDeEventos.js";

export const VERSION_CONTRATO = 1;
export const CAPACIDAD = "cancelaciones_eventos";
export const TIPO_TRANSFERENCIA_CANCELADA = "TRANSFERENCIA_CANCELADA";

/** Lo que una cancelación tarda, como máximo y con holgura, en ser visible. Ver arriba. */
export const MARGEN_DE_VISIBILIDAD_MS = 60 * 1000;

export const CURSOR = crearCursor({ campoFecha: "fechaCancelacion", campoId: "transferenciaId" });

/** El orden total de los eventos. El cursor depende de que sea EXACTAMENTE éste. */
export const ORDEN_EVENTOS = ordenPor("canceladaEn");

/** Los remitos al local que se cancelaron, estrictamente después de `desde` y no más nuevos que `hasta`. */
export function whereEventos({ localId, desde, hasta }) {
  const where = { destinoId: localId, canceladaEn: { not: null, lte: hasta } };
  if (desde) where.OR = despuesDe("canceladaEn", desde);
  return where;
}

/** Lo mínimo: el id, la fecha de cancelación, el pedido de origen y el origen con nombre. */
export const SELECT_EVENTO = Object.freeze({
  id: true,
  canceladaEn: true,
  posTransferenciaId: true,
  origen: Object.freeze({ select: Object.freeze({ id: true, nombre: true }) }),
});

/** La clave estable del evento. Ver "LA CLAVE DEL EVENTO". */
export function idDeEvento(transferenciaId, fechaCancelacionISO) {
  return `${TIPO_TRANSFERENCIA_CANCELADA}:${transferenciaId}:${fechaCancelacionISO}`;
}

/** Una fila de `Transferencia` (con `SELECT_EVENTO`) → el evento. */
export function aEvento(t) {
  const fechaCancelacion = new Date(t.canceladaEn).toISOString();
  return {
    tipo: TIPO_TRANSFERENCIA_CANCELADA,
    eventoId: idDeEvento(t.id, fechaCancelacion),
    transferenciaId: t.id,
    fechaCancelacion,
    origen: { id: t.origen.id, nombre: t.origen.nombre },
    pedidoId: t.posTransferenciaId ?? null,
  };
}

/**
 * Ejecuta la capacidad para una autorización ya concedida.
 *
 * @param {{localId:number, grupoId:number}} autorizacion
 * @param {{desde?:unknown, limite?:unknown}} parametros
 * @param {{db:object, ahora?:number}} deps `db` es el cliente Prisma.
 */
export function cancelacionesEventos(autorizacion, parametros, { db, ahora = Date.now() }) {
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
      buscar: (args) => db.transferencia.findMany(args),
    },
  });
}
