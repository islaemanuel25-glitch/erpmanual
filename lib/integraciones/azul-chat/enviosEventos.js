// lib/integraciones/azul-chat/enviosEventos.js
//
// CAPACIDAD `envios_eventos`: LAS TRANSFERENCIAS QUE LE ENVIARON A UN LOCAL,
// COMO EVENTOS, PARA QUE AZUL CHAT LAS RECUPERE DE A TANDAS (Tanda 4A).
//
// Solo lectura. La persona, el permiso (`transferencias.ver`) y el local los
// resolvió `autorizarIntegracion` antes de llegar acá: el local sale de la
// AUTORIZACIÓN, nunca del cuerpo.
//
// ── QUÉ ES UNA TRANSFERENCIA_ENVIADA ──────────────────────────────────────
//
// `Transferencia` es EL REMITO, y nace al enviar: `crearTransferencia`
// (lib/transferencias/) crea la cabecera con `estado = "Enviada"` y
// `fechaEnvio = new Date()`, dentro de la transacción del llamador. Es el único
// lugar que escribe `fechaEnvio`, y nada la vuelve a tocar. Por eso el hecho es
// `fechaEnvio` no nula, sea cual sea el estado de hoy: un remito que después se
// recibió o se canceló igual se envió.
//
// Por qué `fechaEnvio` y no `createdAt`: las dos se escriben en el mismo
// `create`, pero `fechaEnvio` es la que nombra el hecho y la que usan las
// pantallas de Transferencias (`listar`, `por-destino`, el tablero). Un remito
// histórico con `fechaEnvio` nula —de antes de que `crearTransferencia` fuera el
// único camino— no se publica: no hay una fecha de envío que afirmar.
//
// Es un evento del local DESTINO: el que va a recibir. El origen no lo recibe.
// Puede venir de un pedido (`posTransferenciaId`, que sale como `pedidoId`) o
// de una venta interna; la venta no sale.
//
// ── EL CURSOR Y EL MARGEN ─────────────────────────────────────────────────
//
// El cursor es el compartido (`cursorDeEventos.js`) sobre (`fechaEnvio`, id).
//
// `fechaEnvio` se escribe con el reloj del proceso ANTES del commit, al
// principio de `crearTransferencia`, y lo llaman dos transacciones:
//   · `pos-transferencias/enviar`: timeout por defecto de Prisma, 5 s;
//   · `pos-ventas/crear` (venta interna): `LIMITES_TRANSACCION_DEL_LOCAL`,
//     timeout 30 s.
// Un envío es visible, entonces, a lo sumo 30 s después de su fecha. El margen
// es 60 s: el doble del timeout más largo. Lo vigila `frontera.test.mjs`: si
// aparece otro llamador o sube ese timeout por encima de la mitad del margen,
// se pone rojo.
//
// ── LA CLAVE DEL EVENTO ───────────────────────────────────────────────────
//
// `TRANSFERENCIA_ENVIADA:<id>:<fechaEnvio ISO>`, por el mismo motivo que
// `transferencias_eventos`: `admin/reset-operativo` reinicia la secuencia.
//
// ── QUÉ NO SALE ───────────────────────────────────────────────────────────
//
// Ni productos, ni cantidades, ni precios, ni la venta, ni quién lo envió: el
// id del remito, la fecha, el origen, cuántas líneas y, si vino de un pedido,
// su id.

import { crearCursor, despuesDe, ejecutarEventos, ordenPor } from "./cursorDeEventos.js";

export const VERSION_CONTRATO = 1;
export const CAPACIDAD = "envios_eventos";
export const TIPO_TRANSFERENCIA_ENVIADA = "TRANSFERENCIA_ENVIADA";

/** Lo que un envío tarda, como máximo y con holgura, en ser visible. Ver arriba. */
export const MARGEN_DE_VISIBILIDAD_MS = 60 * 1000;

export const CURSOR = crearCursor({ campoFecha: "fechaEnvio", campoId: "transferenciaId" });

/** El orden total de los eventos. El cursor depende de que sea EXACTAMENTE éste. */
export const ORDEN_EVENTOS = ordenPor("fechaEnvio");

/** Los remitos enviados al local, estrictamente después de `desde` y no más nuevos que `hasta`. */
export function whereEventos({ localId, desde, hasta }) {
  const where = { destinoId: localId, fechaEnvio: { not: null, lte: hasta } };
  if (desde) where.OR = despuesDe("fechaEnvio", desde);
  return where;
}

/** Lo mínimo: el id, la fecha, el pedido de origen, el origen con nombre y cuántas líneas. */
export const SELECT_EVENTO = Object.freeze({
  id: true,
  fechaEnvio: true,
  posTransferenciaId: true,
  origen: Object.freeze({ select: Object.freeze({ id: true, nombre: true }) }),
  _count: Object.freeze({ select: Object.freeze({ detalle: true }) }),
});

/** La clave estable del evento. Ver "LA CLAVE DEL EVENTO". */
export function idDeEvento(transferenciaId, fechaEnvioISO) {
  return `${TIPO_TRANSFERENCIA_ENVIADA}:${transferenciaId}:${fechaEnvioISO}`;
}

/** Una fila de `Transferencia` (con `SELECT_EVENTO`) → el evento. */
export function aEvento(t) {
  const fechaEnvio = new Date(t.fechaEnvio).toISOString();
  return {
    tipo: TIPO_TRANSFERENCIA_ENVIADA,
    eventoId: idDeEvento(t.id, fechaEnvio),
    transferenciaId: t.id,
    fechaEnvio,
    origen: { id: t.origen.id, nombre: t.origen.nombre },
    lineas: t._count?.detalle ?? 0,
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
export function enviosEventos(autorizacion, parametros, { db, ahora = Date.now() }) {
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
