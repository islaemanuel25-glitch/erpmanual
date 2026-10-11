// lib/integraciones/azul-chat/cursorDeEventos.js
//
// EL CURSOR DE LAS CAPACIDADES DE EVENTOS, ESCRITO UNA VEZ.
//
// `transferencias_eventos` (TRANSFERENCIA_RECIBIDA), `pedidos_eventos`
// (PEDIDO_SOLICITADO), `envios_eventos` (TRANSFERENCIA_ENVIADA) y
// `cancelaciones_eventos` (TRANSFERENCIA_CANCELADA) recorren cada una SU tabla
// por SU columna de fecha, pero con el mismo cursor:
//
//   · orden total: la fecha ascendente y, a igual fecha, el `id` ascendente;
//   · `desde` es la posición del ÚLTIMO evento ya leído —exactamente dos
//     claves, la fecha como instante ISO con milisegundos en UTC y el id
//     entero positivo— y la consulta trae lo ESTRICTAMENTE posterior:
//
//       fecha > f   o   (fecha = f  y  id > i)
//
//     Así dos eventos en el mismo milisegundo no se pierden (desempata el id)
//     y no se repiten (la desigualdad es estricta);
//   · se piden `limite + 1` filas: la de más solo dice si `hayMas`;
//   · `siguiente` es la posición del último evento devuelto; sin eventos, el
//     mismo `desde` que se pidió (o `null`): nunca avanza sobre algo que no se
//     devolvió.
//
// Salió de `transferenciasEventos.js` sin cambiar su comportamiento: los textos
// de error llevan los nombres de las claves de cada capacidad y quedan
// idénticos. Lo vigila la huella de `cursorDeEventos.test.mjs`.
//
// Lo que NO vive acá, a propósito: qué filas son eventos (estado, columna no
// nula, a qué local pertenecen) y el margen de visibilidad. Eso depende de
// quién escribe cada fecha y en qué transacción, y cada capacidad lo justifica
// en su archivo.

import { esIdValido } from "./autorizacion.js";

export const LIMITE_POR_DEFECTO = 50;
export const LIMITE_MAXIMO = 100;

/** Un instante ISO con milisegundos, como lo escribe `Date.toISOString()`. */
const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const invalido = (error) => ({ ok: false, status: 400, codigo: "PEDIDO_INVALIDO", error });
const esObjetoPlano = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/**
 * El cursor de una capacidad: cómo se llaman, en sus eventos y en `desde`, la
 * fecha y el id.
 *
 * @param {{campoFecha:string, campoId:string}} nombres p. ej. `fechaRecepcion` y `transferenciaId`.
 */
export function crearCursor({ campoFecha, campoId }) {
  const CLAVES_DESDE = [campoFecha, campoId];

  /**
   * `desde` y `limite`, validados. Lo que no tenga exactamente la forma
   * esperada se rechaza: no se completa, no se recorta, no se interpreta.
   *
   * @returns {{ok:true, desde:{fecha:Date, id:number}|null, limite:number} | {ok:false}}
   */
  function leerParametros(parametros) {
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
        return invalido(`desde tiene que traer exactamente ${campoFecha} y ${campoId}.`);
      }
      if (typeof d[campoFecha] !== "string" || !INSTANTE_ISO.test(d[campoFecha])) {
        return invalido(`desde.${campoFecha} tiene que ser un instante ISO con milisegundos, en UTC.`);
      }
      const fecha = new Date(d[campoFecha]);
      if (Number.isNaN(fecha.getTime()) || fecha.toISOString() !== d[campoFecha]) {
        return invalido(`desde.${campoFecha} no es un instante válido.`);
      }
      if (!esIdValido(d[campoId])) {
        return invalido(`desde.${campoId} tiene que ser un entero positivo.`);
      }
      desde = { fecha, id: d[campoId] };
    }

    return { ok: true, desde, limite };
  }

  /**
   * La página a partir de las filas leídas (hasta `limite + 1`, ya ordenadas).
   * Cada evento trae `campoFecha` (ISO) y `campoId`: de ahí sale `siguiente`.
   */
  function armarPagina({ filas, limite, desde, aEvento }) {
    const hayMas = filas.length > limite;
    const eventos = filas.slice(0, limite).map(aEvento);
    const ultimo = eventos.at(-1);
    const siguiente = ultimo
      ? { [campoFecha]: ultimo[campoFecha], [campoId]: ultimo[campoId] }
      : desde
        ? { [campoFecha]: desde.fecha.toISOString(), [campoId]: desde.id }
        : null;
    return { eventos, siguiente, hayMas };
  }

  return Object.freeze({ campoFecha, campoId, leerParametros, armarPagina });
}

/**
 * La condición "estrictamente después de `desde`" sobre una columna de fecha y
 * el `id`, para el `OR` del `where`. Va junto con el orden `ordenPor(columna)`:
 * el cursor depende de que sean EXACTAMENTE éstos.
 *
 * @param {string} columna la columna de fecha del modelo.
 * @param {{fecha:Date, id:number}} desde
 */
export function despuesDe(columna, desde) {
  return [{ [columna]: { gt: desde.fecha } }, { [columna]: desde.fecha, id: { gt: desde.id } }];
}

/** El orden total de los eventos sobre esa columna de fecha. */
export function ordenPor(columna) {
  return Object.freeze([Object.freeze({ [columna]: "asc" }), Object.freeze({ id: "asc" })]);
}

/** El instante más nuevo que una consulta puede devolver, con el margen de la capacidad. */
export function limiteDeVisibilidadCon(margenMs, ahora) {
  return new Date(ahora - margenMs);
}

/**
 * El ejecutor de una capacidad de eventos: parámetros → local de la
 * autorización → filas hasta `ahora − margen` → la respuesta del contrato.
 *
 * `buscar` es la consulta de la capacidad, escrita en SU archivo sobre SU
 * modelo (`(args) => db.posTransferencia.findMany(args)`): este módulo no
 * elige modelos.
 *
 * @param {object} p
 * @param {{localId:number, grupoId:number}} p.autorizacion
 * @param {unknown} p.parametros
 * @param {object} p.db
 * @param {number} p.ahora
 * @param {{capacidad:string, version:number, cursor:object, margenMs:number, whereEventos:Function, orden:object, select:object, aEvento:Function, buscar:Function}} p.definicion
 */
export async function ejecutarEventos({ autorizacion, parametros, db, ahora, definicion }) {
  const { capacidad, version, cursor, margenMs, whereEventos, orden, select, aEvento, buscar } = definicion;
  const leidos = cursor.leerParametros(parametros);
  if (!leidos.ok) return leidos;
  const { desde, limite } = leidos;

  const delLocal = await localDeLaAutorizacion(db, autorizacion);
  if (!delLocal.ok) return delLocal;
  const { local } = delLocal;

  const hasta = limiteDeVisibilidadCon(margenMs, ahora);
  const filas = await buscar({
    where: whereEventos({ localId: local.id, desde, hasta }),
    orderBy: orden,
    take: limite + 1,
    select,
  });

  const { eventos, siguiente, hayMas } = cursor.armarPagina({ filas, limite, desde, aEvento });
  return {
    ok: true,
    datos: {
      capacidad,
      version,
      local: { id: local.id, nombre: local.nombre },
      grupoId: autorizacion.grupoId,
      hasta: hasta.toISOString(),
      eventos,
      siguiente,
      hayMas,
    },
  };
}

/**
 * El local de la AUTORIZACIÓN —nunca del cuerpo—, con su nombre. Si no existe,
 * el mismo rechazo que daba `transferencias_eventos`.
 */
export async function localDeLaAutorizacion(db, autorizacion) {
  const local = await db.local.findUnique({
    where: { id: autorizacion.localId },
    select: { id: true, nombre: true },
  });
  if (!local) {
    return { ok: false, status: 403, codigo: "LOCAL_SIN_GRUPO", error: "El local pedido no existe." };
  }
  return { ok: true, local };
}
