// `set-cantidad` DE A UNO POR PAR: UNA LÍNEA POR PRODUCTO, Y NINGÚN BORRADOR
// AL LADO DE UN PEDIDO ENVIADO.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/pedidos/setCantidadSerializada.test.mjs
//
// Dos toques rápidos al + sobre un producto en 0 viajaban juntos, ninguno
// encontraba la línea y los dos la creaban. Y una cantidad que llegaba junto con
// el envío no encontraba borrador y abría uno nuevo al lado del pedido enviado.
//
// Desde el 2026-10-22 esa cantidad ya no contesta 409: entra al pedido enviado
// mientras el depósito no lo empezó (los candados de eso están en
// `sumarAlEnviado.test.mjs`). Lo que sigue valiendo es que no se abre nada al
// lado.
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
//    bloqueos, y el ORDEN de las consultas, que también se midió dos veces —con
//    una sola pregunta por el pedido enviado, antes del borrador, se abrieron 7
//    de 20 borradores nuevos el 2026-10-21 y 13 de 20 el 2026-10-22—.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));

// Sin comentarios: un candado que mira código no puede encontrar su patrón en
// la prosa (CLAUDE.md, regla 5).
const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
const fuente = sinComentarios("app/api/pedidos/set-cantidad/route.js");
const bloqueo = sinComentarios("lib/pedidos/bloqueoDelPedido.js");

test("la carrera de los dos toques: con la ruta de antes daba duplicados; con la de hoy, cero", () => {
  const antes = real.carreraAntesDelBloqueo;
  const hoy = real.carreraConBloqueo;
  assert.ok(antes && hoy, "faltan las mediciones de la sección 8 en el fixture");
  assert.ok(antes.duplicados > 0, "la medición de antes no muestra la carrera: no prueba nada");
  assert.ok(hoy.veces >= 20, "menos de 20 carreras");
  assert.equal(hoy.duplicados, 0, `con el bloqueo quedaron ${hoy.duplicados} productos dos veces`);
  assert.equal(hoy.borradores, 1, "la primera carrera abrió dos borradores para el par");
});

test("la carrera con el envío: con la ruta de antes abría borradores; con la de hoy, ninguno, y la cantidad entra", () => {
  const antes = real.envioAntesDelBloqueo;
  const hoy = real.envioConBloqueo;
  assert.ok(antes && hoy, "faltan las mediciones de la sección 8 en el fixture");
  assert.ok(antes.nuevos > 0, "la medición de antes no muestra la carrera");
  assert.ok(hoy.vueltas >= 20);
  assert.equal(hoy.nuevos, 0, `con el bloqueo se abrieron ${hoy.nuevos} borradores al lado del enviado`);
  // Antes o después del envío, la cantidad entró al MISMO pedido.
  assert.equal(hoy.entraronAntes, hoy.vueltas, "alguna cantidad fue a parar a otro pedido");
  assert.equal(hoy.conflictos, 0, "un pedido recién enviado, sin empezar, contestó 409");
});

test("las respuestas de la regla vieja no quedan en el fixture", () => {
  // Un candado montado sobre una respuesta que la ruta ya no da quedaría verde
  // probando lo que no pasa.
  for (const vieja of ["setCantidadConPedidoEnviado", "setCantidadConPedidoEnviadoCarrera", "carritoConPedidoEnviadoEnvio"]) {
    assert.ok(!(vieja in real), `el fixture todavía trae ${vieja}`);
  }
});

test("los dos bloqueos: el consultivo del par y la fila del pedido FOR UPDATE", () => {
  assert.ok(bloqueo.includes("SELECT pg_advisory_xact_lock(${Number(origenId)}::int, ${Number(destinoId)}::int)"), "falta el bloqueo del par");
  assert.ok(bloqueo.includes('SELECT id, estado FROM "PosTransferencia" WHERE id = ${Number(posId)} FOR UPDATE'), "falta el FOR UPDATE de la fila");
});

test("la forma: una transacción, el bloqueo del par primero y las filas bloqueadas", () => {
  const tx = fuente.indexOf("prisma.$transaction(async (tx) =>");
  const par = fuente.indexOf("bloquearParDelPedido(tx, depositoId, localId)");
  const borrador = fuente.indexOf('estado: { in: ["Borrador", "Preparando"] }', tx);
  const filaBorrador = fuente.indexOf("bloquearFilaDelPedido(tx, pos.id)");
  const filaEnviado = fuente.indexOf("bloquearFilaDelPedido(tx, enviado.id)");
  assert.ok(tx > -1, "no hay transacción");
  assert.ok(par > tx, "falta el bloqueo del par depósito→local adentro de la transacción");
  assert.ok(borrador > par, "el borrador se busca antes del bloqueo del par");
  assert.ok(filaBorrador > borrador, "la fila del borrador no se bloquea");
  assert.ok(filaEnviado > par, "la fila del pedido enviado no se bloquea");
  // Y lo que escribe va por `tx`, no por el cliente de afuera.
  assert.doesNotMatch(fuente, /prisma\.posTransferenciaDetalle\./, "una escritura de líneas quedó afuera de la transacción");
});

test("la forma: el pedido enviado se pregunta antes Y después del borrador, y recién después se crea uno", () => {
  const def = fuente.indexOf("const tomarEnviado = async () =>");
  const criterio = fuente.indexOf('sinCancelados({ estado: "Solicitado", origenId: depositoId, destinoId: localId })');
  const borrador = fuente.indexOf('estado: { in: ["Borrador", "Preparando"] }');
  const llamadas = [...fuente.matchAll(/await tomarEnviado\(\)/g)].map((m) => m.index);
  const crear = fuente.indexOf("tx.posTransferencia.create(");
  assert.ok(def > -1 && criterio > def, "no se pregunta por el enviado con el criterio de solicitar");
  assert.equal(llamadas.length, 2, "el enviado se pregunta una sola vez: así se abrían 13 de 20");
  assert.ok(llamadas[0] < borrador && llamadas[1] > borrador, "las dos preguntas no rodean la búsqueda del borrador");
  assert.ok(crear > llamadas[1], "el borrador se crea antes de la segunda pregunta");
});

test("el borrador viejo de verdad —líneas repetidas que hizo la ruta de antes— queda con una", () => {
  const v = real.borradorViejoConRepetidos;
  assert.ok(v, "falta la medición 8c en el fixture");
  assert.equal(v.cambiar.antes, 2, "el producto no estaba repetido: no prueba nada");
  assert.deepEqual({ despues: v.cambiar.despues, cantidad: v.cambiar.cantidad }, { despues: 1, cantidad: 5 }, "cambiar la cantidad no dejó una línea con la nueva");
  assert.equal(v.sacar.antes, 2);
  assert.equal(v.sacar.despues, 0, "la ✕ dejó una de las dos líneas");
});

test("la forma: un pedido con el producto dos veces queda con una línea", () => {
  assert.match(fuente, /const \[existente, \.\.\.sobrantes\] = lineas;/);
  assert.match(fuente, /deleteMany\(\{ where: \{ id: \{ in: sobrantes\.map\(\(l\) => l\.id\) \} \} \}\)/, "las líneas sobrantes no se borran");
  assert.match(fuente, /deleteMany\(\{ where: \{ id: \{ in: lineas\.map\(\(l\) => l\.id\) \} \} \}\)/, "con 0 no se borran todas las líneas del producto");
});
