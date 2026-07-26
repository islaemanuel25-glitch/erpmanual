// lib/config/local.js
//
// Resolución de la configuración EFECTIVA por local con herencia al grupo.
// Fase 1 de la migración group→local: si el campo del local es null, se hereda
// el valor de ConfiguracionGrupo (mapeando cliente obligatorio al flag correcto
// según es_deposito). false es un valor real (no se hereda); solo null hereda.

import prisma from "@/lib/prisma";
import { operarioObligatorio } from "@/lib/config/acceso";

/**
 * Devuelve { allowNegativeStock, exigirClienteVenta, exigirOperador } efectivos
 * para un local.
 * @param {number} localId
 * @param {number} grupoId
 * @param {{ esDeposito?: boolean|null }} opts
 */
export async function getConfigLocalEfectiva(localId, grupoId, { esDeposito = null } = {}) {
  const [cl, cg] = await Promise.all([
    prisma.configuracionLocal.findUnique({ where: { localId } }),
    grupoId ? prisma.configuracionGrupo.findUnique({ where: { grupoId } }) : Promise.resolve(null),
  ]);

  // es_deposito define qué flag de grupo usar en el fallback de cliente obligatorio.
  let dep = esDeposito;
  if (dep === null || dep === undefined) {
    const loc = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });
    dep = !!loc?.es_deposito;
  }

  const allowNegativeStock = cl?.allowNegativeStock ?? cg?.allowNegativeStock ?? false;
  const exigirClienteVenta =
    cl?.exigirClienteVenta ??
    (dep ? cg?.exigirClienteVentasDeposito : cg?.exigirClienteVentasLocal) ??
    false;
  // Operario obligatorio es PER LOCAL, sin fallback de grupo. Resolución canónica
  // en operarioObligatorio(): null = true (histórico); true = true; false = false.
  const exigirOperador = operarioObligatorio(cl?.exigirOperador);

  return { allowNegativeStock, exigirClienteVenta, exigirOperador };
}

/**
 * Lectura liviana del "operario obligatorio" EFECTIVO de un local, sin necesitar
 * grupoId (no hay fallback de grupo para este flag). Usada por el enforcement de
 * operario (lib/operador.js) y por /api/me.
 *
 * Fail-closed: sin localId → true (exigir operario). null en la fila → true.
 *
 * @param {number|null|undefined} localId
 * @returns {Promise<boolean>}
 */
export async function getExigirOperador(localId) {
  if (!localId) return true;
  const cl = await prisma.configuracionLocal.findUnique({
    where: { localId: Number(localId) },
    select: { exigirOperador: true },
  });
  return operarioObligatorio(cl?.exigirOperador);
}
