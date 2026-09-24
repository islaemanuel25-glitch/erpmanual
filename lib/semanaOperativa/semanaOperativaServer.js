// lib/semanaOperativa/semanaOperativaServer.js
//
// LEER Y PROGRAMAR LA SEMANA OPERATIVA, contra la base. Las reglas viven en
// `semanaOperativa.js`, que es puro; acá solo se lee, se bloquea y se escribe.
//
// ── LA ÚNICA PUERTA QUE ESCRIBE ──────────────────────────────────────────
//
// `programarSemanaOperativa`. La llaman la ruta de configuración de la ubicación
// y el PUT de "Corte de semana" de Transferencias, que desde esta tanda escribe
// acá y en ningún otro lado. `AcuerdoDepositoLocal` quedó congelado: nadie lo lee
// ni lo escribe en runtime.
//
// ── EL BLOQUEO ES LA FILA DE LA UBICACIÓN ────────────────────────────────
//
// Dos cambios simultáneos sobre la misma ubicación se serializan con
// `SELECT … FROM "Local" … FOR UPDATE` dentro de la transacción. NO con
// `pg_advisory_xact_lock(n)`: ese bloqueo usa un solo entero para cosas distintas
// —locales en las ventas, ventas en las correcciones— y un local y una venta con
// el mismo número se esperarían entre sí sin motivo.

import prisma from "@/lib/prisma";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { ORIGEN_SEMANA, diaDeVigencia, planificarCambio } from "./semanaOperativa.js";

export class ErrorSemanaOperativa extends Error {
  constructor(mensaje, status = 400, codigo = null, extra = {}) {
    super(mensaje);
    this.name = "ErrorSemanaOperativa";
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

const SELECT_VIGENCIA = { id: true, localId: true, diaDeCorte: true, vigenteDesde: true };

/**
 * Las vigencias de VARIAS ubicaciones en una sola consulta.
 *
 * @param {object} db         prisma o la transacción
 * @param {Array<number>} localIds
 * @returns {Promise<Map<number, Array>>} una entrada por cada id pedido; vacía si
 *          la ubicación no tiene semana configurada.
 */
export async function vigenciasDeUbicaciones(db, localIds = []) {
  const ids = [...new Set((localIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const porLocal = new Map(ids.map((id) => [id, []]));
  if (ids.length === 0) return porLocal;
  const filas = await (db || prisma).semanaOperativaVigencia.findMany({
    where: { localId: { in: ids } },
    select: SELECT_VIGENCIA,
  });
  for (const f of filas) porLocal.get(f.localId)?.push(f);
  return porLocal;
}

/**
 * PROGRAMA UN CAMBIO DE SEMANA —o carga la primera— para UNA ubicación.
 *
 * Tiene que correr adentro de una transacción. El alcance (que la ubicación sea
 * de quien la pide) lo resuelve el llamador antes de entrar: acá se decide la
 * regla del calendario, no quién puede.
 *
 * @param {object} tx
 * @param {object} args
 * @param {number}  args.localId
 * @param {number}  args.diaDeCorte
 * @param {number|null} args.usuarioId
 * @param {string|null} [args.desde]              día ISO; por defecto la próxima semana
 * @param {boolean} [args.reemplazarPendiente]
 * @param {string}  [args.hoy]                    solo para los candados
 */
export async function programarSemanaOperativa(
  tx,
  { localId, diaDeCorte, usuarioId = null, desde = null, reemplazarPendiente = false, hoy } = {}
) {
  const id = Number(localId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorSemanaOperativa("Falta la ubicación a la que corresponde la semana.", 400);
  }

  const bloqueada = await tx.$queryRaw`SELECT id FROM "Local" WHERE id = ${id} FOR UPDATE`;
  if (!bloqueada.length) throw new ErrorSemanaOperativa("Esa ubicación no existe.", 404);

  // "Hoy" se decide ACÁ, adentro de la transacción y después del bloqueo: un
  // pedido de las 23:59 que se confirma a las 00:00 se evalúa contra el día en
  // que se escribe, no contra el día en que salió del navegador.
  const dia = hoy || hoyArgentinaISO();

  const filas = await tx.semanaOperativaVigencia.findMany({
    where: { localId: id },
    select: SELECT_VIGENCIA,
  });
  const plan = planificarCambio({
    vigencias: filas,
    diaDeCorte,
    desde,
    hoy: dia,
    reemplazarPendiente,
  });
  if (!plan.ok) {
    throw new ErrorSemanaOperativa(plan.mensaje, plan.status, plan.codigo, {
      proximaFrontera: plan.proximaFrontera ?? null,
    });
  }

  // Solo se borra lo que TODAVÍA NO EMPEZÓ. Una vigencia que ya rige es historia.
  const pendientes = filas.filter((f) => {
    const d = diaDeVigencia(f.vigenteDesde);
    return d !== null && d > dia;
  });
  if (plan.reemplaza && pendientes.length > 0) {
    await tx.semanaOperativaVigencia.deleteMany({ where: { id: { in: pendientes.map((f) => f.id) } } });
  }

  const creada = await tx.semanaOperativaVigencia.create({
    data: {
      localId: id,
      diaDeCorte: Number(diaDeCorte),
      vigenteDesde: plan.desde ? new Date(`${plan.desde}T00:00:00.000Z`) : null,
      origen: ORIGEN_SEMANA.MANUAL,
      creadoPorId: usuarioId ?? null,
    },
    select: SELECT_VIGENCIA,
  });

  return {
    accion: plan.accion,
    desde: plan.desde,
    reemplazo: Boolean(plan.reemplaza && pendientes.length > 0),
    transicion: plan.transicion,
    vigencia: creada,
  };
}
