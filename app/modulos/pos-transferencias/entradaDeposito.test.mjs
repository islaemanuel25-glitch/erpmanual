// "PEDIDOS DE LOCALES": LA ENTRADA DEL DEPÓSITO EN EL CELULAR.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pos-transferencias/entradaDeposito.test.mjs
//
// Diseño aprobado por Emanuel (2026-10-22): título y Volver en el shell, sin la
// cinta ni el "Usuario / Modo" ni el "← Volver" escrito a mano; "Para
// preparar" con una tarjeta por pedido de local, el más viejo arriba, con
// "Nuevo" o "Preparando · N de M", el número, cuándo, cuántos y quién lo pidió,
// y "Preparar" o "Seguir preparando"; abajo, "Transferencia sin pedido" con
// los selectores de siempre. Un local ve la pantalla de siempre.
//
// Montada con el arnés de Pedidos y las respuestas REALES de las rutas del
// depósito (sección 14 de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`).

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const A = await import("../pedidos/montarPantallaPedidos.mjs");
const { default: Pagina } = await import("./page.jsx");

afterEach(A.desmontarTodo);

const dep = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const ids = dep.depositoIds;

const tarjetas = () => [...document.querySelectorAll("[data-pedido-para-preparar]")];
const pill = (t) => t.querySelector("span.inline-block")?.textContent.trim() ?? null;
const lineas = (t) => [...t.querySelectorAll("p")].map((p) => p.textContent);
const boton = (t) => t.querySelector("button");
const CUANDO = "(hoy|ayer|\\d\\d/\\d\\d) \\d\\d:\\d\\d";

const montarEntrada = ({ solicitados, me = dep.depositoMe, opciones = dep.depositoOpciones, ancho = "telefono" } = {}) =>
  A.montar({
    pagina: Pagina,
    ancho,
    inicio: A.real.carritoVacio,
    otras: {
      "/api/me": me,
      "/api/operador/me": dep.depositoOperadorMe,
      "/api/pos-transferencias/opciones": opciones,
      "/api/pos-transferencias/solicitados": solicitados,
    },
  });

test("el fixture: el pedido nuevo, el empezado y el admin, como los devuelve la ruta", () => {
  const nuevo = dep.depositoSolicitadosNuevo.cuerpo.items.find((i) => i.id === ids.p1);
  assert.equal(nuevo.depositoEmpezo, false);
  assert.equal(nuevo.revisados, 0);
  assert.equal(nuevo.itemCount, 5);
  const trabajando = dep.depositoSolicitadosTrabajando.cuerpo.items.find((i) => i.id === ids.p1);
  assert.equal(trabajando.depositoEmpezo, true);
  assert.equal(trabajando.revisados, 5);
  assert.equal(trabajando.itemCount, 6);
  assert.equal(dep.depositoSolicitadosTrasEnviar.cuerpo.items.length, 0);
  assert.equal(dep.depositoOpciones.cuerpo.modo, "deposito");
  assert.equal(dep.depositoAdminOpciones.cuerpo.modo, "admin");
  assert.equal(dep.depositoOpcionesDelLocal.cuerpo.modo, "local");
});

test("título y Volver en el shell; sin cinta, sin Usuario / Modo, sin Volver escrito a mano", async () => {
  await montarEntrada({ solicitados: dep.depositoSolicitadosNuevo });
  assert.equal(A.tituloShell(), "Pedidos de locales");
  assert.ok(A.boton("Volver", A.filaShell()), "no hay Volver en el shell");
  assert.ok(!A.boton("← Volver", A.contenido()), "quedó el Volver escrito a mano");
  const t = A.contenido().textContent;
  assert.doesNotMatch(t, /POS · Transferencias/, "quedó la cinta");
  assert.doesNotMatch(t, /Usuario:|Modo:/, "quedó el Usuario / Modo");
  await A.tocar(A.boton("Volver", A.filaShell()));
  assert.deepEqual(A.navegacion, [["back"]]);
});

test("un pedido Nuevo: el local, el estado, el número, cuándo, cuántos y quién; Preparar abre ESE pedido", async () => {
  await montarEntrada({ solicitados: dep.depositoSolicitadosNuevo });
  assert.match(A.contenido().textContent, /Para preparar/);
  const [t] = tarjetas();
  assert.equal(Number(t.dataset.pedidoParaPreparar), ids.p1);
  assert.equal(t.querySelector(".font-semibold").textContent, ids.local);
  assert.match(t.querySelector(".font-semibold").className, /\btext-lg2\b/, "el local no va en 17 px");
  assert.equal(pill(t), "Nuevo");
  const [primera, segunda] = lineas(t);
  assert.match(primera, new RegExp(`^Pedido #${ids.p1} · ${CUANDO} · 5 productos$`));
  assert.equal(segunda, `Lo pidió ${ids.pidio}`);
  const b = boton(t);
  assert.equal(b.textContent.trim(), "Preparar");
  assert.match(b.className, /\bsunmi-btn-primary\b/);
  await A.tocar(b);
  assert.deepEqual(A.navegacion.at(-1), ["push", `/modulos/pos-transferencias/nueva?posId=${ids.p1}`]);
});

test("uno empezado: Preparando · 5 de 6 y Seguir preparando, en slate", async () => {
  await montarEntrada({ solicitados: dep.depositoSolicitadosTrabajando });
  const [t] = tarjetas();
  assert.equal(pill(t), "Preparando · 5 de 6");
  assert.match(lineas(t)[0], / · 6 productos$/);
  assert.equal(boton(t).textContent.trim(), "Seguir preparando");
  assert.match(boton(t).className, /\bsunmi-btn-slate\b/);
});

test("el admin ve los pedidos de todos los locales, el más viejo arriba", async () => {
  await montarEntrada({ solicitados: dep.depositoAdminSolicitados, me: dep.depositoAdminMe, opciones: dep.depositoAdminOpciones });
  const items = dep.depositoAdminSolicitados.cuerpo.items;
  assert.ok(items.length > 1);
  const esperados = [...items].sort((a, b) => Date.parse(a.solicitadoAt) - Date.parse(b.solicitadoAt)).map((i) => i.id);
  assert.deepEqual(tarjetas().map((t) => Number(t.dataset.pedidoParaPreparar)), esperados);
  // La ruta los manda del más nuevo al más viejo: el orden es de la pantalla.
  assert.notDeepEqual(items.map((i) => i.id), esperados);
  // Y cada botón abre SU pedido: con uno solo, uno que abriera siempre el
  // primero pasaría.
  for (const t of tarjetas()) {
    await A.tocar(boton(t));
    assert.deepEqual(A.navegacion.at(-1), ["push", `/modulos/pos-transferencias/nueva?posId=${t.dataset.pedidoParaPreparar}`]);
  }
});

test("sin pedidos: No hay pedidos para preparar", async () => {
  await montarEntrada({ solicitados: dep.depositoSolicitadosTrasEnviar });
  assert.equal(tarjetas().length, 0);
  assert.match(A.contenido().textContent, /No hay pedidos para preparar/);
});

test("Transferencia sin pedido: abajo, y abre los selectores de siempre, que inician la de siempre", async () => {
  await montarEntrada({ solicitados: dep.depositoSolicitadosNuevo });
  const sinPedido = A.boton("Transferencia sin pedido", A.contenido());
  assert.ok(sinPedido, "no está el botón");
  assert.match(sinPedido.className, /\bsunmi-btn-slate\b/);
  assert.ok(!A.modal(), "la hoja arrancó abierta");
  await A.tocar(sinPedido);
  assert.ok(A.modal(), "no se abrió la hoja");
  assert.match(A.modal().textContent, /Depósito origen/);
  assert.match(A.modal().textContent, new RegExp(ids.local));
  await A.tocar(A.boton("Iniciar transferencia desde depósito", A.modal()));
  const origen = dep.depositoOpciones.cuerpo.origen.id;
  const destino = dep.depositoOpciones.cuerpo.destinos[0].id;
  assert.deepEqual(A.navegacion.at(-1), ["push", `/modulos/pos-transferencias/nueva?origenId=${origen}&destinoId=${destino}`]);
});

test("un local, en el celular, ve la pantalla de siempre", async () => {
  await montarEntrada({ solicitados: { status: 200, cuerpo: { ok: true, items: [] } }, me: A.real.me, opciones: dep.depositoOpcionesDelLocal });
  assert.ok(!document.querySelector("[data-entrada-deposito]"), "se montó la del depósito");
  assert.match(A.contenido().textContent, /POS · Transferencias/);
  assert.match(A.contenido().textContent, /Crear pedido manual/);
});
