// Candados de la capacidad `mi_alcance`.
//
// La base de mentira devuelve filas con la forma EXACTA de los `select` de
// miAlcance.js —usuario {id, nombre}, grupoLocal/grupoDeposito {localId}, local
// {id, nombre, es_deposito, activo}— y NO tiene ningún método de escritura: si
// la capacidad intentara escribir, explotaría. Contra PostgreSQL, con usuarios,
// roles y grupos reales y el alcance cambiado en vivo, la ejerce
// `scripts/pruebas-db/azulChatVentasResumen.mjs` (sección J).
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/miAlcance.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { miAlcance } from "./miAlcance.js";
import { alcanceTerritorial } from "./autorizacion.js";

// Grupo 1: locales 10 y 11 y el depósito 50. Grupo 2: local 20, y el depósito
// 50 TAMBIÉN (un depósito puede estar en dos grupos). El local 30 no tiene grupo.
const GRUPO_LOCAL = [{ localId: 10, grupoId: 1 }, { localId: 11, grupoId: 1 }, { localId: 20, grupoId: 2 }];
const GRUPO_DEPOSITO = [{ localId: 50, grupoId: 1 }, { localId: 50, grupoId: 2 }];
const LOCALES = {
  10: { id: 10, nombre: "Casiano", es_deposito: false, activo: true },
  11: { id: 11, nombre: "Belgrano", es_deposito: false, activo: false },
  20: { id: 20, nombre: "Centro", es_deposito: false, activo: true },
  30: { id: 30, nombre: "Sin grupo", es_deposito: false, activo: true },
  50: { id: 50, nombre: "Depósito", es_deposito: true, activo: true },
};

/** `getGrupoIdDeLocal`: primero GrupoLocal, después el PRIMER GrupoDeposito. */
const grupoDeLocal = async (id) => GRUPO_LOCAL.find((g) => g.localId === id)?.grupoId ?? GRUPO_DEPOSITO.find((g) => g.localId === id)?.grupoId ?? null;
/** `getLocalIdsDeGrupo`: locales y depósitos del grupo. */
const localIdsDeGrupo = async (gid) => [...GRUPO_LOCAL, ...GRUPO_DEPOSITO].filter((g) => g.grupoId === gid).map((g) => g.localId);

function dbDeMentira() {
  const lecturas = [];
  const db = {
    usuario: { findUnique: async (a) => (lecturas.push(["usuario", a]), a.where.id === 7 ? { id: 7, nombre: "Emanuel" } : null) },
    grupoLocal: { findMany: async (a) => (lecturas.push(["grupoLocal", a]), GRUPO_LOCAL.map((g) => ({ localId: g.localId }))) },
    grupoDeposito: { findMany: async (a) => (lecturas.push(["grupoDeposito", a]), GRUPO_DEPOSITO.map((g) => ({ localId: g.localId }))) },
    local: { findMany: async (a) => (lecturas.push(["local", a]), a.where.id.in.map((id) => LOCALES[id]).filter(Boolean)) },
  };
  return { db, lecturas };
}
// La autorización de `mi_alcance` trae SIEMPRE `capacidadesSobreUnLocal`: la
// pone `decidirAutorizacion` porque el catálogo marca `anunciaCapacidades`. Por
// defecto, las de un ENCARGADO real (reportes.ver y transferencias.ver).
const DEL_ENCARGADO = Object.freeze(["ventas_resumen", "transferencias_eventos"]);
const correr = (alcance, extra = {}) => {
  const { db, lecturas } = dbDeMentira();
  const autorizacion = Object.freeze({
    usuarioId: 7, capacidad: "mi_alcance", vinculoId: 3, delegacionId: 5, alcance: Object.freeze(alcance),
    capacidadesSobreUnLocal: DEL_ENCARGADO, ...extra,
  });
  return miAlcance(autorizacion, {}, { db, grupoDeLocal, localIdsDeGrupo }).then((r) => ({ ...r, lecturas }));
};
const ids = (r) => r.datos.locales.map((l) => l.id);

test("20. LOCAL: solo su local fijo, con el grupo que la puerta va a aceptar", async () => {
  const r = await correr({ modo: "LOCAL", localId: 10 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos, {
    capacidad: "mi_alcance",
    version: 1,
    usuario: { id: 7, nombre: "Emanuel" },
    alcance: { modo: "LOCAL" },
    locales: [{ id: 10, nombre: "Casiano", grupoId: 1, esDeposito: false, activo: true, capacidades: ["ventas_resumen", "transferencias_eventos"] }],
  });
});

test("LOCAL sobre un local sin grupo: nada, porque la puerta tampoco lo dejaría consultar", async () => {
  assert.deepEqual(ids(await correr({ modo: "LOCAL", localId: 30 })), []);
});

test("GRUPO: los locales y el depósito de su grupo; el inactivo aparece marcado", async () => {
  const r = await correr({ modo: "GRUPO", grupoId: 1 });
  assert.deepEqual(r.datos.alcance, { modo: "GRUPO", grupoId: 1 });
  assert.deepEqual(r.datos.locales.map((l) => [l.id, l.grupoId, l.esDeposito, l.activo]), [
    [11, 1, false, false],
    [10, 1, false, true],
    [50, 1, true, true],
  ]);
});

test("GRUPO 2: el depósito compartido NO aparece, porque su grupo real (el primero) es el 1", async () => {
  // Es lo que hace la puerta: getGrupoIdDeLocal(50) = 1, y 1 ≠ 2. Listarlo
  // acá sería prometer un local que ventas_resumen va a rechazar.
  assert.deepEqual(ids(await correr({ modo: "GRUPO", grupoId: 2 })), [20]);
});

test("21. GLOBAL: todo local o depósito que tenga grupo, una vez cada uno, con su grupo real", async () => {
  const r = await correr({ modo: "GLOBAL" });
  assert.deepEqual(r.datos.alcance, { modo: "GLOBAL" });
  assert.deepEqual(r.datos.locales.map((l) => [l.id, l.grupoId]), [[11, 1], [10, 1], [50, 1], [20, 2]]);
  assert.ok(!ids(r).includes(30), "el local sin grupo no aparece");
});

test("NINGUNO, o un modo desconocido: ninguno, y no se lee ni un local", async () => {
  for (const alcance of [{ modo: "NINGUNO" }, { modo: "TODO" }]) {
    const r = await correr(alcance);
    assert.deepEqual(r.datos.locales, []);
    assert.ok(!r.lecturas.some(([m]) => m === "local"), JSON.stringify(alcance));
  }
});

test("el alcance sale de la autorización: un localId que viniera en la autorización no amplía nada", async () => {
  const r = await correr({ modo: "LOCAL", localId: 10 }, { localId: 20, grupoId: 2 });
  assert.deepEqual(ids(r), [10]);
});

test("22. no ejecuta consulta comercial y 23. no escribe: solo lee usuario, grupos y locales", async () => {
  const r = await correr({ modo: "GLOBAL" });
  assert.deepEqual([...new Set(r.lecturas.map(([m]) => m))].sort(), ["grupoDeposito", "grupoLocal", "local", "usuario"]);
  // La base de mentira no tiene `venta`, ni `create`, ni `update`: si se usaran, habría explotado.
});

test("la respuesta no trae rol, permisos, email ni nada del local que no haga falta", async () => {
  const r = await correr({ modo: "GLOBAL" });
  const texto = JSON.stringify(r.datos);
  for (const fuga of ["permisos", "rol", "email", "password", "direccion", "cuil", "telefono", "\"*\""]) assert.ok(!texto.includes(fuga), fuga);
  // `capacidades` es el único campo nuevo (Tanda 1B), al final: los de antes, en su orden.
  for (const l of r.datos.locales) assert.deepEqual(Object.keys(l), ["id", "nombre", "grupoId", "esDeposito", "activo", "capacidades"]);
  assert.deepEqual(Object.keys(r.datos.usuario), ["id", "nombre"]);
});

test("L. compatible con quien ya consume mi_alcance: los campos de antes, iguales; capacidades es el único agregado", async () => {
  const r = await correr({ modo: "GLOBAL" });
  assert.equal(r.datos.version, 1, "un campo agregado no cambia la versión");
  assert.deepEqual(Object.keys(r.datos), ["capacidad", "version", "usuario", "alcance", "locales"]);
  // Lo que un consumidor viejo lee de cada local, sin el campo nuevo, es lo de antes.
  const sinElNuevo = r.datos.locales.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== "capacidades")));
  assert.deepEqual(sinElNuevo, [
    { id: 11, nombre: "Belgrano", grupoId: 1, esDeposito: false, activo: false },
    { id: 10, nombre: "Casiano", grupoId: 1, esDeposito: false, activo: true },
    { id: 50, nombre: "Depósito", grupoId: 1, esDeposito: true, activo: true },
    { id: 20, nombre: "Centro", grupoId: 2, esDeposito: false, activo: true },
  ]);
});

test("las capacidades de cada local son las que decidió la autorización, una copia por local; si no llegan, ninguna", async () => {
  const r = await correr({ modo: "GRUPO", grupoId: 1 }, { capacidadesSobreUnLocal: Object.freeze(["transferencias_eventos"]) });
  for (const l of r.datos.locales) assert.deepEqual(l.capacidades, ["transferencias_eventos"], l.nombre);
  assert.notEqual(r.datos.locales[0].capacidades, r.datos.locales[1].capacidades, "cada local lleva su propia lista");
  const sinPermisos = await correr({ modo: "LOCAL", localId: 10 }, { capacidadesSobreUnLocal: Object.freeze([]) });
  assert.deepEqual(sinPermisos.datos.locales.map((l) => [l.id, l.capacidades]), [[10, []]], "B: ve el local, sin capacidades");
  // Callarse es seguro: una autorización sin el campo no anuncia nada.
  const sinCampo = await miAlcance({ usuarioId: 7, alcance: { modo: "LOCAL", localId: 10 } }, {}, { db: dbDeMentira().db, grupoDeLocal, localIdsDeGrupo });
  assert.deepEqual(sinCampo.datos.locales[0].capacidades, []);
});

test("usuario que ya no existe: rechazo, sin lista", async () => {
  const { db } = dbDeMentira();
  const r = await miAlcance({ usuarioId: 99, alcance: { modo: "GLOBAL" } }, {}, { db, grupoDeLocal, localIdsDeGrupo });
  assert.deepEqual([r.ok, r.codigo], [false, "USUARIO_INEXISTENTE"]);
});

test("19. el alcance cambia con el rol y el local de HOY: la misma persona, dos días distintos", async () => {
  // Lo que decide el modo es `alcanceTerritorial` con el usuario recién leído;
  // si le cambian el local fijo o le sacan el comodín, cambia la lista.
  const ayer = alcanceTerritorial({ esAdmin: true, localFijo: null, grupoDelLocalDelUsuario: null });
  const hoy = alcanceTerritorial({ esAdmin: false, localFijo: 20, grupoDelLocalDelUsuario: 2 });
  assert.equal(ids(await correr(ayer)).length, 4);
  assert.deepEqual(ids(await correr(hoy)), [20]);
});
