// `set-cantidad` DE A UNO POR PAR: UNA LÍNEA POR PRODUCTO, Y NINGÚN BORRADOR
// AL LADO DE UN PEDIDO ENVIADO.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/pedidos/setCantidadSerializada.test.mjs
//
// Dos toques rápidos al + sobre un producto en 0 viajaban juntos, ninguno
// encontraba la línea y los dos la creaban. Y una cantidad que llegaba junto con
// el envío no encontraba borrador y abría uno nuevo al lado del pedido enviado.
//
// Dos miradas, porque los candados no tocan la base:
//
// 1. LAS MEDICIONES DE VERDAD. `scripts/pruebas-db/pedidosEnviarCancelar.mjs`,
//    sección 8, corre las dos carreras contra erpazul_al y deja los números en
//    el fixture: una corrida con la ruta de ANTES del bloqueo
//    (RUTA_ANTES_DEL_BLOQUEO=1) y otra con la de hoy. Si alguien regenera el
//    fixture con la ruta sin bloqueo, este candado se pone rojo.
//
// 2. LA FORMA DE LA RUTA. Lo que hace que las mediciones den cero: los dos
//    bloqueos, y el ORDEN de las consultas, que también se midió —preguntar por
//    el pedido enviado antes de buscar el borrador dejó 7 de 20 borradores
//    nuevos, con los dos bloqueos puestos—.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));
const MENSAJE = "Hay un pedido enviado esperando al depósito. Cancelalo para pedir otra cosa.";

// Sin comentarios: un candado que mira código no puede encontrar su patrón en
// la prosa (CLAUDE.md, regla 5).
const fuente = readFileSync("app/api/pedidos/set-cantidad/route.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

test("la carrera de los dos toques: con la ruta de antes daba duplicados; con la de hoy, cero", () => {
  const antes = real.carreraAntesDelBloqueo;
  const hoy = real.carreraConBloqueo;
  assert.ok(antes && hoy, "faltan las mediciones de la sección 8 en el fixture");
  assert.ok(antes.duplicados > 0, "la medición de antes no muestra la carrera: no prueba nada");
  assert.ok(hoy.veces >= 20, "menos de 20 carreras");
  assert.equal(hoy.duplicados, 0, `con el bloqueo quedaron ${hoy.duplicados} productos dos veces`);
  assert.equal(hoy.borradores, 1, "la primera carrera abrió dos borradores para el par");
});

test("la carrera con el envío: con la ruta de antes abría borradores; con la de hoy, ninguno", () => {
  const antes = real.envioAntesDelBloqueo;
  const hoy = real.envioConBloqueo;
  assert.ok(antes && hoy, "faltan las mediciones de la sección 8 en el fixture");
  assert.ok(antes.nuevos > 0, "la medición de antes no muestra la carrera");
  assert.ok(hoy.vueltas >= 20);
  assert.equal(hoy.nuevos, 0, `con el bloqueo se abrieron ${hoy.nuevos} borradores al lado del enviado`);
  // Cada vuelta terminó en una de las dos formas buenas: la cantidad entró al
  // pedido antes de enviarse, o contestó 409.
  assert.equal(hoy.conflictos + hoy.entraronAntes, hoy.vueltas);
  assert.ok(hoy.conflictos > 0, "ninguna vuelta llegó tarde: no se ejerció el 409");
});

test("con el pedido enviado, la ruta contesta 409 con el mensaje", () => {
  const r = real.setCantidadConPedidoEnviado;
  assert.equal(r.status, 409);
  assert.deepEqual(r.cuerpo, { ok: false, error: MENSAJE });
});

test("la forma: una transacción, el bloqueo del par primero y la fila del borrador bloqueada", () => {
  const tx = fuente.indexOf("prisma.$transaction(async (tx) =>");
  const par = fuente.indexOf("SELECT pg_advisory_xact_lock(${depositoId}::int, ${localId}::int)");
  const borrador = fuente.indexOf('estado: { in: ["Borrador", "Preparando"] }', tx);
  const fila = fuente.indexOf('FROM "PosTransferencia" WHERE id = ${pos.id} FOR UPDATE');
  assert.ok(tx > -1, "no hay transacción");
  assert.ok(par > tx, "falta el bloqueo del par depósito→local adentro de la transacción");
  assert.ok(borrador > par, "el borrador se busca antes del bloqueo del par");
  assert.ok(fila > borrador, "la fila del borrador no se bloquea con FOR UPDATE");
  // Y lo que escribe va por `tx`, no por el cliente de afuera.
  assert.doesNotMatch(fuente, /prisma\.posTransferenciaDetalle\./, "una escritura de líneas quedó afuera de la transacción");
});

test("la forma: el pedido enviado se pregunta DESPUÉS de bloquear el borrador, con sinCancelados", () => {
  const fila = fuente.indexOf("FOR UPDATE");
  const enviado = fuente.indexOf('sinCancelados({ estado: "Solicitado", origenId: depositoId, destinoId: localId })');
  const crear = fuente.indexOf("tx.posTransferencia.create(");
  assert.ok(enviado > -1, "no se pregunta por el pedido enviado con el criterio de solicitar");
  assert.ok(enviado > fila, "se pregunta por el enviado antes de bloquear el borrador: así se abrían 7 de 20");
  assert.ok(crear > enviado, "el borrador se crea antes de preguntar por el enviado");
  assert.ok(fuente.includes(MENSAJE), "falta el mensaje del 409");
});

test("el borrador viejo de verdad —líneas repetidas que hizo la ruta de antes— queda con una", () => {
  const v = real.borradorViejoConRepetidos;
  assert.ok(v, "falta la medición 8c en el fixture");
  assert.equal(v.cambiar.antes, 2, "el producto no estaba repetido: no prueba nada");
  assert.deepEqual({ despues: v.cambiar.despues, cantidad: v.cambiar.cantidad }, { despues: 1, cantidad: 5 }, "cambiar la cantidad no dejó una línea con la nueva");
  assert.equal(v.sacar.antes, 2);
  assert.equal(v.sacar.despues, 0, "la ✕ dejó una de las dos líneas");
});

test("la forma: un borrador con el producto dos veces queda con una línea", () => {
  assert.match(fuente, /const \[existente, \.\.\.sobrantes\] = lineas;/);
  assert.match(fuente, /deleteMany\(\{ where: \{ id: \{ in: sobrantes\.map\(\(l\) => l\.id\) \} \} \}\)/, "las líneas sobrantes no se borran");
  assert.match(fuente, /deleteMany\(\{ where: \{ id: \{ in: lineas\.map\(\(l\) => l\.id\) \} \} \}\)/, "con 0 no se borran todas las líneas del producto");
});
