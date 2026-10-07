// lib/integraciones/azul-chat/miAlcance.js
//
// LA CAPACIDAD `mi_alcance`: QUIÉN ES LA PERSONA Y QUÉ LOCALES PUEDE CONSULTAR HOY.
//
// Sirve para que Azul Chat arme y refresque su interfaz —qué locales mostrar,
// con qué nombre— después de canjear un código y cada vez que quiera. NO
// reemplaza la autorización de ninguna capacidad: si Azul Chat guarda esta lista
// y mañana a la persona le sacan un local, `ventas_resumen` de ese local falla
// en la próxima pregunta, porque la puerta vuelve a mirar el alcance, y la
// próxima `mi_alcance` ya no lo trae.
//
// ── DE DÓNDE SALE CADA LOCAL ───────────────────────────────────────────────
//
// De la MISMA regla que usa la puerta (`alcanceTerritorial` y `localEnAlcance`,
// en autorizacion.js), aplicada a la persona y al rol leídos AHORA. No se
// recibe ningún local ni grupo del cuerpo: el cuerpo de esta capacidad no
// puede traer `alcance`.
//
//   · LOCAL (sin `*`, con local fijo): ese local.
//   · GRUPO (con `*` y local fijo): los locales y depósitos del grupo de ese local.
//   · GLOBAL (con `*` y sin local fijo): todo local o depósito que tenga grupo.
//   · NINGUNO: ninguno.
//
// Cada candidato pasa además por `grupoDeLocal` —la `getGrupoIdDeLocal` del
// ERP, la misma que usa la puerta— y por `localEnAlcance`. Así el `grupoId` que
// se informa es exactamente el que la puerta va a aceptar en `ventas_resumen`,
// también para un depósito que esté en más de un grupo, y un local sin grupo
// no aparece porque la puerta tampoco lo dejaría consultar.
//
// ── LAS CAPACIDADES DE CADA LOCAL ──────────────────────────────────────────
//
// Cada local trae `capacidades`: las capacidades SOBRE UN LOCAL que la persona
// puede usar hoy ahí (p. ej. `transferencias_eventos` si tiene
// `transferencias.ver`). Esta capacidad NO las calcula: llegan decididas en la
// autorización (`autorizacion.capacidadesSobreUnLocal`), que recorre el
// catálogo con la misma regla de permiso de la puerta. Por eso acá no se mira
// ningún permiso ni rol, igual que no se mira el alcance.
//
// Son un ANUNCIO para armar la interfaz. Consultar sigue pasando por la puerta,
// que vuelve a decidir todo en el momento. Si la autorización no las trajera,
// se anuncia ninguna: callarse es seguro, inventar no.
//
// El campo es nuevo y se agregó sin tocar los demás: un consumidor que no lo
// conoce sigue leyendo lo mismo, y la versión del contrato sigue siendo 1.
//
// ── LO QUE NO DEVUELVE, A PROPÓSITO ────────────────────────────────────────
//
// Ni el rol, ni los permisos, ni el email, ni nada del local más allá de su
// nombre, si es depósito y si está activo. Un local inactivo se informa con su
// marca, igual que `ventas_resumen` lo advierte: la puerta no lo excluye, así
// que esconderlo acá sería mostrar menos de lo que se puede consultar.
//
// Solo lectura: `findUnique` y `findMany`, nada más.

import { esIdValido, localEnAlcance } from "./autorizacion.js";

export const VERSION_CONTRATO = 1;

/** Los localIds candidatos de un alcance, antes de pasar por la regla. */
async function candidatos(alcance, { db, localIdsDeGrupo }) {
  switch (alcance.modo) {
    case "LOCAL":
      return [alcance.localId];
    case "GRUPO":
      return localIdsDeGrupo(alcance.grupoId);
    case "GLOBAL": {
      const [locales, depositos] = await Promise.all([
        db.grupoLocal.findMany({ select: { localId: true } }),
        db.grupoDeposito.findMany({ select: { localId: true } }),
      ]);
      return [...locales, ...depositos].map((f) => f.localId);
    }
    default:
      return [];
  }
}

/**
 * La respuesta, armada sobre filas ya leídas. Pura.
 *
 * @param {{usuario:{id:number, nombre:string}, alcance:object, locales:Array<{id:number, nombre:string, es_deposito:boolean, activo:boolean}>, grupoDe:Map<number, number>, capacidades?:readonly string[]}} args
 *   `capacidades`: las que la autorización decidió para cualquier local del alcance; si falta, ninguna.
 */
export function armarMiAlcance({ usuario, alcance, locales, grupoDe, capacidades = [] }) {
  return {
    capacidad: "mi_alcance",
    version: VERSION_CONTRATO,
    usuario: { id: usuario.id, nombre: usuario.nombre },
    alcance: alcance.modo === "GRUPO" ? { modo: "GRUPO", grupoId: alcance.grupoId } : { modo: alcance.modo },
    locales: locales
      .map((l) => ({
        id: l.id,
        nombre: l.nombre,
        grupoId: grupoDe.get(l.id),
        esDeposito: l.es_deposito === true,
        activo: l.activo === true,
        capacidades: [...capacidades],
      }))
      .sort((a, b) => a.grupoId - b.grupoId || a.nombre.localeCompare(b.nombre, "es") || a.id - b.id),
  };
}

/**
 * Ejecuta la capacidad para una autorización ya concedida.
 *
 * @param {{usuarioId:number, alcance:object, capacidadesSobreUnLocal?:readonly string[]}} autorizacion la de la puerta: el alcance y las capacidades ya se decidieron con el rol de AHORA.
 * @param {object} _parametros `mi_alcance` no acepta ninguno; la puerta ya lo exigió.
 * @param {{db:object, grupoDeLocal:(id:number)=>Promise<number|null>, localIdsDeGrupo:(id:number)=>Promise<number[]>}} deps
 */
export async function miAlcance(autorizacion, _parametros, { db, grupoDeLocal, localIdsDeGrupo }) {
  const usuario = await db.usuario.findUnique({ where: { id: autorizacion.usuarioId }, select: { id: true, nombre: true } });
  if (!usuario) {
    return { ok: false, status: 403, codigo: "USUARIO_INEXISTENTE", error: "La persona delegante no existe en el ERP." };
  }

  const grupoDe = new Map();
  for (const localId of new Set(await candidatos(autorizacion.alcance, { db, localIdsDeGrupo }))) {
    const grupoId = await grupoDeLocal(localId);
    if (esIdValido(grupoId) && localEnAlcance(autorizacion.alcance, localId, grupoId)) grupoDe.set(localId, grupoId);
  }

  const locales = grupoDe.size
    ? await db.local.findMany({
        where: { id: { in: [...grupoDe.keys()] } },
        select: { id: true, nombre: true, es_deposito: true, activo: true },
      })
    : [];

  return {
    ok: true,
    datos: armarMiAlcance({
      usuario,
      alcance: autorizacion.alcance,
      locales,
      grupoDe,
      capacidades: autorizacion.capacidadesSobreUnLocal ?? [],
    }),
  };
}
