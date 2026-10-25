// EL HISTORIAL DE PEDIDOS EN EL CELULAR.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/historialCelular.test.mjs
//
// Pedido de Emanuel (2026-10-22): título y Volver en el shell; sin la cinta,
// sin el separador "Filtros", sin buscador ni desplegable; arriba el filtro
// Todos / En curso / Recibidos / Cancelados; la lista con la MISMA fila que
// "Pedidos anteriores" de la entrada, el más nuevo arriba; tocar uno abre su
// detalle, y uno en curso va a la entrada. En la computadora, la pantalla de
// siempre.
//
// Montada con las respuestas REALES de las rutas sobre erpazul_al
// (`scripts/pruebas-db/pedidosEnviarCancelar.mjs`, sección 13): un local con
// un pedido de cada estado —en curso, cancelado, recibido y en camino— y el
// local de las carreras, con más de cien pedidos en tres páginas.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const {
  real, montar, desmontarTodo, contenido, filaShell, tituloShell, navegacion, tocar, boton, botones, llamadas,
} = await import("./montarPantallaPedidos.mjs");
const { default: PaginaHistorialPedidos } = await import("./historial/page.jsx");

afterEach(desmontarTodo);

const ids = real.historialIds;
const filas = () => [...document.querySelectorAll("[data-pedido-anterior]")];
const numeros = () => filas().map((f) => Number(f.getAttribute("data-pedido-anterior")));
const fila = (id) => filas().find((f) => Number(f.getAttribute("data-pedido-anterior")) === id) ?? null;
const lineaDe = (id) => fila(id)?.querySelectorAll("p")[1]?.textContent ?? null;
const filtro = () => contenido().querySelector('[role="group"][aria-label="Estado"]');
const opcionesDelFiltro = () => botones(filtro()).map((b) => b.textContent.trim());
const elegida = () => botones(filtro()).find((b) => b.getAttribute("aria-pressed") === "true")?.textContent.trim() ?? null;
const CUANDO = "(hoy \\d\\d:\\d\\d|\\d\\d/\\d\\d)";

const montarHistorial = (extra = {}) =>
  montar({ pagina: PaginaHistorialPedidos, historial: real.historialTodos, inicio: real.historialCarrito, ...extra });

test("el fixture: un pedido de cada estado, del más nuevo al más viejo", () => {
  const h = real.historialTodos.cuerpo.items.map((p) => [p.posId, p.estado, p.transferenciaEstado]);
  assert.deepEqual(h, [
    [ids.pEnCurso, "Solicitado", null],
    [ids.pCancelado, "Cancelado", null],
    [ids.pRecibido, "Enviado", "Recibida"],
    [ids.pCamino, "Enviado", "Enviada"],
  ]);
  assert.equal(real.historialCarrito.cuerpo.pendiente.posId, ids.pEnCurso);
  assert.equal(real.historialCarrito.cuerpo.pendiente.depositoEmpezo, true);
  assert.equal(real.historialCarritoEnviado.cuerpo.pendiente.depositoEmpezo, false);
  assert.ok(real.historialLargo.length >= 2, "el historial largo no pasa de una página");
});

test("el título y el Volver van en el shell, y el Volver vuelve a la entrada de Pedidos", async () => {
  await montarHistorial();
  assert.equal(tituloShell(), "Historial de pedidos");
  const volver = boton("Volver", filaShell());
  assert.ok(volver, "no hay Volver en el shell");
  assert.ok(!boton("Volver", contenido()), "el Volver quedó adentro del contenido");
  await tocar(volver);
  assert.deepEqual(navegacion, [["push", "/modulos/pedidos"]]);
});

test("sin la cinta, sin el separador Filtros, sin buscador ni desplegable", async () => {
  await montarHistorial();
  assert.ok(document.querySelector("[data-historial-celular]"), "no se montó el historial del celular");
  const t = contenido().textContent;
  assert.doesNotMatch(t, /Historial de Pedidos/, "quedó la cinta");
  assert.doesNotMatch(t, /Filtros/, "quedó el separador");
  assert.equal(contenido().querySelectorAll("input, select, textarea").length, 0, "quedó un buscador o un desplegable");
  assert.ok(!contenido().querySelector('[role="listbox"], [aria-haspopup]'), "quedó un desplegable");
});

test("arriba, el rótulo Estado y los cuatro filtros; por defecto, Todos", async () => {
  await montarHistorial();
  assert.ok(filtro(), "no está el filtro con el rótulo Estado");
  assert.equal(contenido().firstElementChild.textContent.startsWith("Estado"), true, "el filtro no va arriba");
  assert.deepEqual(opcionesDelFiltro(), ["Todos", "En curso", "Recibidos", "Cancelados"]);
  assert.equal(elegida(), "Todos");
});

test("Todos: los cuatro, el más nuevo arriba, cada uno con su estado en palabras", async () => {
  await montarHistorial();
  assert.deepEqual(numeros(), [ids.pEnCurso, ids.pCancelado, ids.pRecibido, ids.pCamino]);
  for (const f of filas()) assert.equal(f.querySelector("p").textContent, `Pedido #${f.getAttribute("data-pedido-anterior")}`);
  // El en curso ya lo empezó el depósito: Preparando, no Enviado.
  assert.match(lineaDe(ids.pEnCurso), new RegExp(`^Preparando · ${CUANDO} · 2 productos$`));
  assert.match(lineaDe(ids.pCancelado), new RegExp(`^Cancelado · ${CUANDO} · 1 producto$`));
  assert.match(lineaDe(ids.pRecibido), new RegExp(`^Recibido · ${CUANDO} · 2 productos$`));
  assert.match(lineaDe(ids.pCamino), new RegExp(`^En camino · ${CUANDO} · 1 producto$`));
});

test("sin empezar, el pedido en curso dice Enviado", async () => {
  await montar({ pagina: PaginaHistorialPedidos, historial: real.historialConEnviado, inicio: real.historialCarritoEnviado });
  assert.match(lineaDe(ids.pEnCurso), new RegExp(`^Enviado · ${CUANDO} · 2 productos$`));
});

test("los filtros: En curso junta Preparando y En camino; Recibidos y Cancelados, uno cada uno", async () => {
  await montarHistorial();
  const casos = [
    ["En curso", [ids.pEnCurso, ids.pCamino]],
    ["Recibidos", [ids.pRecibido]],
    ["Cancelados", [ids.pCancelado]],
    ["Todos", [ids.pEnCurso, ids.pCancelado, ids.pRecibido, ids.pCamino]],
  ];
  for (const [opcion, esperados] of casos) {
    await tocar(boton(opcion, filtro()));
    assert.equal(elegida(), opcion);
    assert.deepEqual(numeros(), esperados, `el filtro ${opcion}`);
  }
});

test("tocar uno en curso va a la entrada; uno recibido o cancelado, a SU detalle", async () => {
  await montarHistorial();
  await tocar(fila(ids.pEnCurso));
  await tocar(fila(ids.pCamino));
  await tocar(fila(ids.pRecibido));
  await tocar(fila(ids.pCancelado));
  assert.deepEqual(navegacion, [
    ["push", "/modulos/pedidos"],
    ["push", `/modulos/pedidos/historial/${ids.pCamino}`],
    ["push", `/modulos/pedidos/historial/${ids.pRecibido}`],
    ["push", `/modulos/pedidos/historial/${ids.pCancelado}`],
  ]);
});

test("un historial largo: lee todas las páginas de la ruta y pagina de a 25 con el paginador del celular", async () => {
  const { pedidos } = await montar({ pagina: PaginaHistorialPedidos, historial: real.historialLargo, inicio: real.carritoVacio });
  const total = real.historialLargo[0].cuerpo.total;
  const todos = real.historialLargo.flatMap((r) => r.cuerpo.items.map((p) => p.posId));
  assert.equal(todos.length, total);
  assert.deepEqual(
    llamadas(pedidos, "/api/pedidos/historial").map((p) => p.params.page),
    real.historialLargo.map((_, i) => String(i + 1))
  );
  assert.deepEqual(numeros(), todos.slice(0, 25));
  const paginador = document.querySelector('[data-paginador="compacto"]');
  assert.ok(paginador, "no está el paginador del celular");
  await tocar(paginador.querySelector('button[aria-label="Página siguiente"]'));
  assert.deepEqual(numeros(), todos.slice(25, 50));
});

// Desde el 2026-10-25 la computadora tiene el suyo: la vista HISTORIAL de
// `PedidosEscritorio`, con el filtro de estado y el renglón de "Pedidos
// anteriores". La pantalla vieja —cinta, buscador, "Ver detalle"— se borró.
test("en la computadora, el historial de la computadora, y Volver va a la entrada de Pedidos", async () => {
  await montarHistorial({ ancho: "escritorio" });
  assert.ok(!document.querySelector("[data-historial-celular]"), "se montó el del celular");
  assert.ok(document.querySelector('[data-vista="historial"]'), "no está el historial de la computadora");
  assert.doesNotMatch(contenido().textContent, /Historial de Pedidos/, "quedó la cinta de la pantalla vieja");
  assert.ok(!contenido().querySelector('input[placeholder="Buscar por nombre o código..."]'), "quedó el buscador de la pantalla vieja");
  assert.equal(contenido().querySelectorAll("[data-pedido-anterior]").length, real.historialTodos.cuerpo.items.length);
  const volver = [...contenido().querySelectorAll("button")].find((b) => b.textContent.trim() === "Volver");
  await tocar(volver);
  assert.deepEqual(navegacion.at(-1), ["push", "/modulos/pedidos"]);
});
