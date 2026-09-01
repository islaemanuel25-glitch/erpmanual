// lib/config/local.js
//
// Resolución de la configuración EFECTIVA por local con herencia al grupo.
// Fase 1 de la migración group→local: si el campo del local es null, se hereda
// el valor de ConfiguracionGrupo (mapeando cliente obligatorio al flag correcto
// según es_deposito). false es un valor real (no se hereda); solo null hereda.

import prisma from "@/lib/prisma";
import { operarioObligatorio } from "@/lib/config/acceso";

/**
 * ¿EL POS DE ESTE LOCAL LE MUESTRA EL STOCK AL CAJERO?
 *
 * Resolución canónica, en un solo lugar: `null` y `undefined` significan
 * APAGADO. No es una elección de estilo — es el default con el que la tanda
 * llega a producción, y ponerlo acá evita que cada pantalla decida el suyo.
 *
 * NO tiene fallback de grupo, igual que `exigirOperador`: es una decisión de
 * mostrador y cada local tiene la suya.
 *
 * Y es SOLO VISUAL. El descuento de stock, el tope de `stockMax` y la
 * validación del backend no miran esto.
 */
export function mostrarStockEnPos(valor) {
  return valor === true;
}

/**
 * Devuelve { allowNegativeStock, exigirClienteVenta, exigirOperador,
 * mostrarStockPos } efectivos para un local.
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
  // Sin fallback de grupo y con `null` = apagado: ver `mostrarStockEnPos`.
  const mostrarStockPos = mostrarStockEnPos(cl?.mostrarStockPos);

  return { allowNegativeStock, exigirClienteVenta, exigirOperador, mostrarStockPos };
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
