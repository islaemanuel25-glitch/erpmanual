// lib/integraciones/azul-chat/transferenciasEventos.js
//
// CAPACIDAD `transferencias_eventos`: LAS TRANSFERENCIAS QUE UN LOCAL RECIBIÓ,
// COMO EVENTOS, PARA QUE AZUL CHAT LAS RECUPERE DE A TANDAS.
//
// Solo lectura. La persona, el permiso (`transferencias.ver`) y el local los
// resolvió `autorizarIntegracion` antes de llegar acá: este archivo no mira
// permisos ni alcance, y el local sale de la AUTORIZACIÓN, nunca del cuerpo.
//
// ── QUÉ ES UNA TRANSFERENCIA_RECIBIDA ─────────────────────────────────────
//
// La que `confirmar-recepcion` cerró: en UNA transacción mueve el stock, pone
// `estado = "Recibida"`, escribe `fechaRecepcion` y `tieneDiferencias`. Esa
// escritura es el hecho, y es terminal: una recibida no se cancela, no se
// reabre y no se confirma dos veces. Por eso el evento se lee de
// `Transferencia`, no de una notificación ni de `AuditoriaStock`.
//
// Es un evento del local que RECIBIÓ: se filtra por `destinoId`. El origen no
// recibe el mismo evento.
//
// ── EL CURSOR ─────────────────────────────────────────────────────────────
//
// Orden total: `fechaRecepcion` ascendente y, a igual fecha, `id` ascendente.
// El cursor `desde` es la posición del ÚLTIMO evento ya leído, y la consulta
// trae lo estrictamente posterior:
//
//   fechaRecepcion > f   o   (fechaRecepcion = f  y  id > t)
//
// Así dos recepciones con el mismo milisegundo no se pierden (desempata el id)
// y no se repiten (la desigualdad es estricta). Se piden `limite + 1` filas:
// la de más solo dice si `hayMas`.
//
// ── EL MARGEN DE 60 SEGUNDOS, Y POR QUÉ NO SE PUEDE SACAR ─────────────────
//
// `fechaRecepcion` se escribe con el reloj del proceso ANTES del commit. Dos
// confirmaciones concurrentes pueden comprometerse al revés de sus fechas: si
// Azul Chat leyera entre los dos commits, su cursor pasaría la fecha más vieja
// y esa recepción, que se hace visible después, no aparecería nunca.
//
// La transacción de `confirmar-recepcion` usa el timeout por defecto de Prisma
// (5 s): una recepción es visible a lo sumo unos segundos después de su fecha.
// Por eso esta capacidad devuelve SOLO lo que tiene `fechaRecepcion <= ahora −
// 60 s` (`hasta` en la respuesta). Lo más nuevo aparece en la consulta
// siguiente, una sola vez. Supone una sola instancia del ERP —o relojes
// alineados— y que nadie suba ese timeout por encima del margen. Lo vigilan
// candados en `transferenciasEventos.test.mjs` y en `frontera.test.mjs`.
//
// ── LA CLAVE DEL EVENTO ───────────────────────────────────────────────────
//
// `TRANSFERENCIA_RECIBIDA:<id>:<fechaRecepcion ISO>`. No alcanza con el id:
// `admin/reset-operativo` borra las transferencias y reinicia su secuencia, así
// que un id puede volver a existir. La fecha de una recepción no cambia nunca
// (el estado es terminal), así que la clave es estable.
//
// ── LAS DIFERENCIAS ───────────────────────────────────────────────────────
//
// `tieneDiferencias` es la columna que escribió la confirmación.
// `lineasConDiferencia` es el conteo canónico sobre las líneas, el mismo que
// muestra la pantalla de Transferencias. Son dos datos y no se fuerzan a
// coincidir: en una línea histórica que la puerta no puede leer, la columna
// puede decir que sí y el conteo saltearla.

import { esIdValido } from "./autorizacion.js";
import { ESTADO_RECIBIDA } from "@/lib/transferencias/criterioDeCuenta";
import { SELECT_TRANSFERENCIA_DE_LA_CUENTA } from "@/lib/transferencias/cuentaDelPeriodoServer";
import { contarLineasConDiferencia } from "@/lib/transferencias/lineasConDiferencia";

export const VERSION_CONTRATO = 1;
export const CAPACIDAD = "transferencias_eventos";
export const TIPO_TRANSFERENCIA_RECIBIDA = "TRANSFERENCIA_RECIBIDA";

/** Lo que una recepción tarda, como máximo y con holgura, en ser visible. Ver arriba. */
export const MARGEN_DE_VISIBILIDAD_MS = 60 * 1000;

export const LIMITE_POR_DEFECTO = 50;
export const LIMITE_MAXIMO = 100;

/** Un instante ISO con milisegundos, como lo escribe `Date.toISOString()`. */
const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CLAVES_DESDE = ["fechaRecepcion", "transferenciaId"];

const invalido = (error) => ({ ok: false, status: 400, codigo: "PEDIDO_INVALIDO", error });
const esObjetoPlano = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/**
 * `desde` y `limite`, validados. Lo que no tenga exactamente la forma esperada
 * se rechaza: no se completa, no se recorta, no se interpreta.
 *
 * @returns {{ok:true, desde:{fecha:Date, transferenciaId:number}|null, limite:number} | {ok:false}}
 */
export function leerParametros(parametros) {
  const p = esObjetoPlano(parametros) ? parametros : {};

  let limite = LIMITE_POR_DEFECTO;
  if (p.limite !== undefined) {
    if (!Number.isSafeInteger(p.limite) || p.limite < 1 || p.limite > LIMITE_MAXIMO) {
      return invalido(`limite tiene que ser un entero entre 1 y ${LIMITE_MAXIMO}.`);
    }
    limite = p.limite;
  }

  let desde = null;
  if (p.desde !== undefined) {
    const d = p.desde;
    if (!esObjetoPlano(d) || Object.keys(d).length !== 2 || !CLAVES_DESDE.every((k) => Object.prototype.hasOwnProperty.call(d, k))) {
      return invalido("desde tiene que traer exactamente fechaRecepcion y transferenciaId.");
    }
    if (typeof d.fechaRecepcion !== "string" || !INSTANTE_ISO.test(d.fechaRecepcion)) {
      return invalido("desde.fechaRecepcion tiene que ser un instante ISO con milisegundos, en UTC.");
    }
    const fecha = new Date(d.fechaRecepcion);
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString() !== d.fechaRecepcion) {
      return invalido("desde.fechaRecepcion no es un instante válido.");
    }
    if (!esIdValido(d.transferenciaId)) {
      return invalido("desde.transferenciaId tiene que ser un entero positivo.");
    }
    desde = { fecha, transferenciaId: d.transferenciaId };
  }

  return { ok: true, desde, limite };
}

/** El instante más nuevo que esta consulta puede devolver. */
export function limiteDeVisibilidad(ahora) {
  return new Date(ahora - MARGEN_DE_VISIBILIDAD_MS);
}

/** El orden total de los eventos. El cursor depende de que sea EXACTAMENTE éste. */
export const ORDEN_EVENTOS = Object.freeze([Object.freeze({ fechaRecepcion: "asc" }), Object.freeze({ id: "asc" })]);

/**
 * El `where` de las recepciones de un local, estrictamente después de `desde`
 * y no más nuevas que `hasta`.
 */
export function whereEventos({ localId, desde, hasta }) {
  const where = {
    destinoId: localId,
    estado: ESTADO_RECIBIDA,
    fechaRecepcion: { not: null, lte: hasta },
  };
  if (desde) {
    where.OR = [
      { fechaRecepcion: { gt: desde.fecha } },
      { fechaRecepcion: desde.fecha, id: { gt: desde.transferenciaId } },
    ];
  }
  return where;
}

/** El select compartido con la cuenta del período, más la columna de la confirmación. */
export const SELECT_EVENTO = Object.freeze({ ...SELECT_TRANSFERENCIA_DE_LA_CUENTA, tieneDiferencias: true });

/** La clave estable del evento. Ver "LA CLAVE DEL EVENTO". */
export function idDeEvento(transferenciaId, fechaRecepcionISO) {
  return `${TIPO_TRANSFERENCIA_RECIBIDA}:${transferenciaId}:${fechaRecepcionISO}`;
}

/** Una fila de `Transferencia` (con `SELECT_EVENTO`) → el evento, con lo mínimo. */
export function aEvento(t) {
  const fechaRecepcion = new Date(t.fechaRecepcion).toISOString();
  return {
    tipo: TIPO_TRANSFERENCIA_RECIBIDA,
    eventoId: idDeEvento(t.id, fechaRecepcion),
    transferenciaId: t.id,
    fechaRecepcion,
    origen: { id: t.origen.id, nombre: t.origen.nombre, esDeposito: t.origen.es_deposito === true },
    destino: { id: t.destino.id, nombre: t.destino.nombre },
    tieneDiferencias: t.tieneDiferencias === true,
    lineasConDiferencia: contarLineasConDiferencia(t.detalle || []),
  };
}

/**
 * La respuesta a partir de las filas leídas (hasta `limite + 1`, ya ordenadas).
 *
 * `siguiente` es la posición del último evento devuelto, para usarla como
 * `desde` en el pedido que sigue. Si no vino ninguno, es el mismo `desde` que
 * se pidió (o `null`): el cursor nunca avanza sobre algo que no se devolvió.
 */
export function armarTransferenciasEventos({ local, grupoId, hasta, desde, limite, filas }) {
  const hayMas = filas.length > limite;
  const eventos = filas.slice(0, limite).map(aEvento);
  const ultimo = eventos.at(-1);
  const siguiente = ultimo
    ? { fechaRecepcion: ultimo.fechaRecepcion, transferenciaId: ultimo.transferenciaId }
    : desde
      ? { fechaRecepcion: desde.fecha.toISOString(), transferenciaId: desde.transferenciaId }
      : null;
  return {
    capacidad: CAPACIDAD,
    version: VERSION_CONTRATO,
    local: { id: local.id, nombre: local.nombre },
    grupoId,
    hasta: hasta.toISOString(),
    eventos,
    siguiente,
    hayMas,
  };
}

/**
 * Ejecuta la capacidad para una autorización ya concedida.
 *
 * @param {{localId:number, grupoId:number}} autorizacion
 * @param {{desde?:unknown, limite?:unknown}} parametros
 * @param {{db:object, ahora?:number}} deps `db` es el cliente Prisma.
 */
export async function transferenciasEventos(autorizacion, parametros, { db, ahora = Date.now() }) {
  const leidos = leerParametros(parametros);
  if (!leidos.ok) return leidos;
  const { desde, limite } = leidos;

  const local = await db.local.findUnique({
    where: { id: autorizacion.localId },
    select: { id: true, nombre: true },
  });
  if (!local) {
    return { ok: false, status: 403, codigo: "LOCAL_SIN_GRUPO", error: "El local pedido no existe." };
  }

  const hasta = limiteDeVisibilidad(ahora);
  const filas = await db.transferencia.findMany({
    where: whereEventos({ localId: local.id, desde, hasta }),
    orderBy: ORDEN_EVENTOS,
    take: limite + 1,
    select: SELECT_EVENTO,
  });

  return {
    ok: true,
    datos: armarTransferenciasEventos({ local, grupoId: autorizacion.grupoId, hasta, desde, limite, filas }),
  };
}
