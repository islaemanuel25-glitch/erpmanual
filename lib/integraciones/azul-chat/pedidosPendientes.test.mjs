// Candados de la capacidad `pedidos_pendientes` (Tanda 9A): la forma, el local
// de la autorización, el orden, qué estados entran y la puerta.
//   node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/pedidosPendientes.test.mjs
//
// La base es de mentira y evalúa el `where` que la capacidad le pasa —con el
// `AND` de `sinCancelados`—, así que un filtro que falte se ve en el resultado.
// Lo mismo contra PostgreSQL, por el camino real (solicitar y cancelar por sus
// rutas): `scripts/pruebas-db/azulChatPedidosPendientes.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";

import { pedidosPendientes, aPendiente, antiguedadEnHoras, CAPACIDAD, VERSION_CONTRATO } from "./pedidosPendientes.js";
import { ESTADO_PEDIDO } from "../../pedidos/estados.js";
import { atenderSolicitud } from "./atender.js";
import { CABECERAS, firmarSolicitud } from "./autenticacionAplicacion.js";
import { aRespuestaPublica } from "./respuestaPublica.js";
import { generarTokenDelegacion, hashTokenDelegacion } from "../vinculos/codigoVinculo.js";

const AHORA = Date.parse("2026-10-12T15:00:00.000Z");
const HACE_H = (h) => new Date(AHORA - h * 60 * 60 * 1000);
const AUTZ = Object.freeze({ localId: 10, grupoId: 1 });
const LOCALES = { 10: { id: 10, nombre: "Local Centro" }, 11: { id: 11, nombre: "Local Norte" } };
const DEPOSITO = { id: 1, nombre: "Depósito" };

/** ¿La fila cumple el `where`? Lo justo para lo que arma la capacidad: igualdad, `not` y `AND`. */
function cumple(fila, where) {
  for (const [k, v] of Object.entries(where)) {
    if (k === "AND") {
      if (![].concat(v).every((w) => cumple(fila, w))) return false;
    } else if (v && typeof v === "object" && "not" in v) {
      if (fila[k] === v.not) return false;
    } else if (fila[k] !== v) return false;
  }
  return true;
}

function baseDeMentira(filas) {
  const db = {
    pedidos: [],
    local: { findUnique: async ({ where }) => LOCALES[where.id] ?? null },
    posTransferencia: {
      findMany: async (args) => {
        db.pedidos.push(args);
        const vistas = filas.filter((f) => cumple(f, args.where));
        vistas.sort((a, b) => (a.solicitadoAt - b.solicitadoAt) || (a.id - b.id));
        return vistas.map((f) => ({ id: f.id, solicitadoAt: f.solicitadoAt, origen: f.origen, _count: { detalles: f.lineas } }));
      },
    },
  };
  return db;
}

const fila = (id, estado, horas, extra = {}) => ({
  id, estado, destinoId: 10, origenId: DEPOSITO.id, origen: DEPOSITO, lineas: 3, solicitadoAt: horas == null ? null : HACE_H(horas), ...extra,
});

test("la forma: capacidad, versión 1, el local con nombre, el grupo, y por pedido id, fecha, origen, líneas y antigüedad", async () => {
  const db = baseDeMentira([fila(5, ESTADO_PEDIDO.SOLICITADO, 26.5, { lineas: 7 })]);
  const r = await pedidosPendientes(AUTZ, {}, { db, ahora: AHORA });
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos, {
    capacidad: "pedidos_pendientes",
    version: 1,
    local: { id: 10, nombre: "Local Centro" },
    grupoId: 1,
    pedidos: [{ id: 5, solicitadoAt: HACE_H(26.5).toISOString(), origen: { id: 1, nombre: "Depósito" }, lineas: 7, antiguedadHoras: 26 }],
  });
  assert.deepEqual([CAPACIDAD, VERSION_CONTRATO], ["pedidos_pendientes", 1]);
});

test("solo los Solicitado del local: ni Borrador, ni Preparando, ni Enviando, ni Enviado, ni Cancelado, ni los de otro local", async () => {
  const db = baseDeMentira([
    fila(1, ESTADO_PEDIDO.BORRADOR, null),
    fila(2, ESTADO_PEDIDO.PREPARANDO, null),
    fila(3, ESTADO_PEDIDO.SOLICITADO, 5),
    fila(4, ESTADO_PEDIDO.ENVIANDO, 6),
    fila(5, ESTADO_PEDIDO.ENVIADO, 7),
    fila(6, ESTADO_PEDIDO.CANCELADO, 8),
    fila(7, ESTADO_PEDIDO.SOLICITADO, 9, { destinoId: 11 }),
    // El local como ORIGEN de un pedido: no es un pedido suyo.
    fila(8, ESTADO_PEDIDO.SOLICITADO, 10, { destinoId: 99, origenId: 10 }),
  ]);
  const r = await pedidosPendientes(AUTZ, {}, { db, ahora: AHORA });
  assert.deepEqual(r.datos.pedidos.map((p) => p.id), [3]);
});

test("el filtro de cancelados es el único, sinCancelados, y va en la consulta", async () => {
  const db = baseDeMentira([]);
  await pedidosPendientes(AUTZ, {}, { db, ahora: AHORA });
  assert.deepEqual(db.pedidos[0].where, {
    destinoId: 10,
    estado: "Solicitado",
    AND: [{ estado: { not: "Cancelado" } }],
  });
});

test("del más viejo al más nuevo; con la misma fecha, por id", async () => {
  const db = baseDeMentira([
    fila(30, ESTADO_PEDIDO.SOLICITADO, 1),
    fila(10, ESTADO_PEDIDO.SOLICITADO, 48),
    fila(21, ESTADO_PEDIDO.SOLICITADO, 5),
    fila(20, ESTADO_PEDIDO.SOLICITADO, 5),
  ]);
  const r = await pedidosPendientes(AUTZ, {}, { db, ahora: AHORA });
  assert.deepEqual(r.datos.pedidos.map((p) => p.id), [10, 20, 21, 30]);
  assert.deepEqual(r.datos.pedidos.map((p) => p.antiguedadHoras), [48, 5, 5, 1]);
  assert.deepEqual(db.pedidos[0].orderBy, [{ solicitadoAt: "asc" }, { id: "asc" }]);
});

test("ninguno pendiente: la lista vacía, no un error", async () => {
  const db = baseDeMentira([fila(6, ESTADO_PEDIDO.CANCELADO, 8), fila(5, ESTADO_PEDIDO.ENVIADO, 7)]);
  const r = await pedidosPendientes(AUTZ, {}, { db, ahora: AHORA });
  assert.deepEqual([r.ok, r.datos.pedidos], [true, []]);
});

test("el local sale de la AUTORIZACIÓN; uno que no existe es LOCAL_SIN_GRUPO y no se consulta nada", async () => {
  const db = baseDeMentira([fila(3, ESTADO_PEDIDO.SOLICITADO, 5, { destinoId: 11 })]);
  const r = await pedidosPendientes({ localId: 11, grupoId: 1 }, { localId: 10 }, { db, ahora: AHORA });
  assert.deepEqual([r.datos.local, r.datos.pedidos.map((p) => p.id)], [{ id: 11, nombre: "Local Norte" }, [3]]);
  const db2 = baseDeMentira([]);
  const r2 = await pedidosPendientes({ localId: 99, grupoId: 1 }, {}, { db: db2, ahora: AHORA });
  assert.deepEqual([r2.ok, r2.codigo], [false, "LOCAL_SIN_GRUPO"]);
  assert.equal(db2.pedidos.length, 0);
});

test("la antigüedad: horas completas, nunca negativa, null sin fecha", () => {
  assert.equal(antiguedadEnHoras(HACE_H(1.5), AHORA), 1);
  assert.equal(antiguedadEnHoras(HACE_H(0.99), AHORA), 0);
  assert.equal(antiguedadEnHoras(HACE_H(-2), AHORA), 0);
  assert.equal(antiguedadEnHoras(null, AHORA), null);
  const p = aPendiente({ id: 1, solicitadoAt: null, origen: DEPOSITO, _count: { detalles: 0 } }, AHORA);
  assert.deepEqual([p.solicitadoAt, p.antiguedadHoras, p.lineas], [null, null, 0]);
});

test("no expone productos, cantidades, precios ni quién pidió o canceló", () => {
  const p = aPendiente({ id: 1, solicitadoAt: HACE_H(2), origen: { ...DEPOSITO, cuit: "x" }, _count: { detalles: 2 }, solicitadoPorUserId: 4, canceladoPorUserId: 5, precio: 1 }, AHORA);
  assert.deepEqual(Object.keys(p).sort(), ["antiguedadHoras", "id", "lineas", "origen", "solicitadoAt"]);
  assert.deepEqual(Object.keys(p.origen).sort(), ["id", "nombre"]);
});

// ── por la puerta: firma, delegación, permiso y el ejecutor ──────────────────

const SECRETO = "integracion-azul-chat-de-prueba-0123456789";
const ENTORNO = { AZUL_CHAT_INTEGRACION_SECRET: SECRETO, AUTH_SECRET: "el-de-las-sesiones-del-erp-que-no-se-usa" };
const MARCA = String(Math.floor(AHORA / 1000));
const TOKEN = generarTokenDelegacion();
const GRUPO_DE = { 10: 1, 11: 1, 20: 2 };

function puerta({ cuerpo, permisos = ["pedidos.ver"], localId = 10 }) {
  const db = baseDeMentira([fila(700, ESTADO_PEDIDO.SOLICITADO, 3)]);
  const cargador = {
    delegacion: async (hash) =>
      hash === hashTokenDelegacion(TOKEN) ? { id: 5, vinculo: { id: 3, usuarioId: 7, aplicacion: "AZUL_CHAT", revocadoEn: null } } : null,
    usuario: async (id) => (id === 7 ? { id: 7, activo: true, localId, rol: { permisos } } : null),
    grupoDeLocal: async (id) => GRUPO_DE[id] ?? null,
  };
  const texto = JSON.stringify(cuerpo);
  const headers = new Headers({
    [CABECERAS.aplicacion]: "azul-chat",
    [CABECERAS.marca]: MARCA,
    [CABECERAS.firma]: firmarSolicitud({ secreto: SECRETO, aplicacion: "azul-chat", marca: MARCA, cuerpo: texto }),
  });
  const ejecutores = { pedidos_pendientes: (autz, parametros, { ahora }) => pedidosPendientes(autz, parametros, { db, ahora }) };
  return { db, correr: async () => aRespuestaPublica(await atenderSolicitud({ headers, cuerpo: texto }, { cargador, ejecutores, entorno: ENTORNO, ahora: AHORA })) };
}

const pedido = (extra = {}) => ({ capacidad: "pedidos_pendientes", delegacion: { token: TOKEN }, alcance: { grupoId: 1, localId: 10 }, parametros: {}, ...extra });

test("por la puerta: con pedidos.ver responde, sin caché", async () => {
  const r = await puerta({ cuerpo: pedido() }).correr();
  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo.datos.pedidos.map((p) => p.id), [700]);
  assert.equal(r.cabeceras["Cache-Control"], "no-store");
});

test("por la puerta: cualquier parámetro, o sin alcance → SOLICITUD_INVALIDA sin tocar la base", async () => {
  for (const cuerpo of [
    pedido({ parametros: { localId: 11 } }),
    pedido({ parametros: { estado: "Cancelado" } }),
    pedido({ parametros: { limite: 5 } }),
    pedido({ alcance: undefined }),
    pedido({ usuarioId: 8 }),
  ]) {
    const { db, correr } = puerta({ cuerpo });
    const r = await correr();
    assert.deepEqual([r.status, r.cuerpo.codigo], [400, "SOLICITUD_INVALIDA"], JSON.stringify(cuerpo));
    assert.equal(db.pedidos.length, 0);
  }
});

test("por la puerta: sin pedidos.ver, o con un local fuera del alcance, NO_AUTORIZADO y el ejecutor no corre", async () => {
  for (const p of [
    puerta({ cuerpo: pedido(), permisos: ["transferencias.ver", "pedidos.solicitar", "reportes.ver"] }),
    puerta({ cuerpo: pedido({ alcance: { grupoId: 1, localId: 11 } }) }),
    puerta({ cuerpo: pedido({ alcance: { grupoId: 2, localId: 20 } }) }),
  ]) {
    const r = await p.correr();
    assert.deepEqual([r.status, r.cuerpo.codigo], [403, "NO_AUTORIZADO"]);
    assert.equal(p.db.pedidos.length, 0);
  }
});
