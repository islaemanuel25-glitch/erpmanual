// EL LOCAL NO CANCELA UN PEDIDO QUE EL DEPÓSITO YA EMPEZÓ.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/pedidos/cancelarEmpezado.test.mjs
//
// Regla de Emanuel (2026-10-22). Las respuestas son las de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs`, sección 10, contra
// erpazul_al. La carrera 10d se midió también SIN el bloqueo en cancelar
// (CONTRAPRUEBA_DEPOSITO=cancelar): 38 y 37 de 40 pedidos quedaron cancelados
// con lo preparado adentro. Y sin el rechazo de "cancelado en el medio" en
// `detalle/editar`, 16 de 40. Con los dos, 0.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));
const MENSAJE = "El depósito ya está preparando tu pedido. Ya no se puede cancelar desde el local.";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
const ruta = sinComentarios("app/api/pos-transferencias/cancelar/route.js");

test("10a: sin empezar, el local cancela", () => {
  assert.equal(real.cancelarSinEmpezar.status, 200);
  assert.equal(real.cancelarSinEmpezar.cuerpo.ok, true);
});

test("10b: empezado, el local recibe 409 con el mensaje", () => {
  assert.deepEqual(real.cancelarEmpezadoLocal, { status: 409, cuerpo: { ok: false, error: MENSAJE } });
  // Y la pantalla, al releer, lo ve empezado.
  assert.equal(real.empezadoCarritoTrasCancelar.cuerpo.pendiente.depositoEmpezo, true);
});

test("10c: el depósito de este pedido cancela el empezado; el admin sin local también", () => {
  // Decía: un usuario del depósito no cancela (403, por propiedad). Desde el
  // 2026-10-23 el depósito ORIGEN sí, empezado o no: lo cubre entero
  // `app/api/pos-transferencias/cancelarDesdeElDeposito.test.mjs`.
  assert.equal(real.cancelarEmpezadoDeposito.status, 200);
  assert.equal(real.cancelarEmpezadoDeposito.cuerpo.ok, true);
  assert.equal(real.cancelarEmpezadoAdmin.status, 200);
});

test("10d: cancelar del local contra el depósito empezando: cero cancelados ya empezados", () => {
  const m = real.carreraCancelar;
  assert.ok(m.vueltas >= 20);
  assert.equal(m.tardes, 0, `${m.tardes} pedidos cancelados con lo preparado adentro`);
  assert.equal(m.otras, 0);
  assert.equal(m.cancelo + m.rechazo, m.vueltas);
  assert.ok(m.cancelo > 0 && m.rechazo > 0, "la carrera no cayó de los dos lados: no se ejerció");
  assert.deepEqual(real.prepararCanceladoEnElMedio, {
    status: 409,
    cuerpo: { ok: false, error: "El local canceló este pedido. Actualizá la lista." },
  });
});

test("la forma: el criterio de empezado es el de bloqueoDelPedido, adentro del bloqueo y antes de marcar", () => {
  const tx = ruta.indexOf("prisma.$transaction(async (tx) =>");
  const par = ruta.indexOf("bloquearParDelPedido(tx, pos.origenId, pos.destinoId)");
  const fila = ruta.indexOf("bloquearFilaDelPedido(tx, posId)");
  // El depósito de este pedido queda afuera de la pregunta (2026-10-23): él sí
  // cancela un empezado. El local, adentro, como siempre.
  const pregunta = ruta.indexOf("!esAdmin && !esDelDeposito && fila?.estado === ESTADO_PEDIDO.SOLICITADO && (await depositoEmpezo(tx, fila))");
  const marca = ruta.indexOf("tx.posTransferencia.updateMany(");
  assert.ok(tx > -1 && par > tx && fila > par && pregunta > fila && marca > pregunta, "el orden no es transacción → par → fila → empezado → marcar");
  assert.match(ruta, /from "@\/lib\/pedidos\/bloqueoDelPedido"/);
  assert.ok(ruta.includes(MENSAJE));
});

test("las rutas del depósito no escriben en un pedido que se canceló antes del bloqueo", () => {
  for (const f of [
    "app/api/pos-transferencias/detalle/editar/route.js",
    "app/api/pos-transferencias/detalle/agregar/route.js",
    "app/api/pos-transferencias/agregarItem/route.js",
  ]) {
    const s = sinComentarios(f);
    const fila = s.search(/bloquearFilaDelPedido\(tx, /);
    const rechazo = s.indexOf("if (fila?.estado === ESTADO_PEDIDO.CANCELADO) return CANCELADO_EN_EL_MEDIO;");
    const escribe = s.search(/tx\.posTransferenciaDetalle\.(create|update)\(/);
    assert.ok(fila > -1 && rechazo > fila && escribe > rechazo, `${f}: no rechaza el cancelado antes de escribir`);
  }
});
