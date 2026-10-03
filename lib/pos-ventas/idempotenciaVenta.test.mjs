// CUÁNDO UN PEDIDO DE crear ES EL REINTENTO DE UNA VENTA QUE YA EXISTE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/idempotenciaVenta.test.mjs
//
// Las formas de los errores son las que devolvió Prisma 6.19 contra PostgreSQL
// para los dos únicos de Venta; scripts/pruebas-db/cobroIdempotente.mjs las
// vuelve a medir en cada corrida y ejerce la carrera de verdad por el handler.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { esMismoDestino, esChoqueDeClientTxnId } from "@/lib/pos-ventas/idempotenciaVenta";

const CHOQUE_TXN = { code: "P2002", meta: { modelName: "Venta", target: ["clientTxnId"] } };
const CHOQUE_NUMERO = { code: "P2002", meta: { modelName: "Venta", target: ["localId", "numero"] } };

test("el choque del índice único de clientTxnId es un reintento", () => {
  assert.equal(esChoqueDeClientTxnId(CHOQUE_TXN), true);
  assert.equal(esChoqueDeClientTxnId({ code: "P2002", meta: { modelName: "Venta", target: "Venta_clientTxnId_key" } }), true);
});

test("cualquier otro P2002 NO es un reintento", () => {
  assert.equal(esChoqueDeClientTxnId(CHOQUE_NUMERO), false, "el número de venta");
  assert.equal(esChoqueDeClientTxnId({ code: "P2002", meta: { modelName: "Transferencia", target: ["ventaId"] } }), false);
  assert.equal(esChoqueDeClientTxnId({ code: "P2002", meta: { modelName: "OtraTabla", target: ["clientTxnId"] } }), false);
  assert.equal(esChoqueDeClientTxnId({ code: "P2002", meta: { modelName: "Venta", target: ["clientTxnId", "localId"] } }), false);
  assert.equal(esChoqueDeClientTxnId({ code: "P2002" }), false, "sin meta no se sabe qué chocó");
  assert.equal(esChoqueDeClientTxnId({ code: "P2028", meta: CHOQUE_TXN.meta }), false);
  assert.equal(esChoqueDeClientTxnId(null), false);
});

test("mismo destino: mismo local y mismo turno, y nada más", () => {
  const venta = { localId: 1, turnoId: 10 };
  assert.equal(esMismoDestino(venta, { localId: 1, turnoId: 10 }), true);
  assert.equal(esMismoDestino(venta, { localId: 1, turnoId: "10" }), true, "el turno puede llegar como texto");
  assert.equal(esMismoDestino(venta, { localId: 1, turnoId: 11 }), false, "otra caja");
  assert.equal(esMismoDestino(venta, { localId: 2, turnoId: 10 }), false, "otro local");
  assert.equal(esMismoDestino({ localId: 1, turnoId: null }, { localId: 1, turnoId: null }), false, "sin turno no hay destino");
  assert.equal(esMismoDestino(null, { localId: 1, turnoId: 10 }), false);
});

// ── La ruta, leída SIN comentarios ──────────────────────────────────────────
const ruta = readFileSync("app/api/pos-ventas/crear/route.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

test("la consulta temprana y el catch deciden con la MISMA condición", () => {
  // `responderDuplicada` recibe además el id: con él reconcilia el cobro offline
  // de esa venta (lib/pos-ventas/cobroOfflineServidor.js). La condición no cambió.
  assert.match(ruta, /if \(esMismoDestino\(ventaExistente, \{ localId, turnoId \}\)\) \{\s*return responderDuplicada\(ventaExistente, txnId\);/);
  const captura = ruta.slice(ruta.lastIndexOf("} catch (err) {"));
  const rama = captura.indexOf("if (esChoqueDeClientTxnId(err) && pedidoIdempotente)");
  const generico = captura.indexOf("if (err.code === 'P2002')");
  assert.ok(rama > 0 && generico > rama, "el choque de clientTxnId se mira antes que el P2002 genérico");
  const cuerpo = captura.slice(rama, generico);
  assert.match(cuerpo, /buscarVentaPorTxn\(pedidoIdempotente\.txnId\)/);
  assert.match(cuerpo, /if \(esMismoDestino\(ganadora, pedidoIdempotente\)\) \{\s*return await responderDuplicada\(ganadora, pedidoIdempotente\.txnId\);/);
});

test("el destino del catch se fija con el id y el turno del pedido, después del PIN", () => {
  const gate = ruta.indexOf("requireOperadorSegunConfig(req, session, { localId })");
  const fija = ruta.indexOf("pedidoIdempotente = txnId ? { txnId, localId, turnoId } : null;");
  assert.ok(gate > 0 && fija > gate, "sin PIN validado no hay pedido idempotente");
});
