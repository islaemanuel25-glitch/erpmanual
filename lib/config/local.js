// lib/config/local.js
//
// Resolución de la configuración EFECTIVA por local con herencia al grupo.
// Fase 1 de la migración group→local: si el campo del local es null, se hereda
// el valor de ConfiguracionGrupo (mapeando cliente obligatorio al flag correcto
// según es_deposito). false es un valor real (no se hereda); solo null hereda.

import prisma from "@/lib/prisma";

/**
 * Devuelve { allowNegativeStock, exigirClienteVenta } efectivos para un local.
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

  return { allowNegativeStock, exigirClienteVenta };
}
