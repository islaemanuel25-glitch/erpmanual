// lib/tesoreria/verificacionEfectivoServer.js
//
// VERIFICAR Y ANULAR EL EFECTIVO ENTREGADO, CONTRA LA BASE.
//
// Las rutas (`app/api/finanzas/tesoreria/verificaciones`) deciden QUIÉN y DE
// QUÉ LOCAL; esto decide QUÉ se escribe, adentro de la transacción que le pasan.
// La base vuelve a comprobar todo (migración 20261004120000_verificacion_efectivo):
// estas funciones existen para que el rechazo llegue con un código y palabras, y
// para que dos operaciones sobre las mismas entregas se pongan en fila en vez de
// chocar contra un índice.
//
// ── EL ORDEN DE LOS BLOQUEOS, Y POR QUÉ ES ÉSTE ─────────────────────────────
//
//   1. los TURNO de las entregas, FOR UPDATE, en orden de id ascendente
//      (`bloquearTurno`, el mismo candado que toman el POS y la corrección
//      histórica);
//   2. después, y solo después, la fila propia: los CajaMovimiento FOR SHARE al
//      verificar, la VerificacionEfectivo FOR UPDATE al anular.
//
// La corrección histórica toma también los turnos primero, en orden de id, y
// recién después sus cortes, arqueos y movimientos (lib/caja/correcciones/motor.js).
// Nadie toma un turno teniendo ya un movimiento o una verificación, así que no
// hay ciclo. Y como las cuatro operaciones que tocan una entrega —verificar,
// anular, corregir, y el POS sobre esa caja— pasan por el turno, se ordenan ahí:
// la segunda en llegar ve confirmado lo de la primera.

import { bloquearTurno } from "../caja/cierreRelevoServer.js";
import { clasificarMovimientos } from "../finanzas/movimientosDeCaja.js";
import { vinculosDeMovimientos } from "../finanzas/movimientosDeCajaServer.js";
import { CLASES_DE_ENTREGA } from "./lecturaTesoreria.js";
import {
  ESTADO_VERIFICACION,
  armarVerificacionEfectivo,
  contenidoDeVerificacion,
  datosDeAnulacion,
  huellaDeVerificacion,
  ErrorVerificacionEfectivo,
} from "./verificacionEfectivo.js";
import { SELECT_VERIFICACION, contenidoGuardado, formatoDeVerificacion } from "./verificacionEfectivoLectura.js";
import { grupoDeTesoreria } from "./turnoComercial.js";
import { fechaOperativaParaGuardar } from "../caja/turnoOperativo.js";

/** Los rechazos, con un código estable para la pantalla y el estado HTTP. */
export const CODIGO_VERIFICACION = Object.freeze({
  ENTREGA_NO_EXISTE: "ENTREGA_NO_EXISTE",
  NO_ES_ENTREGA: "NO_ES_ENTREGA",
  LOCALES_MEZCLADOS: "LOCALES_MEZCLADOS",
  FUERA_DE_ALCANCE: "FUERA_DE_ALCANCE",
  ENTREGA_YA_VERIFICADA: "ENTREGA_YA_VERIFICADA",
  IDEMPOTENCIA_CONFLICTO: "IDEMPOTENCIA_CONFLICTO",
  VERIFICACION_NO_EXISTE: "VERIFICACION_NO_EXISTE",
  PEDIDO_INVALIDO: "PEDIDO_INVALIDO",
  TURNOS_MEZCLADOS: "TURNOS_OPERATIVOS_MEZCLADOS",
  FECHAS_MEZCLADAS: "FECHAS_OPERATIVAS_MEZCLADAS",
});

export class RechazoVerificacion extends Error {
  constructor(codigo, mensaje, status, detalle = null) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
    this.detalle = detalle;
  }
}

/**
 * El turno operativo de un conjunto de entregas, o el rechazo si mezclan
 * turnos o fechas. Usa el mismo agrupamiento que la lectura de Tesorería, así
 * que se verifica exactamente lo que la pantalla muestra como un turno.
 *
 * @param {number} localId
 * @param {Array<{id:number, createdAt:Date, turnoId:number, turno:{turnoOperativoId:number|null, fechaOperativa:Date|null}}>} movimientos
 * @returns {{turnoOperativoId:number|null, fechaOperativa:Date|null}}
 * @throws {RechazoVerificacion}
 */
export function turnoOperativoDeLasEntregas(localId, movimientos) {
  const grupos = movimientos.map((m) => ({
    cajaMovimientoId: m.id,
    grupo: grupoDeTesoreria(localId, {
      caja: { turnoOperativoId: m.turno?.turnoOperativoId ?? null, fechaOperativa: m.turno?.fechaOperativa ?? null },
      instante: m.createdAt,
    }),
  }));
  const claves = [...new Set(grupos.map((g) => g.grupo?.clave ?? null))];
  if (claves.length > 1) {
    const turnos = new Set(grupos.map((g) => g.grupo?.turnoOperativoId ?? null));
    const mezclaTurnos = turnos.size > 1;
    throw new RechazoVerificacion(
      mezclaTurnos ? CODIGO_VERIFICACION.TURNOS_MEZCLADOS : CODIGO_VERIFICACION.FECHAS_MEZCLADAS,
      mezclaTurnos
        ? "Una verificación es de un solo turno operativo: las entregas elegidas son de más de uno. Verificá cada turno por separado."
        : "Una verificación es de una sola fecha operativa: las entregas elegidas son de más de un día. Verificá cada día por separado.",
      400,
      { entregas: grupos.map((g) => ({ cajaMovimientoId: g.cajaMovimientoId, grupo: g.grupo?.clave ?? null })) }
    );
  }
  const g = grupos[0]?.grupo;
  return g && !g.sinTurno
    ? { turnoOperativoId: g.turnoOperativoId, fechaOperativa: fechaOperativaParaGuardar(g.fechaOperativa) }
    : { turnoOperativoId: null, fechaOperativa: null };
}

const mismoContenido = (a, b) =>
  JSON.stringify(contenidoDeVerificacion(a)) === JSON.stringify(contenidoDeVerificacion(b));

/**
 * El local de las entregas pedidas, leído SIN bloquear: el turno de un
 * movimiento y el local de un turno no cambian nunca. Lo usa la ruta para
 * decidir el alcance ANTES de abrir la transacción; la transacción lo vuelve a
 * comprobar con las filas tomadas.
 *
 * El ALCANCE va primero: una entrega de un local que quien pide no ve es 403 y
 * nada más —ni qué id, ni de qué local—, antes de decir si falta alguna o si se
 * mezclan locales. Si no, el rechazo contaría qué movimientos existen afuera.
 *
 * @param {number[]} visibles  las ubicaciones que quien pide puede ver
 *   (`ubicacionesVisibles`, el mismo criterio que la lectura)
 * @returns {Promise<number>} el localId
 * @throws {RechazoVerificacion} fuera de alcance, si falta alguna o son de más de un local
 */
export async function localDeLasEntregas(db, cajaMovimientoIds, { visibles }) {
  const filas = await db.cajaMovimiento.findMany({
    where: { id: { in: cajaMovimientoIds } },
    select: { id: true, turno: { select: { localId: true } } },
  });
  if (filas.some((f) => !visibles.includes(f.turno.localId))) {
    throw new RechazoVerificacion(
      CODIGO_VERIFICACION.FUERA_DE_ALCANCE,
      "Hay entregas de un local fuera de tu alcance.",
      403
    );
  }
  const faltan = cajaMovimientoIds.filter((id) => !filas.some((f) => f.id === id));
  if (faltan.length) {
    throw new RechazoVerificacion(
      CODIGO_VERIFICACION.ENTREGA_NO_EXISTE,
      `No existe el movimiento de caja ${faltan.join(", ")}.`,
      404,
      { cajaMovimientoIds: faltan }
    );
  }
  const locales = [...new Set(filas.map((f) => f.turno.localId))];
  if (locales.length !== 1) {
    throw new RechazoVerificacion(
      CODIGO_VERIFICACION.LOCALES_MEZCLADOS,
      "Una verificación es de un solo local: las entregas elegidas son de más de uno.",
      400,
      { localIds: locales.sort((a, b) => a - b) }
    );
  }
  return locales[0];
}

/** La verificación que ya usó esta clave en este local, o null. */
function porClave(db, localId, idempotencyKey) {
  return db.verificacionEfectivo.findUnique({
    where: { localId_idempotencyKey: { localId, idempotencyKey } },
    select: SELECT_VERIFICACION,
  });
}

/**
 * Lo que hay que contestar si la clave ya se usó: la misma verificación si el
 * contenido es el mismo, o un conflicto si no. Nunca escribe.
 *
 * @returns {Promise<object|null>} `{repetida:true, verificacion}` o null si la clave está libre
 */
export async function resolverClave(db, { localId, pedido }) {
  const previa = await porClave(db, localId, pedido.idempotencyKey);
  if (!previa) return null;
  if (!mismoContenido(contenidoGuardado(previa), pedido)) {
    throw new RechazoVerificacion(
      CODIGO_VERIFICACION.IDEMPOTENCIA_CONFLICTO,
      "Esa clave ya se usó para otra verificación, con otras entregas, otro importe u otra observación. Un intento nuevo lleva una clave nueva.",
      409,
      { verificacionId: previa.id, huellaGuardada: huellaDeVerificacion(contenidoGuardado(previa)), huellaPedida: huellaDeVerificacion(pedido) }
    );
  }
  return { repetida: true, verificacion: formatoDeVerificacion(previa) };
}

/**
 * VERIFICA un conjunto de entregas de UN local. Corre adentro de la transacción
 * que recibe.
 *
 * El declarado lo calcula esto, de los movimientos tomados; el cliente solo
 * dice qué entregas y cuánto contó.
 *
 * @param {object} tx
 * @param {object} args
 * @param {number} args.localId   el local de las entregas, ya autorizado por la ruta
 * @param {object} args.pedido    el de `leerPedidoDeVerificacion`
 * @param {number} args.usuarioId la cuenta ERP que ejecuta
 * @returns {Promise<{repetida:boolean, verificacion:object}>}
 */
export async function verificarEfectivo(tx, { localId, pedido, usuarioId }) {
  const ids = pedido.cajaMovimientoIds;

  // Los turnos, para tomarlos en orden. Sin bloquear: no cambian.
  const sinBloquear = await tx.cajaMovimiento.findMany({ where: { id: { in: ids } }, select: { id: true, turnoId: true } });
  if (sinBloquear.length !== ids.length) {
    const faltan = ids.filter((id) => !sinBloquear.some((m) => m.id === id));
    throw new RechazoVerificacion(CODIGO_VERIFICACION.ENTREGA_NO_EXISTE, `No existe el movimiento de caja ${faltan.join(", ")}.`, 404, { cajaMovimientoIds: faltan });
  }
  const turnoIds = [...new Set(sinBloquear.map((m) => m.turnoId))].sort((a, b) => a - b);
  for (const turnoId of turnoIds) await bloquearTurno(tx, turnoId);

  // La clave, con los turnos tomados: un reintento simultáneo del mismo intento
  // espera arriba y acá ve la verificación que dejó el primero.
  const repetida = await resolverClave(tx, { localId, pedido });
  if (repetida) return repetida;

  await tx.$queryRaw`SELECT id FROM "CajaMovimiento" WHERE id = ANY(${ids}::int[]) ORDER BY id FOR SHARE`;
  const movimientos = await tx.cajaMovimiento.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      tipo: true,
      monto: true,
      createdAt: true,
      turnoId: true,
      turno: { select: { localId: true, operadorId: true, turnoOperativoId: true, fechaOperativa: true } },
    },
  });

  const ajenos = movimientos.filter((m) => m.turno.localId !== localId).map((m) => m.id);
  if (ajenos.length) {
    throw new RechazoVerificacion(
      CODIGO_VERIFICACION.FUERA_DE_ALCANCE,
      "Hay entregas de otro local: una verificación es de un solo local.",
      403,
      { cajaMovimientoIds: ajenos }
    );
  }

  // La clase, por VÍNCULO y nunca por el motivo: la misma clasificación que la lectura.
  // UNA VERIFICACIÓN ES DE UN TURNO OPERATIVO. Todas las entregas tienen que
  // caer en el mismo grupo que les da la lectura —el turno y la fecha
  // operativa de su caja, o "Sin turno asignado" de un mismo día—: dos turnos
  // no se cuentan juntos, ni dos fechas. Se decide acá, con las filas
  // tomadas, y no con lo que diga la pantalla; la base lo vuelve a exigir.
  const turnoDeLaVerificacion = turnoOperativoDeLasEntregas(localId, movimientos);

  const clasificados = clasificarMovimientos(movimientos, await vinculosDeMovimientos(tx, ids));
  const noEntregas = clasificados.filter((m) => !CLASES_DE_ENTREGA.includes(m.clase));
  if (noEntregas.length) {
    throw new RechazoVerificacion(
      CODIGO_VERIFICACION.NO_ES_ENTREGA,
      "Solo se verifican entregas de efectivo: retiros de recaudación o de cierre.",
      400,
      { movimientos: noEntregas.map((m) => ({ cajaMovimientoId: m.id, clase: m.clase })) }
    );
  }

  const tomadas = await tx.verificacionEfectivoEntrega.findMany({
    where: { cajaMovimientoId: { in: ids }, vigente: true },
    select: { cajaMovimientoId: true, verificacionEfectivoId: true },
    orderBy: { cajaMovimientoId: "asc" },
  });
  if (tomadas.length) {
    throw new RechazoVerificacion(
      CODIGO_VERIFICACION.ENTREGA_YA_VERIFICADA,
      "Alguna de las entregas ya está en una verificación vigente. Para volver a verificarla, primero hay que anular esa verificación.",
      409,
      { entregas: tomadas }
    );
  }

  let datos;
  try {
    datos = armarVerificacionEfectivo({
      localId,
      entregas: clasificados.map((m) => ({
        cajaMovimientoId: m.id,
        clase: m.clase,
        montoDeclarado: m.monto,
        instante: m.createdAt,
        turnoId: m.turnoId,
        operadorId: m.turno.operadorId,
      })),
      importeVerificado: pedido.importeVerificadoCentavos / 100,
      verificadaPorUsuarioId: usuarioId,
      // Ningún flujo de Finanzas valida hoy un PIN de operador: sin evidencia,
      // null. No se inventa (DEC-0012: el operador es evidencia, no permiso).
      verificadaPorOperadorId: null,
      observacion: pedido.observacion,
      idempotencyKey: pedido.idempotencyKey,
    });
  } catch (e) {
    if (e instanceof ErrorVerificacionEfectivo) {
      throw new RechazoVerificacion(CODIGO_VERIFICACION.PEDIDO_INVALIDO, e.message, 400);
    }
    throw e;
  }

  // El turno verificado queda congelado en el acto. Sin turno (cajas
  // anteriores al turno operativo): NULL, y no se le asigna uno.
  const creada = await tx.verificacionEfectivo.create({
    data: { ...datos.verificacion, ...turnoDeLaVerificacion },
    select: { id: true },
  });
  await tx.verificacionEfectivoEntrega.createMany({
    data: datos.entregas.map((e) => ({ ...e, verificacionEfectivoId: creada.id })),
  });
  const leida = await tx.verificacionEfectivo.findUnique({ where: { id: creada.id }, select: SELECT_VERIFICACION });
  return { repetida: false, verificacion: formatoDeVerificacion(leida) };
}

/**
 * Una verificación por id, para que la ruta decida el alcance con su local.
 * Sin bloquear: el local de una verificación no cambia.
 */
export async function verificacionPorId(db, id) {
  const v = await db.verificacionEfectivo.findUnique({ where: { id }, select: { id: true, localId: true } });
  if (!v) {
    throw new RechazoVerificacion(CODIGO_VERIFICACION.VERIFICACION_NO_EXISTE, "No existe esa verificación.", 404);
  }
  return v;
}

/**
 * ANULA una verificación. La única transición: VIGENTE → ANULADA, sin tocar lo
 * verificado. Repetirla es seguro: si ya estaba anulada contesta lo que quedó,
 * con `yaEstabaAnulada`, y no escribe —no pisa ni el motivo ni el autor de la
 * primera—.
 *
 * @returns {Promise<{yaEstabaAnulada:boolean, verificacion:object}>}
 */
export async function anularVerificacion(tx, { verificacionId, usuarioId, motivo, ahora = new Date() }) {
  let datos;
  try {
    datos = datosDeAnulacion({ anuladaPorUsuarioId: usuarioId, motivo, ahora });
  } catch (e) {
    if (e instanceof ErrorVerificacionEfectivo) throw new RechazoVerificacion(CODIGO_VERIFICACION.PEDIDO_INVALIDO, e.message, 400);
    throw e;
  }

  const fotos = await tx.verificacionEfectivoEntrega.findMany({
    where: { verificacionEfectivoId: verificacionId },
    select: { turnoIdSnapshot: true },
  });
  if (!fotos.length) {
    throw new RechazoVerificacion(CODIGO_VERIFICACION.VERIFICACION_NO_EXISTE, "No existe esa verificación.", 404);
  }
  // Mismo orden que verificar y corregir: los turnos primero.
  const turnoIds = [...new Set(fotos.map((f) => f.turnoIdSnapshot))].sort((a, b) => a - b);
  for (const turnoId of turnoIds) await bloquearTurno(tx, turnoId);
  await tx.$queryRaw`SELECT id FROM "VerificacionEfectivo" WHERE id = ${verificacionId} FOR UPDATE`;

  const actual = await tx.verificacionEfectivo.findUnique({ where: { id: verificacionId }, select: SELECT_VERIFICACION });
  if (actual.estado === ESTADO_VERIFICACION.ANULADA) {
    return { yaEstabaAnulada: true, verificacion: formatoDeVerificacion(actual) };
  }
  await tx.verificacionEfectivo.update({ where: { id: verificacionId }, data: datos });
  const anulada = await tx.verificacionEfectivo.findUnique({ where: { id: verificacionId }, select: SELECT_VERIFICACION });
  return { yaEstabaAnulada: false, verificacion: formatoDeVerificacion(anulada) };
}
