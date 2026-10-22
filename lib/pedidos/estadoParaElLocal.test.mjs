// LA TRADUCCIÓN DEL ESTADO DE UN PEDIDO A PALABRAS DEL LOCAL.
//
//   node --test lib/pedidos/estadoParaElLocal.test.mjs
//
// La lista de Emanuel (2026-10-22) y los estados que no entraban en ella,
// escritos a mano acá —no leídos de la función— para que un cambio en la tabla
// se tenga que decidir dos veces. Y que la usen las tres pantallas: es UNA
// traducción, no una por pantalla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { estadoParaElLocal, pasaFiltroHistorial, FILTRO_HISTORIAL, SE_MANEJA_EN_LA_ENTRADA } from "./estadoParaElLocal.js";

test("la lista pedida", () => {
  assert.equal(estadoParaElLocal({ estado: "Borrador" }), "Borrador");
  assert.equal(estadoParaElLocal({ estado: "Solicitado", depositoEmpezo: false }), "Enviado");
  assert.equal(estadoParaElLocal({ estado: "Solicitado", depositoEmpezo: true }), "Preparando");
  assert.equal(estadoParaElLocal({ estado: "Enviado", transferenciaEstado: "Enviada" }), "En camino");
  assert.equal(estadoParaElLocal({ estado: "Enviado", transferenciaEstado: "Recibida" }), "Recibido");
  assert.equal(estadoParaElLocal({ estado: "Cancelado" }), "Cancelado");
});

test("los que no entraban en la lista", () => {
  assert.equal(estadoParaElLocal({ estado: "Preparando" }), "Borrador");
  assert.equal(estadoParaElLocal({ estado: "Enviando" }), "Preparando");
  for (const t of ["Pendiente", "Recibiendo", "Confirmando"]) {
    assert.equal(estadoParaElLocal({ estado: "Enviado", transferenciaEstado: t }), "En camino", t);
  }
  for (const t of ["Cancelando", "Cancelada"]) {
    assert.equal(estadoParaElLocal({ estado: "Enviado", transferenciaEstado: t }), "Cancelado", t);
  }
  assert.equal(estadoParaElLocal({ estado: "Enviado", transferenciaEstado: null }), "En camino");
  assert.equal(estadoParaElLocal({ estado: "Raro" }), "Raro");
});

test("el filtro del historial", () => {
  const todos = ["Borrador", "Enviado", "Preparando", "En camino", "Recibido", "Cancelado"];
  const pasan = (f) => todos.filter((e) => pasaFiltroHistorial(e, f));
  assert.deepEqual(pasan(FILTRO_HISTORIAL.TODOS), todos);
  assert.deepEqual(pasan(FILTRO_HISTORIAL.EN_CURSO), ["Borrador", "Enviado", "Preparando", "En camino"]);
  assert.deepEqual(pasan(FILTRO_HISTORIAL.RECIBIDOS), ["Recibido"]);
  assert.deepEqual(pasan(FILTRO_HISTORIAL.CANCELADOS), ["Cancelado"]);
  assert.deepEqual([...SE_MANEJA_EN_LA_ENTRADA], ["Borrador", "Enviado", "Preparando"]);
});

test("la usan la entrada, el historial y el detalle, y ninguna traduce por su cuenta", () => {
  const sinComentarios = (ruta) =>
    readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
  const pantallas = [
    "app/modulos/pedidos/page.jsx",
    "components/pedidos/HistorialCelular.jsx",
  ];
  for (const ruta of pantallas) {
    const codigo = sinComentarios(ruta);
    assert.match(codigo, /estadoParaElLocal\(/, `${ruta} no usa la traducción`);
    assert.doesNotMatch(codigo, /["']En camino["']|["']Recibido["']/, `${ruta} escribe un estado en palabras a mano`);
  }
});
