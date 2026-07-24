// lib/auditoria/contexto.js
//
// Canal de propagación del contexto del request (usuario, operador, local) hasta
// el interceptor de escrituras de Prisma (lib/auditoria/interceptor.js).
//
// No existe middleware global ni AsyncLocalStorage previo en el proyecto: el
// contexto se resuelve en helpers centrales (lib/auth.js, lib/grupos.js,
// lib/operador.js) que se invocan al inicio de cada handler. Sembramos el store
// desde ESOS helpers con `enterWith`, de forma incremental (el orden y la
// presencia de cada dimensión varían entre endpoints). El interceptor lo lee al
// momento de la escritura; si falta (script, contexto no sembrado) graba autor
// null (fail-open).

import { AsyncLocalStorage } from "node:async_hooks";

// ALS anclado en globalThis: en dev, Turbopack puede evaluar este módulo en más
// de un bundle (route handlers vs interceptor de Prisma). Sin este anclaje, el
// helper de auth sembraría en una instancia y el interceptor leería de otra
// (contexto perdido → autor null). El global garantiza UNA sola instancia.
const als = globalThis.__auditoriaALS || (globalThis.__auditoriaALS = new AsyncLocalStorage());

/**
 * Siembra/mergea el contexto de auditoría en el store del request actual.
 * Idempotente: el primer llamado crea el store (enterWith), los siguientes
 * mutan el mismo objeto. Ignora claves con valor null/undefined para no pisar
 * un dato ya resuelto con un null posterior.
 *
 * @param {{usuarioId?:number|null, operadorId?:number|null, operadorNombre?:string|null, localId?:number|null, grupoId?:number|null, esAdmin?:boolean}} parcial
 */
export function seedAuditoria(parcial) {
  if (!parcial || typeof parcial !== "object") return;
  let store = als.getStore();
  if (!store) {
    store = {};
    als.enterWith(store);
  }
  for (const [k, v] of Object.entries(parcial)) {
    if (v !== undefined && v !== null) store[k] = v;
  }
  return store;
}

/**
 * Devuelve el contexto de auditoría del request actual, o null si no fue
 * sembrado (p.ej. escrituras de scripts que usan otro PrismaClient).
 */
export function getAuditoriaCtx() {
  return als.getStore() || null;
}

/**
 * Devuelve el store crudo del request actual (donde el interceptor acumula el
 * buffer de escrituras para agrupar una acción de negocio en una sola fila).
 */
export function getStore() {
  return als.getStore() || null;
}
