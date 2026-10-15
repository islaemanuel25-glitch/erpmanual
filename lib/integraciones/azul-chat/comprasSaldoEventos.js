// lib/integraciones/azul-chat/comprasSaldoEventos.js
//
// CAPACIDAD `compras_saldo_eventos`: LAS COMPRAS QUE UN LOCAL RECIBIÓ DEJANDO
// DEUDA CON EL PROVEEDOR, COMO EVENTOS, PARA QUE AZUL CHAT LAS RECUPERE DE A
// TANDAS (2026-10-15).
//
// Solo lectura. La persona, el permiso (`finanzas.ver`, el de Pagos a
// proveedores) y el local los resolvió `autorizarIntegracion` antes de llegar
// acá: el local sale de la AUTORIZACIÓN, nunca del cuerpo.
//
// ── QUÉ ES UNA COMPRA_CON_SALDO ───────────────────────────────────────────
//
// Una fila de `CompraConSaldo`: la recepción de una compra donde algo ya se
// había pagado y aun así quedó saldo, y alguien lo confirmó a sabiendas. La
// escribe SOLO `compras-proveedor/recibir/[id]`, adentro de la transacción del
// cierre, una por pedido (UNIQUE). Es del local DUEÑO de la compra, el que
// debe.
//
// El ERP no le EMPUJA nada a Azul Chat: Chat pregunta, como con el resto de
// los eventos. Por eso un Chat caído no frena una recepción: la fila queda
// escrita y Chat la levanta cuando vuelva a preguntar, con su cursor.
//
// ── EL CURSOR Y EL MARGEN ─────────────────────────────────────────────────
//
// El cursor es el compartido (`cursorDeEventos.js`) sobre (`confirmadoEn`, id).
// `confirmadoEn` se escribe antes del commit, dentro de la transacción del
// cierre, que corre con el timeout por defecto de Prisma (5 s). El margen es el
// mismo de las otras: 60 s. Lo vigila `frontera.test.mjs`.
//
// ── LA CLAVE DEL EVENTO ───────────────────────────────────────────────────
//
// `COMPRA_CON_SALDO:<id>:<confirmadoEn ISO>`, por el mismo motivo que las
// otras: un reinicio de la secuencia no puede repetir una clave.
//
// ── QUÉ SALE ──────────────────────────────────────────────────────────────
//
// El pedido, el proveedor, los tres números que se vieron al confirmar y el
// texto armado por la misma pieza que arma el aviso de la recepción. Ni
// productos, ni quién confirmó.

import { crearCursor, despuesDe, ejecutarEventos, ordenPor } from "./cursorDeEventos.js";
import { aCentavos } from "@/lib/caja/efectivoEsperado";
import { textoDelEvento } from "@/lib/compras-proveedor/saldoAlRecibir";

export const VERSION_CONTRATO = 1;
export const CAPACIDAD = "compras_saldo_eventos";
export const TIPO_COMPRA_CON_SALDO = "COMPRA_CON_SALDO";

/** Lo que una confirmación tarda, como máximo y con holgura, en ser visible. Ver arriba. */
export const MARGEN_DE_VISIBILIDAD_MS = 60 * 1000;

export const CURSOR = crearCursor({ campoFecha: "confirmadoEn", campoId: "compraConSaldoId" });

/** El orden total de los eventos. El cursor depende de que sea EXACTAMENTE éste. */
export const ORDEN_EVENTOS = ordenPor("confirmadoEn");

/** Las compras con saldo del local, estrictamente después de `desde` y no más nuevas que `hasta`. */
export function whereEventos({ localId, desde, hasta }) {
  const where = { localId, confirmadoEn: { lte: hasta } };
  if (desde) where.OR = despuesDe("confirmadoEn", desde);
  return where;
}

/** Lo mínimo: el id, la fecha, el pedido, los tres números y el nombre del proveedor. */
export const SELECT_EVENTO = Object.freeze({
  id: true,
  confirmadoEn: true,
  pedidoProveedorId: true,
  total: true,
  pagado: true,
  saldo: true,
  pedido: Object.freeze({
    select: Object.freeze({ proveedor: Object.freeze({ select: Object.freeze({ id: true, nombre: true }) }) }),
  }),
});

/** La clave estable del evento. Ver "LA CLAVE DEL EVENTO". */
export function idDeEvento(compraConSaldoId, confirmadoEnISO) {
  return `${TIPO_COMPRA_CON_SALDO}:${compraConSaldoId}:${confirmadoEnISO}`;
}

/** Una fila de `CompraConSaldo` (con `SELECT_EVENTO`) → el evento. */
export function aEvento(c) {
  const confirmadoEn = new Date(c.confirmadoEn).toISOString();
  const proveedor = c.pedido?.proveedor ?? null;
  const totalCentavos = aCentavos(c.total);
  const pagadoCentavos = aCentavos(c.pagado);
  const saldoCentavos = aCentavos(c.saldo);
  return {
    tipo: TIPO_COMPRA_CON_SALDO,
    eventoId: idDeEvento(c.id, confirmadoEn),
    compraConSaldoId: c.id,
    confirmadoEn,
    pedidoId: c.pedidoProveedorId,
    proveedor: proveedor ? { id: proveedor.id, nombre: proveedor.nombre } : null,
    total: totalCentavos / 100,
    pagado: pagadoCentavos / 100,
    saldo: saldoCentavos / 100,
    texto: textoDelEvento({ proveedor: proveedor?.nombre || "Proveedor", totalCentavos, pagadoCentavos, saldoCentavos }),
  };
}

/**
 * Ejecuta la capacidad para una autorización ya concedida.
 *
 * @param {{localId:number, grupoId:number}} autorizacion
 * @param {{desde?:unknown, limite?:unknown}} parametros
 * @param {{db:object, ahora?:number}} deps `db` es el cliente Prisma.
 */
export function comprasSaldoEventos(autorizacion, parametros, { db, ahora = Date.now() }) {
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
      buscar: (args) => db.compraConSaldo.findMany(args),
    },
  });
}
