// EL DEPÓSITO CANCELA UN PEDIDO DE LOCAL, EMPEZADO O NO.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/pos-transferencias/cancelarDesdeElDeposito.test.mjs
//
// Regla de Emanuel (2026-10-23). Hasta acá `/api/pos-transferencias/cancelar`
// le contestaba 403 al usuario del depósito —solo cancelaba el admin sin
// local— y un pedido empezado quedaba sin forma de sacarlo.
//
// Las respuestas son las REALES de la sección 15 de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs` contra erpazul_al, donde
// además se midió el stock antes y después de cada cancelación y se corrió la
// carrera de 20 vueltas contra un envío.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dep = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const sinComentarios = (rel) =>
  readFileSync(rel, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
const ruta = sinComentarios("app/api/pos-transferencias/cancelar/route.js");

const OK = { status: 200, cuerpo: { ok: true, item: null, error: null } };

test("sin empezar y empezado: el depósito cancela, con la respuesta de siempre", () => {
  assert.deepEqual(dep.depositoCancelarSinEmpezar, OK);
  assert.deepEqual(dep.depositoCancelarEmpezado, OK);
  // El empezado lo estaba de verdad: una línea decidida antes de cancelar.
  assert.ok(dep.depositoCancelarDetalle.cuerpo.item.detalles.some((d) => d.revisadoEn != null));
  assert.equal(dep.depositoCancelarDetalle.cuerpo.item.encabezado.estado, "Solicitado");
});

test("el local sigue sin poder cancelar uno empezado (409, como hoy)", () => {
  assert.deepEqual(dep.depositoCancelarElLocalEmpezado, {
    status: 409,
    cuerpo: { ok: false, error: "El depósito ya está preparando tu pedido. Ya no se puede cancelar desde el local." },
  });
});

test("uno ya enviado: 409, se maneja desde la transferencia", () => {
  assert.deepEqual(dep.depositoCancelarYaEnviado, {
    status: 409,
    cuerpo: { ok: false, error: "El pedido ya se envió. Se maneja desde la transferencia." },
  });
});

test("cancelado, ya no está en Pedidos de locales", () => {
  const { pb } = dep.depositoCancelarIds;
  assert.ok(dep.depositoCancelarSolicitados.cuerpo.items.some((s) => s.id === pb), "antes no estaba: la prueba no dice nada");
  assert.ok(!dep.depositoCancelarSolicitados.cuerpo.items.some((s) => s.id === pb && s.depositoEmpezo === false), "no estaba empezado");
  assert.ok(!dep.depositoCancelarSolicitadosDespues.cuerpo.items.some((s) => s.id === pb));
});

test("LA CARRERA: 20 vueltas cancelando mientras otro envía, nunca las dos cosas, y cayó de los dos lados", () => {
  const m = dep.depositoCarreraCancelarEnviar;
  assert.equal(m.vueltas, 20);
  assert.equal(m.ambas, 0, `${m.ambas} pedidos cancelados Y con transferencia`);
  assert.equal(m.ninguna, 0);
  assert.equal(m.cancelo + m.envio, m.vueltas);
  assert.ok(m.cancelo > 0 && m.envio > 0, "la carrera no cayó de los dos lados: no se ejerció");
  assert.equal(m.stockMovidoAlCancelar, 0, "una cancelación movió stock");
});

test("el envío que perdió contra la cancelación dice que se canceló, nunca que el local cambió algo", () => {
  const m = dep.depositoCarreraCancelarEnviar;
  assert.ok(m.cancelo > 1, "la cancelación ganó una vez o ninguna: el mensaje casi no se midió");
  assert.equal(m.enviarDijoCancelado, m.cancelo);
  assert.equal(m.enviarDijoElLocalCambio, 0);
  const SE_CANCELO = { status: 409, cuerpo: { ok: false, error: "Este pedido se canceló." } };
  assert.deepEqual(dep.depositoEnviarPerdioContraCancelar, SE_CANCELO);
  // Y enviar uno que ya estaba cancelado, lo mismo (no un 404 mudo).
  assert.deepEqual(dep.depositoEnviarYaCancelado, SE_CANCELO);
});

test("la forma de enviar: el cancelado se pregunta adentro del bloqueo, antes de comparar las líneas", () => {
  const enviar = sinComentarios("app/api/pos-transferencias/enviar/route.js");
  const tx = enviar.indexOf("prisma.$transaction(async (tx) =>");
  const fila = enviar.indexOf("const fila = await bloquearFilaDelPedido(tx, pos.id);");
  const cancelado = enviar.indexOf('if (fila?.estado === ESTADO_PEDIDO.CANCELADO) {');
  const firma = enviar.indexOf("firmaDeLineas(ahora) !== firmaDeLineas(pos.detalles)");
  assert.ok(tx > -1 && fila > tx && cancelado > fila && firma > cancelado, "el orden no es transacción → fila → cancelado → líneas");
  assert.match(enviar, /const MENSAJE_SE_CANCELO = "Este pedido se canceló\.";/);
});

test("la forma: un depósito DEL PEDIDO, con el permiso de enviar, adentro del mismo bloqueo", () => {
  assert.match(ruta, /const PERMISO_DEL_DEPOSITO = "pos_transferencias\.enviar";/);
  assert.match(ruta, /checkPerm\(session, PERMISO_DEL_DEPOSITO\)\.ok/);
  // Es un depósito de ESTE pedido y es un depósito. Decía "el origen": desde el
  // 2026-10-28 los depósitos de la empresa del local arman el mismo pedido y
  // cualquiera lo cancela; uno de otra empresa sigue en el 403 (sección 15b).
  assert.match(ruta, /localDeSesion && puedeComoDeposito && \(await esDepositoDelPedido\(prisma, localDeSesion, pos\)\)/);
  assert.match(ruta, /esDelDeposito = !!local\?\.es_deposito;/);
  // El local sigue pidiendo pedidos.editar: el permiso del depósito no le alcanza.
  assert.match(ruta, /if \(!esAdmin && !esDelDeposito\) \{[\s\S]*?permisos\.includes\("pedidos\.editar"\)/);
  // Ya salió: se contesta antes y ADENTRO del bloqueo (si salió mientras esperaba).
  const tx = ruta.indexOf("prisma.$transaction(async (tx) =>");
  const fila = ruta.indexOf("bloquearFilaDelPedido(tx, posId)");
  const salio = ruta.indexOf('if (YA_SALIO.includes(fila?.estado)) return "YA_SALIO";');
  const marca = ruta.indexOf("tx.posTransferencia.updateMany(");
  assert.ok(tx > -1 && fila > tx && salio > fila && marca > salio, "el orden no es transacción → fila → ya salió → marcar");
  // Y no toca stock: no hay nada que revertir porque nada se movió.
  assert.doesNotMatch(ruta, /stockLocal\./);
});
