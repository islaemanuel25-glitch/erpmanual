// Candados de la autorización de Azul Chat: en nombre de quién, y el humano
// delegante HOY.
//
// Las filas tienen la forma EXACTA que devuelve el cargador de `servidor.js`:
//   · `cargadorErp.usuario`    → id, activo, localId y rol.permisos;
//   · `cargadorErp.delegacion` → id y vinculo { id, usuarioId, aplicacion, revocadoEn }.
// La misma decisión contra filas reales de PostgreSQL la ejerce
// `scripts/pruebas-db/azulChatVentasResumen.mjs`.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/autorizacion.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decidirAutorizacion,
  autorizarIntegracion,
  esIdValido,
  alcanceTerritorial,
  localEnAlcance,
  capacidadesSobreUnLocal,
} from "./autorizacion.js";
import { CAPACIDADES } from "./capacidades.js";
import { generarTokenDelegacion, hashTokenDelegacion, generarCodigoVinculo } from "../vinculos/codigoVinculo.js";
import { DEFAULT_PERMISOS_SISTEMA, ENCARGADO, CAJERO, DUENO_LOCAL } from "../../rbac/systemRoles.js";

// Grupo 1: locales 10 y 11. Grupo 2: local 20.
const GRUPO_DE = { 10: 1, 11: 1, 20: 2 };
const TOKEN = generarTokenDelegacion();
const usuario = (extra = {}) => ({ id: 7, activo: true, localId: 10, rol: { permisos: ["reportes.ver"] }, ...extra });
const pedido = (extra = {}) => ({ token: TOKEN, capacidad: "ventas_resumen", grupoId: 1, localId: 10, ...extra });
const pedidoAlcance = (extra = {}) => ({ token: TOKEN, capacidad: "mi_alcance", ...extra });
// La delegación vigente, de Azul Chat, del usuario 7. Los candados de abajo la
// traen válida para LLEGAR a lo que afirman —permiso, actividad, alcance—; los
// de la delegación misma están en su sección.
const delegacion = (vinculo = {}) => ({ id: 5, vinculo: { id: 3, usuarioId: 7, aplicacion: "AZUL_CHAT", revocadoEn: null, ...vinculo } });
const decidir = (p = pedido(), u = usuario(), d = delegacion()) =>
  decidirAutorizacion({
    pedido: p,
    aplicacionVinculo: "AZUL_CHAT",
    delegacion: d,
    usuario: u,
    grupoDelLocal: GRUPO_DE[p.localId] ?? null,
    grupoDelLocalDelUsuario: u?.localId ? GRUPO_DE[u.localId] ?? null : null,
  });

test("un usuario activo con reportes.ver consulta su local", () => {
  const r = decidir();
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(r.autorizacion)), {
    usuarioId: 7, capacidad: "ventas_resumen", vinculoId: 3, delegacionId: 5,
    alcance: { modo: "LOCAL", localId: 10 }, grupoId: 1, localId: 10,
  });
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

test("8b. usuario que no existe, o una fila que no es la del dueño del token: USUARIO_INEXISTENTE", () => {
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
    assert.equal(decidir(pedido({ grupoId: malo })).codigo, "PEDIDO_INVALIDO", String(malo));
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
  const cargador = {
    delegacion: async () => (consultas++, delegacion()),
    usuario: async () => (consultas++, usuario()),
    grupoDeLocal: async () => (consultas++, 1),
  };
  const r = await autorizarIntegracion(pedido({ capacidad: "sql" }), cargador, { aplicacionVinculo: "AZUL_CHAT" });
  assert.equal(r.codigo, "CAPACIDAD_FUERA_DE_CATALOGO");
  assert.equal(consultas, 0);
});

test("autorizarIntegracion lee la delegación, el usuario y los grupos de la base, no del pedido", async () => {
  const pedidos = [];
  const cargador = {
    delegacion: async (hash) => (pedidos.push(["delegacion", hash]), delegacion()),
    usuario: async (id) => (pedidos.push(["usuario", id]), usuario()),
    grupoDeLocal: async (id) => (pedidos.push(["grupo", id]), GRUPO_DE[id] ?? null),
  };
  const r = await autorizarIntegracion(pedido(), cargador, { aplicacionVinculo: "AZUL_CHAT" });
  assert.equal(r.ok, true);
  // El token se busca por su hash: lo que viaja a la base nunca es el token. Y
  // el usuario que se lee es el del VÍNCULO, no uno que diga el pedido.
  assert.deepEqual(pedidos, [["delegacion", hashTokenDelegacion(TOKEN)], ["usuario", 7], ["grupo", 10], ["grupo", 10]]);
});

// ── La delegación ──────────────────────────────────────────────────────────

const cargadorCon = (d, registro = []) => ({
  delegacion: async (hash) => (registro.push("delegacion"), hash === hashTokenDelegacion(TOKEN) ? d : null),
  usuario: async (id) => (registro.push(`usuario:${id}`), usuario({ id })),
  grupoDeLocal: async (id) => (registro.push("grupo"), GRUPO_DE[id] ?? null),
});
const autorizar = (p, d, registro) => autorizarIntegracion(p, cargadorCon(d, registro), { aplicacionVinculo: "AZUL_CHAT" });

test("V1. token que no existe: rechazado, y ni se lee el usuario", async () => {
  const registro = [];
  const r = await autorizar(pedido(), null, registro);
  assert.deepEqual([r.status, r.codigo], [403, "DELEGACION_INEXISTENTE"]);
  assert.deepEqual(registro, ["delegacion"]);
});

test("V1b. sin token, o con un token de otra forma —incluido el código humano—: rechazado sin consultar", async () => {
  for (const malo of [undefined, null, "", "del1_corto", 12345, TOKEN + "x", TOKEN.replace("del1_", "del2_"), hashTokenDelegacion(TOKEN), generarCodigoVinculo()]) {
    const registro = [];
    const r = await autorizar(pedido({ token: malo }), delegacion(), registro);
    assert.equal(r.codigo, "DELEGACION_INEXISTENTE", String(malo));
    assert.deepEqual(registro, [], String(malo));
  }
});

test("V2. con una delegación vigente sigue a la autorización de siempre", async () => {
  const registro = [];
  const r = await autorizar(pedido(), delegacion(), registro);
  assert.equal(r.ok, true);
  assert.deepEqual(registro, ["delegacion", "usuario:7", "grupo", "grupo"]);
});

test("V3. vínculo revocado —por la persona, por quien la gestiona o por reautorizar—: la delegación no autentica", async () => {
  const r = await autorizar(pedido(), delegacion({ revocadoEn: new Date("2026-10-06T10:00:00Z") }));
  assert.deepEqual([r.status, r.codigo], [403, "VINCULO_REVOCADO"]);
});

test("V4. delegado pero inactivo: rechazado", () => {
  assert.equal(decidir(pedido(), usuario({ activo: false })).codigo, "USUARIO_INACTIVO");
});

test("V5. delegado pero sin reportes.ver: rechazado", () => {
  assert.equal(decidir(pedido(), usuario({ rol: { permisos: ["pos.usar"] } })).codigo, "SIN_PERMISO");
});

test("V6. la persona SALE del token: el token de 7 lee al 7, sea cual sea el usuario que alguien quisiera", async () => {
  // El pedido no tiene dónde poner un `usuarioId`; aunque se lo agregue al
  // objeto, la puerta no lo lee.
  const registro = [];
  const r = await autorizar({ ...pedido(), usuarioId: 8 }, delegacion({ usuarioId: 7 }), registro);
  assert.equal(r.ok, true);
  assert.equal(r.autorizacion.usuarioId, 7);
  assert.ok(registro.includes("usuario:7") && !registro.includes("usuario:8"), registro.join(","));
  // Y una fila de usuario que no es la del dueño del token no se acepta.
  assert.equal(decidir(pedido(), usuario({ id: 8 }), delegacion({ usuarioId: 7 })).codigo, "USUARIO_INEXISTENTE");
});

test("V6b. una delegación de otra aplicación no sirve", () => {
  const base = { pedido: pedido(), usuario: usuario(), grupoDelLocal: 1, grupoDelLocalDelUsuario: 1 };
  assert.equal(decidirAutorizacion({ ...base, aplicacionVinculo: "AZUL_CHAT", delegacion: delegacion({ aplicacion: "OTRA_APP" }) }).codigo, "DELEGACION_INEXISTENTE");
  // Y sin saber qué aplicación se autenticó, ninguna delegación sirve.
  assert.equal(decidirAutorizacion({ ...base, aplicacionVinculo: undefined, delegacion: delegacion() }).codigo, "DELEGACION_INEXISTENTE");
  // Una delegación sin su vínculo (una fila rota) tampoco.
  assert.equal(decidirAutorizacion({ ...base, aplicacionVinculo: "AZUL_CHAT", delegacion: { id: 5, vinculo: null } }).codigo, "DELEGACION_INEXISTENTE");
});

test("V7. recuperar el permiso no pide volver a vincularse: la misma delegación vuelve a servir", () => {
  const d = delegacion();
  assert.equal(decidir(pedido(), usuario({ rol: { permisos: ["pos.usar"] } }), d).codigo, "SIN_PERMISO");
  assert.equal(decidir(pedido(), usuario(), d).ok, true);
});

test("V7b. la delegación no congela nada: sigue mandando el rol y el local de hoy", () => {
  const d = delegacion();
  assert.equal(decidir(pedido({ localId: 11 }), usuario({ rol: { permisos: ["*"] } }), d).ok, true);
  assert.equal(decidir(pedido({ localId: 11 }), usuario(), d).codigo, "FUERA_DE_ALCANCE");
  // Cambiarle el local fijo a la persona cambia lo que puede ver, con el mismo token.
  assert.equal(decidir(pedido({ localId: 11 }), usuario({ localId: 11 }), d).ok, true);
  assert.equal(decidir(pedido({ localId: 10 }), usuario({ localId: 11 }), d).codigo, "FUERA_DE_ALCANCE");
});

// ── El alcance, escrito una vez ────────────────────────────────────────────

test("alcanceTerritorial: la regla del reporte general, en cuatro modos", () => {
  assert.deepEqual(alcanceTerritorial({ esAdmin: false, localFijo: 10, grupoDelLocalDelUsuario: 1 }), { modo: "LOCAL", localId: 10 });
  assert.deepEqual(alcanceTerritorial({ esAdmin: false, localFijo: null, grupoDelLocalDelUsuario: null }), { modo: "NINGUNO" });
  assert.deepEqual(alcanceTerritorial({ esAdmin: true, localFijo: 10, grupoDelLocalDelUsuario: 1 }), { modo: "GRUPO", grupoId: 1 });
  assert.deepEqual(alcanceTerritorial({ esAdmin: true, localFijo: 10, grupoDelLocalDelUsuario: null }), { modo: "NINGUNO" });
  assert.deepEqual(alcanceTerritorial({ esAdmin: true, localFijo: null, grupoDelLocalDelUsuario: null }), { modo: "GLOBAL" });
});

test("localEnAlcance decide solo el alcance; un alcance desconocido no deja nada", () => {
  assert.equal(localEnAlcance({ modo: "LOCAL", localId: 10 }, 10, 1), true);
  assert.equal(localEnAlcance({ modo: "LOCAL", localId: 10 }, 11, 1), false);
  assert.equal(localEnAlcance({ modo: "GRUPO", grupoId: 1 }, 11, 1), true);
  assert.equal(localEnAlcance({ modo: "GRUPO", grupoId: 1 }, 20, 2), false);
  assert.equal(localEnAlcance({ modo: "GLOBAL" }, 20, 2), true);
  for (const raro of [{ modo: "NINGUNO" }, { modo: "TODO" }, null, undefined, {}]) assert.equal(localEnAlcance(raro, 10, 1), false);
});

// ── mi_alcance ─────────────────────────────────────────────────────────────

test("mi_alcance no pide permiso propio: alcanza con estar activo y delegado", () => {
  const r = decidir(pedidoAlcance(), usuario({ rol: { permisos: [] } }));
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(r.autorizacion)), {
    usuarioId: 7, capacidad: "mi_alcance", vinculoId: 3, delegacionId: 5, alcance: { modo: "LOCAL", localId: 10 },
    // Sin ningún permiso, mi_alcance responde igual, pero no anuncia nada.
    capacidadesSobreUnLocal: [],
  });
  // Pero sí pide lo demás: delegación vigente y persona activa.
  assert.equal(decidir(pedidoAlcance(), usuario({ activo: false })).codigo, "USUARIO_INACTIVO");
  assert.equal(decidir(pedidoAlcance(), usuario(), delegacion({ revocadoEn: new Date() })).codigo, "VINCULO_REVOCADO");
  assert.equal(decidir(pedidoAlcance({ token: "x" })).codigo, "DELEGACION_INEXISTENTE");
});

// ── transferencias_eventos ─────────────────────────────────────────────────
//
// La capacidad no agrega reglas: pasa por la MISMA autorización que
// ventas_resumen, con `transferencias.ver` como permiso. Lo que se prueba acá es
// que esa autorización se aplica de verdad, y en vivo.

const pedidoEventos = (extra = {}) => ({ token: TOKEN, capacidad: "transferencias_eventos", grupoId: 1, localId: 10, ...extra });
const usuarioEventos = (extra = {}) => usuario({ rol: { permisos: ["transferencias.ver"] }, ...extra });

/** Un cargador sobre una base que se puede cambiar entre consultas, con la MISMA delegación. */
function baseViva() {
  const fila = { usuario: usuarioEventos() };
  return {
    fila,
    cargador: {
      delegacion: async (hash) => (hash === hashTokenDelegacion(TOKEN) ? delegacion() : null),
      usuario: async () => fila.usuario,
      grupoDeLocal: async (id) => GRUPO_DE[id] ?? null,
    },
  };
}
const autorizarEventos = (p, cargador) => autorizarIntegracion(p, cargador, { aplicacionVinculo: "AZUL_CHAT" });

test("transferencias_eventos: transferencias.ver sobre su local alcanza; reportes.ver no", () => {
  const r = decidir(pedidoEventos(), usuarioEventos());
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(r.autorizacion)), {
    usuarioId: 7, capacidad: "transferencias_eventos", vinculoId: 3, delegacionId: 5,
    alcance: { modo: "LOCAL", localId: 10 }, grupoId: 1, localId: 10,
  });
  // El permiso es el de VER transferencias, no el de otra capacidad.
  assert.equal(decidir(pedidoEventos(), usuario({ rol: { permisos: ["reportes.ver"] } })).codigo, "SIN_PERMISO");
  assert.equal(decidir(pedidoEventos(), usuario({ rol: { permisos: ["transferencias.recibir"] } })).codigo, "SIN_PERMISO");
});

test("transferencias_eventos con los roles reales: ENCARGADO y DUEÑO_LOCAL sí, CAJERO no", () => {
  // Si mañana el CAJERO recibe transferencias.ver, esto avisa que la
  // integración empieza a mostrarle transferencias: es una decisión.
  assert.equal(decidir(pedidoEventos(), usuario({ rol: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } })).ok, true);
  assert.equal(decidir(pedidoEventos(), usuario({ rol: { permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL] } })).ok, true);
  const cajero = DEFAULT_PERMISOS_SISTEMA[CAJERO];
  assert.equal(cajero.includes("transferencias.ver"), false);
  assert.equal(decidir(pedidoEventos(), usuario({ rol: { permisos: cajero } })).codigo, "SIN_PERMISO");
});

test("transferencias_eventos: delegación, usuario activo, grupo coherente y local real son requisitos", () => {
  assert.equal(decidir(pedidoEventos({ token: "x" }), usuarioEventos()).codigo, "DELEGACION_INEXISTENTE");
  assert.equal(decidir(pedidoEventos(), usuarioEventos(), delegacion({ revocadoEn: new Date() })).codigo, "VINCULO_REVOCADO");
  assert.equal(decidir(pedidoEventos(), usuarioEventos({ activo: false })).codigo, "USUARIO_INACTIVO");
  assert.equal(decidir(pedidoEventos({ grupoId: 2 }), usuarioEventos()).codigo, "GRUPO_LOCAL_INCONSISTENTE");
  assert.equal(decidir(pedidoEventos({ localId: 999, grupoId: 1 }), usuarioEventos()).codigo, "LOCAL_SIN_GRUPO");
  assert.equal(decidir(pedidoEventos({ localId: undefined }), usuarioEventos()).codigo, "PEDIDO_INVALIDO");
});

test("H. quitar transferencias.ver DESPUÉS de crear la delegación corta la capacidad en la consulta siguiente", async () => {
  const { fila, cargador } = baseViva();
  assert.equal((await autorizarEventos(pedidoEventos(), cargador)).ok, true);
  fila.usuario = usuarioEventos({ rol: { permisos: ["reportes.ver"] } });
  assert.equal((await autorizarEventos(pedidoEventos(), cargador)).codigo, "SIN_PERMISO");
  // Y devolverlo la reabre sin volver a vincular: la delegación no congela nada.
  fila.usuario = usuarioEventos();
  assert.equal((await autorizarEventos(pedidoEventos(), cargador)).ok, true);
});

test("I. mover a la persona de local DESPUÉS de crear la delegación corta el local anterior en la consulta siguiente", async () => {
  const { fila, cargador } = baseViva();
  assert.equal((await autorizarEventos(pedidoEventos({ localId: 10 }), cargador)).ok, true);
  fila.usuario = usuarioEventos({ localId: 11 });
  assert.equal((await autorizarEventos(pedidoEventos({ localId: 10 }), cargador)).codigo, "FUERA_DE_ALCANCE");
  assert.equal((await autorizarEventos(pedidoEventos({ localId: 11 }), cargador)).ok, true);
});

test("J. un local fuera del alcance se RECHAZA: la autorización no devuelve un alcance para filtrar a vacío", async () => {
  const { cargador } = baseViva();
  for (const [p, codigo] of [
    [pedidoEventos({ localId: 11 }), "FUERA_DE_ALCANCE"], // otro local del mismo grupo
    [pedidoEventos({ localId: 20, grupoId: 2 }), "FUERA_DE_ALCANCE"], // otro grupo
  ]) {
    const r = await autorizarEventos(p, cargador);
    assert.equal(r.ok, false);
    assert.deepEqual([r.status, r.codigo], [403, codigo]);
    assert.equal(r.autorizacion, undefined, "no hay autorización con la que ejecutar");
  }
});

test("mi_alcance no lee ningún local del pedido: solo el grupo del local FIJO de la persona", async () => {
  const registro = [];
  const r = await autorizar(pedidoAlcance({ localId: 20, grupoId: 2 }), delegacion(), registro);
  assert.equal(r.ok, true);
  assert.equal(r.autorizacion.localId, undefined);
  assert.deepEqual(registro, ["delegacion", "usuario:7", "grupo"], "un solo grupo: el del local fijo (10), no el 20 del pedido");
});

// ── Las capacidades que anuncia mi_alcance (Tanda 1B) ──────────────────────
//
// `mi_alcance` anuncia, en cada local, qué capacidades sobre un local puede
// usar la persona hoy. Lo que estos candados fijan es que el anuncio NO es una
// segunda regla: sale de recorrer el catálogo con `capacidadPermitida`, la
// misma función con la que la puerta deja pasar o no una consulta.

const anunciadas = (u = usuario()) => decidir(pedidoAlcance(), u).autorizacion.capacidadesSobreUnLocal;
// Todos los roles del sistema, más combinaciones que cubren cada permiso suelto.
const ROLES_Y_COMBINACIONES = [
  ...Object.entries(DEFAULT_PERMISOS_SISTEMA).map(([nombre, permisos]) => [nombre, permisos]),
  ["admin (*)", ["*"]],
  ["ninguno", []],
  ["solo transferencias.ver", ["transferencias.ver"]],
  ["solo reportes.ver", ["reportes.ver"]],
  ["solo transferencias.recibir", ["transferencias.recibir"]],
];

test("A/B. ENCARGADO y DUEÑO_LOCAL reales anuncian transferencias_eventos; CAJERO no; sin permisos, nada", () => {
  assert.deepEqual([...anunciadas(usuario({ rol: { permisos: DEFAULT_PERMISOS_SISTEMA[ENCARGADO] } }))], ["ventas_resumen", "transferencias_eventos"]);
  assert.deepEqual([...anunciadas(usuario({ rol: { permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL] } }))], ["ventas_resumen", "transferencias_eventos"]);
  assert.deepEqual([...anunciadas(usuario({ rol: { permisos: DEFAULT_PERMISOS_SISTEMA[CAJERO] } }))], []);
  assert.deepEqual([...anunciadas(usuario({ rol: { permisos: ["transferencias.ver"] } }))], ["transferencias_eventos"]);
  assert.deepEqual([...anunciadas(usuario({ rol: { permisos: [] } }))], []);
  // B: sin el permiso, mi_alcance responde igual —ve el local—, solo no lo anuncia.
  assert.equal(decidir(pedidoAlcance(), usuario({ rol: { permisos: [] } })).ok, true);
  assert.ok(Object.isFrozen(anunciadas()), "el anuncio viaja congelado, como el alcance");
});

test("EL ANUNCIO ES LA PUERTA: anunciada ⇔ la puerta la deja pasar sobre un local del alcance, para cada rol real", () => {
  for (const [nombre, permisos] of ROLES_Y_COMBINACIONES) {
    const u = usuario({ rol: { permisos } });
    const anuncio = new Set(anunciadas(u));
    for (const [capacidad, def] of Object.entries(CAPACIDADES)) {
      if (!def.pideLocal) {
        assert.ok(!anuncio.has(capacidad), `${nombre}: ${capacidad} no es sobre un local y no se anuncia`);
        continue;
      }
      const puerta = decidir(pedido({ capacidad, grupoId: 1, localId: 10 }), u).ok;
      assert.equal(anuncio.has(capacidad), puerta, `${nombre}: ${capacidad} anunciada=${anuncio.has(capacidad)} y la puerta dice ${puerta}`);
    }
  }
});

test("C/D. quitar transferencias.ver deja de anunciarla en la próxima mi_alcance; devolverlo la vuelve a anunciar, con la MISMA delegación", async () => {
  const { fila, cargador } = baseViva();
  const anuncio = async () => [...(await autorizarEventos(pedidoAlcance(), cargador)).autorizacion.capacidadesSobreUnLocal];
  assert.deepEqual(await anuncio(), ["transferencias_eventos"]);
  fila.usuario = usuarioEventos({ rol: { permisos: [] } });
  assert.deepEqual(await anuncio(), [], "C: sin el permiso ya no se anuncia");
  fila.usuario = usuarioEventos();
  assert.deepEqual(await anuncio(), ["transferencias_eventos"], "D: vuelve sin revincular");
});

test("G. una capacidad nueva del catálogo con pideLocal se anuncia sola, sin un if en mi_alcance", () => {
  const sesion = { esAdmin: false, permisos: ["pedidos.ver"] };
  const conNueva = {
    ...CAPACIDADES,
    pedidos_eventos: { permisos: ["pedidos.ver"], soloLectura: true, parametros: [], pideLocal: true },
  };
  assert.deepEqual([...capacidadesSobreUnLocal(sesion, conNueva)], ["pedidos_eventos"]);
  assert.deepEqual([...capacidadesSobreUnLocal({ esAdmin: false, permisos: [] }, conNueva)], []);
});

test("H. una capacidad que no pide local nunca se anuncia como capacidad de un local, aunque la persona pueda usarla", () => {
  const conGlobal = { ...CAPACIDADES, resumen_del_negocio: { permisos: ["reportes.ver"], soloLectura: true, parametros: [], pideLocal: false } };
  assert.deepEqual([...capacidadesSobreUnLocal({ esAdmin: false, permisos: ["reportes.ver"] }, conGlobal)], ["ventas_resumen"]);
  // mi_alcance no pide permiso —cualquiera la puede usar— y tampoco se anuncia.
  assert.ok(!capacidadesSobreUnLocal({ esAdmin: true, permisos: ["*"] }).includes("mi_alcance"));
  assert.deepEqual([...capacidadesSobreUnLocal({ esAdmin: true, permisos: ["*"] })], ["ventas_resumen", "transferencias_eventos"]);
});

test("I. el anuncio lee los permisos DEL CATÁLOGO: si cambian ahí, cambia el anuncio", () => {
  const sesion = { esAdmin: false, permisos: ["reportes.ver"] };
  assert.deepEqual([...capacidadesSobreUnLocal(sesion)], ["ventas_resumen"]);
  const otroPermiso = {
    ...CAPACIDADES,
    transferencias_eventos: { ...CAPACIDADES.transferencias_eventos, permisos: ["reportes.ver"] },
  };
  assert.deepEqual([...capacidadesSobreUnLocal(sesion, otroPermiso)], ["ventas_resumen", "transferencias_eventos"]);
});

test("J. el anuncio no es un pase: la puerta sigue decidiendo cada consulta en el momento", async () => {
  const { fila, cargador } = baseViva();
  const anuncio = (await autorizarEventos(pedidoAlcance(), cargador)).autorizacion.capacidadesSobreUnLocal;
  assert.ok(anuncio.includes("transferencias_eventos"));
  // Anunciada, pero sobre un local fuera del alcance: rechazo.
  assert.equal((await autorizarEventos(pedidoEventos({ localId: 11 }), cargador)).codigo, "FUERA_DE_ALCANCE");
  // Anunciada hace un momento, y ahora la persona está inactiva: rechazo.
  fila.usuario = usuarioEventos({ activo: false });
  assert.equal((await autorizarEventos(pedidoEventos(), cargador)).codigo, "USUARIO_INACTIVO");
  // Y la autorización de una consulta no lleva el anuncio: nadie decide con él.
  fila.usuario = usuarioEventos();
  const r = await autorizarEventos(pedidoEventos(), cargador);
  assert.equal(r.ok, true);
  assert.equal("capacidadesSobreUnLocal" in r.autorizacion, false);
});
