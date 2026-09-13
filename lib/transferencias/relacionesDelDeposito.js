// lib/transferencias/relacionesDelDeposito.js
//
// QUÉ LOCALES TIENE ENFRENTE ESTE DEPÓSITO.
//
// ── POR QUÉ ES UNA PUERTA Y NO DOS CONSULTAS PARECIDAS ────────────────────
//
// La misma lista la necesitan dos pantallas: la de configuración —para ofrecer
// una fila por relación, incluidas las que todavía no tienen acuerdo— y la lista
// de trabajo —para mostrar TODOS los locales, tengan o no movimiento en el
// período—. Escrita dos veces, el día que una gane un filtro la otra queda
// mostrando otro conjunto, y el síntoma sería de los peores: un local que
// aparece en una pantalla y no en la otra, sin nada que lo explique.
//
// Y ese defecto ya tuvo su versión: hasta el 2026-09-13 la lista de trabajo
// armaba los bloques a partir de las TRANSFERENCIAS, así que un local sin
// movimiento no existía para ella. Con cuatro locales y uno solo con envíos de
// la semana, el que abría veía un bloque y no tenía forma de saber que había
// tres más.
//
// ── QUIÉN QUEDA AFUERA, Y POR QUÉ DOS FILTROS Y NO UNO ────────────────────
//
// El depósito no se acuerda un corte consigo mismo, así que se saca. Y se saca
// por DOS caminos: por ser el local que `GrupoDeposito` señala, y por tener
// `es_deposito` en verdadero. No es redundante: son dos hechos distintos y en
// producción no coinciden —el depósito del grupo ni siquiera está en
// `GrupoLocal`—, así que quedarse con uno solo dejaría pasar a un segundo
// depósito del grupo el día que exista.

import prisma from "@/lib/prisma";

/**
 * @param {number} grupoId
 * @returns {Promise<{ deposito: {localId:number, nombre:string}|null, locales: Array<{id:number, nombre:string}> }>}
 */
export async function relacionesDelDeposito(grupoId) {
  const gd = await prisma.grupoDeposito.findFirst({
    where: { grupoId },
    select: { localId: true, local: { select: { id: true, nombre: true } } },
  });

  if (!gd) return { deposito: null, locales: [] };

  const vinculos = await prisma.grupoLocal.findMany({
    where: { grupoId },
    select: { local: { select: { id: true, nombre: true, es_deposito: true } } },
  });

  const locales = vinculos
    .map((v) => v.local)
    .filter((l) => l && l.id !== gd.localId && !l.es_deposito)
    .map((l) => ({ id: l.id, nombre: l.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return {
    deposito: { localId: gd.localId, nombre: gd.local?.nombre || "Depósito" },
    locales,
  };
}
