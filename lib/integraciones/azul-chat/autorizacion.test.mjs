// Candados de la autorización de Azul Chat: el humano delegante, HOY.
//
// Los usuarios tienen la forma EXACTA que devuelve `cargadorErp.usuario` —el
// `select` de `servidor.js`—: id, activo, localId y rol.permisos. La misma
// decisión contra filas reales de PostgreSQL la ejerce
// `scripts/pruebas-db/azulChatVentasResumen.mjs`.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/autorizacion.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { decidirAutorizacion, autorizarIntegracion, esIdValido } from "./autorizacion.js";
import { DEFAULT_PERMISOS_SISTEMA, ENCARGADO, CAJERO } from "../../rbac/systemRoles.js";

// Grupo 1: locales 10 y 11. Grupo 2: local 20.
const GRUPO_DE = { 10: 1, 11: 1, 20: 2 };
const usuario = (extra = {}) => ({ id: 7, activo: true, localId: 10, rol: { permisos: ["reportes.ver"] }, ...extra });
const pedido = (extra = {}) => ({ usuarioId: 7, capacidad: "ventas_resumen", grupoId: 1, localId: 10, ...extra });
const decidir = (p = pedido(), u = usuario()) =>
  decidirAutorizacion({
    pedido: p,
    usuario: u,
    grupoDelLocal: GRUPO_DE[p.localId] ?? null,
    grupoDelLocalDelUsuario: u?.localId ? GRUPO_DE[u.localId] ?? null : null,
  });

test("un usuario activo con reportes.ver consulta su local", () => {
  const r = decidir();
  assert.equal(r.ok, true);
  assert.deepEqual({ ...r.autorizacion }, { usuarioId: 7, capacidad: "ventas_resumen", grupoId: 1, localId: 10 });
  assert.ok(Object.isFrozen(r.autorizacion));
});

test("el ENCARGADO real puede; el CAJERO real no tiene reportes.ver y no puede", () => {
  assert.equal(decidir(pedido(), usuario({ rol: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } })).ok, true);
  // Si mañana el CAJERO recibe reportes.ver, esto se pone rojo y avisa que la
  // integración empieza a mostrarle ventas: es una decisión, no un detalle.
  const cajero = DEFAULT_PERMISOS_SISTEMA[CAJERO];
  assert.equal(cajero.includes("reportes.ver"), false);
  assert.equal(decidir(pedido(), usuario({ rol: { permisos: cajero } })).codigo, "SIN_PERMISO");
});

test("7. usuario sin el permiso de la capacidad: SIN_PERMISO", () => {
  const r = decidir(pedido(), usuario({ rol: { permisos: ["pos.usar"] } }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.codigo, "SIN_PERMISO");
});

test("7b. permisos corruptos en el rol: sin permisos, nunca comodín", () => {
  for (const permisos of [null, "*", { 0: "*" }, undefined]) {
    assert.equal(decidir(pedido(), usuario({ rol: { permisos } })).codigo, "SIN_PERMISO", JSON.stringify(permisos));
  }
  assert.equal(decidir(pedido(), usuario({ rol: null })).codigo, "SIN_PERMISO");
});

test("8. usuario inactivo: USUARIO_INACTIVO, aunque sea admin", () => {
  assert.equal(decidir(pedido(), usuario({ activo: false })).codigo, "USUARIO_INACTIVO");
  assert.equal(decidir(pedido(), usuario({ activo: false, rol: { permisos: ["*"] } })).codigo, "USUARIO_INACTIVO");
  // `activo` tiene que ser `true`, no algo que parezca verdadero.
  assert.equal(decidir(pedido(), usuario({ activo: "true" })).codigo, "USUARIO_INACTIVO");
});

test("8b. usuario que no existe, o una fila de otro usuario: USUARIO_INEXISTENTE", () => {
  assert.equal(decidir(pedido(), null).codigo, "USUARIO_INEXISTENTE");
  assert.equal(decidir(pedido(), usuario({ id: 8 })).codigo, "USUARIO_INEXISTENTE");
});

test("9. local fuera de alcance: otro local del grupo, u otro grupo", () => {
  assert.equal(decidir(pedido({ localId: 11 })).codigo, "FUERA_DE_ALCANCE");
  assert.equal(decidir(pedido({ localId: 20, grupoId: 2 })).codigo, "FUERA_DE_ALCANCE");
});

test("9b. sin local fijo y sin comodín no hay alcance", () => {
  assert.equal(decidir(pedido(), usuario({ localId: null })).codigo, "FUERA_DE_ALCANCE");
});

test("9c. admin con local fijo: su grupo sí, otro grupo no", () => {
  const admin = usuario({ rol: { permisos: ["*"] } });
  assert.equal(decidir(pedido({ localId: 11 }), admin).ok, true);
  assert.equal(decidir(pedido({ localId: 20, grupoId: 2 }), admin).codigo, "FUERA_DE_ALCANCE");
});

test("9d. admin sin local fijo: cualquier local, con su grupo real (lo mismo que grupo-activo/set)", () => {
  const admin = usuario({ localId: null, rol: { permisos: ["*"] } });
  assert.equal(decidir(pedido({ localId: 20, grupoId: 2 }), admin).ok, true);
});

test("10. grupo manipulado: el local no es de ese grupo", () => {
  const r = decidir(pedido({ grupoId: 2 }));
  assert.equal(r.codigo, "GRUPO_LOCAL_INCONSISTENTE");
  // Ni siquiera un admin sin local fijo puede mandar un par inconsistente.
  const admin = usuario({ localId: null, rol: { permisos: ["*"] } });
  assert.equal(decidir(pedido({ grupoId: 2 }), admin).codigo, "GRUPO_LOCAL_INCONSISTENTE");
});

test("10b. local que no existe o no tiene grupo: LOCAL_SIN_GRUPO", () => {
  const admin = usuario({ localId: null, rol: { permisos: ["*"] } });
  assert.equal(decidir(pedido({ localId: 999 }), admin).codigo, "LOCAL_SIN_GRUPO");
});

test("10c. ids que no son enteros positivos se rechazan antes de mirar la base", () => {
  for (const malo of ["10", 10.5, 0, -1, null, undefined, NaN, Infinity, "1 OR 1=1", { gt: 0 }]) {
    assert.equal(esIdValido(malo), false, String(malo));
    assert.equal(decidir(pedido({ localId: malo })).codigo, "PEDIDO_INVALIDO", String(malo));
    assert.equal(decidir(pedido({ usuarioId: malo })).codigo, "PEDIDO_INVALIDO", String(malo));
  }
});

test("11. capacidad fuera del catálogo: rechazada, aunque el usuario sea admin", () => {
  const admin = usuario({ localId: null, rol: { permisos: ["*"] } });
  for (const capacidad of ["ejecutar_endpoint", "sql", "prisma", "__proto__", "constructor", "ventas_resumen ", "", null]) {
    const r = decidir(pedido({ capacidad }), admin);
    assert.equal(r.codigo, "CAPACIDAD_FUERA_DE_CATALOGO", String(capacidad));
  }
});

test("autorizarIntegracion no consulta la base con un pedido inválido", async () => {
  let consultas = 0;
  const cargador = { usuario: async () => (consultas++, usuario()), grupoDeLocal: async () => (consultas++, 1) };
  const r = await autorizarIntegracion(pedido({ capacidad: "sql" }), cargador);
  assert.equal(r.codigo, "CAPACIDAD_FUERA_DE_CATALOGO");
  assert.equal(consultas, 0);
});

test("autorizarIntegracion lee el usuario y los grupos de la base, no del pedido", async () => {
  const pedidos = [];
  const cargador = {
    usuario: async (id) => (pedidos.push(["usuario", id]), usuario()),
    grupoDeLocal: async (id) => (pedidos.push(["grupo", id]), GRUPO_DE[id] ?? null),
  };
  const r = await autorizarIntegracion(pedido(), cargador);
  assert.equal(r.ok, true);
  assert.deepEqual(pedidos, [["usuario", 7], ["grupo", 10], ["grupo", 10]]);
});
