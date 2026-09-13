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
    // `activo` NO es opcional en este select. Sin la columna llega `undefined`,
    // y `puedeRecibirTransferencias` —que exige `=== true`— dejaría la lista de
    // destinos vacía. Falla ruidoso a propósito, pero la forma de no pagarlo es
    // pedir la columna.
    select: {
      local: { select: { id: true, nombre: true, es_deposito: true, activo: true } },
    },
  });

  // ── LA LISTA VIENE COMPLETA, CON EL `activo` DE CADA UNO ─────────────────
  //
  // Y no filtrada por activo acá, a propósito: las dos pantallas necesitan el
  // mismo conjunto pero NO la misma regla.
  //
  //   · crear transferencia ofrece solo los que pueden recibir — ni los
  //     depósitos ni los dados de baja;
  //   · la lista de trabajo muestra a todos los que operan, y además a un local
  //     DADO DE BAJA que tuvo movimiento en el período, porque se le debe plata
  //     y esconderlo sería perder una cuenta a cobrar.
  //
  // Devolver la lista ya filtrada obligaría a la lista de trabajo a hacer una
  // segunda consulta para encontrar a los de baja, que es justo la segunda
  // puerta que esto vino a evitar. El criterio de destino vive aparte, en
  // `destinosDeTransferencia.js`, y se aplica donde corresponde.
  const candidatos = vinculos
    .map((v) => v.local)
    .filter((l) => l && l.id !== gd.localId && !l.es_deposito);

  // ── EL VÍNCULO CON UN CLIENTE ES LO QUE DICE QUE ESE LOCAL OPERA ─────────
  //
  // `Cliente.localVinculadoId` es el dato que decide si un local opera por
  // TRANSFERENCIA o si simplemente se le vende. No está en el modelo `Local`
  // —se buscó ahí y no está—, y es el mismo vínculo que consulta
  // `/api/pos-ventas/crear` para decidir si una venta del depósito genera su
  // remito. Por eso se resuelve acá, al lado de los locales: si cada pantalla
  // lo fuera a buscar por su cuenta, una podría mirar el vínculo y otra no.
  //
  // UNA sola consulta para todos los locales, no una por local: son pocos hoy y
  // podrían no serlo mañana, y un N+1 escondido en una puerta se paga en todas
  // las pantallas que la usen.
  //
  // NO se exige que el CLIENTE esté activo, solo que el vínculo exista. Es una
  // regla menos inventada: desactivar la ficha de un cliente no es decir que ese
  // local dejó de operar por transferencia, y para eso está `Local.activo`.
  const conVinculo = new Set(
    (
      await prisma.cliente.findMany({
        where: { grupoId, localVinculadoId: { in: candidatos.map((l) => l.id) } },
        select: { localVinculadoId: true },
      })
    ).map((c) => c.localVinculadoId)
  );

  const locales = candidatos
    .map((l) => ({
      id: l.id,
      nombre: l.nombre,
      activo: l.activo === true,
      tieneClienteVinculado: conVinculo.has(l.id),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return {
    deposito: { localId: gd.localId, nombre: gd.local?.nombre || "Depósito" },
    locales,
  };
}
