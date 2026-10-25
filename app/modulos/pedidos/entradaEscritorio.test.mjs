// LA PÁGINA DE ENTRADA DE PEDIDOS EN LA COMPUTADORA (2026-10-25).
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/entradaEscritorio.test.mjs
//
// `components/pedidos/PedidosEscritorio.jsx`, vista ENTRADA, montada por la
// página entera con el arnés (`montarPantallaPedidos.mjs`) y las respuestas
// REALES de las rutas del fixture, con la ventana de computadora. Lo que se
// afirma es lo que pidió Emanuel:
//   · la tarjeta "Pedido en curso" en sus cuatro estados —sin pedido,
//     borrador sin enviar, enviado esperando al depósito, preparando—, con
//     sus botones;
//   · Sumar y Cancelar preguntan ADENTRO de la página, no con un `confirm()`;
//   · "Ver pedido" es solo para mirar: sin − ni +, sin botones apagados;
//   · "Pedidos anteriores": los últimos cinco en renglones de anchos fijos, y
//     su "Ver pedido" abre el mismo detalle de solo mirar, sin ir al historial
//     viejo; "Ver todo el historial" abre la lista con el filtro de estado.
// El catálogo lo prueban `escritorio.test.mjs` y `escritorioNadaSeMueve.test.mjs`.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const { real, montar, desmontarTodo, tocar, llamadas, navegacion, dialogosNativos } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

const montarE = (r) => montar({ ...r, ancho: "escritorio" });
const conFecha = (r, fecha) => ({ ...r, cuerpo: { ...r.cuerpo, pendiente: { ...r.cuerpo.pendiente, solicitadoAt: fecha.toISOString() } } });
const enviadoHoy = () => conFecha(real.carritoPendiente, new Date());
const { local, deposito } = real.opciones.cuerpo;
const deDondeADonde = `${local.nombre} → ${deposito.nombre}`;

const vista = () => document.querySelector("[data-vista]")?.getAttribute("data-vista") ?? null;
const tarjeta = () => document.querySelector("[data-pedido-en-curso]");
const etiqueta = () => tarjeta().querySelector("[data-etiqueta-en-curso]");
const linea = () => tarjeta().querySelector("[data-linea-en-curso]").textContent;
const acciones = () => tarjeta().querySelector("[data-acciones-en-curso]");
const botonesDe = (dentro) => [...dentro.querySelectorAll("button")];
const textos = (dentro) => botonesDe(dentro).map((b) => b.textContent.trim());
const boton = (t, dentro = document.body) => botonesDe(dentro).find((b) => b.textContent.trim() === t) ?? null;
const anteriores = () => document.querySelector("[data-pedidos-anteriores]");
const renglonesAnteriores = (dentro = document) => [...dentro.querySelectorAll("[data-pedido-anterior]")];

// ── LOS CUATRO ESTADOS DE LA TARJETA ──────────────────────────────────────

test("se entra por la entrada, y la entrada no pide el catálogo", async () => {
  const { pedidos } = await montarE({ inicio: real.carritoBorrador });
  assert.equal(vista(), "entrada");
  assert.equal(llamadas(pedidos, "/api/pedidos/catalogo").length, 0, "la entrada pidió el catálogo");
  assert.ok(!document.querySelector("table"), "la entrada dibujó una tabla de productos");
});

test("SIN PEDIDO: borde normal, sin etiqueta ni número, «no tenés un pedido en curso» y Hacer un pedido", async () => {
  const { pedidos } = await montarE({ inicio: real.carritoVacio });
  assert.equal(tarjeta().getAttribute("data-pedido-en-curso"), "nada");
  assert.doesNotMatch(tarjeta().className, /sunmi-border-accent/, "sin pedido, el borde es el acento");
  for (const c of ["sunmi-bg-card", "rounded-xl2", "p-6", "sunmi-border"]) assert.match(tarjeta().className, new RegExp(c));
  assert.match(tarjeta().querySelector("h1").textContent, /Pedido al depósito/);
  assert.match(tarjeta().querySelector("h1").className, /font-bold/);
  assert.ok(!etiqueta(), "sin pedido hay etiqueta");
  assert.equal(linea(), deDondeADonde);
  assert.ok(!tarjeta().querySelector("[data-productos-en-curso]"));
  assert.match(acciones().textContent, /no tenés un pedido en curso/);
  assert.deepEqual(textos(acciones()), ["Hacer un pedido"]);
  assert.match(boton("Hacer un pedido").className, /sunmi-btn-primary/);
  await tocar(boton("Hacer un pedido"));
  assert.equal(vista(), "catalogo");
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(llamadas(pedidos, "/api/pedidos/catalogo").length, 1, "el catálogo no se pidió al abrirlo");
});

test("BORRADOR: «Sin enviar», borde de acento, se guarda solo, el número y Seguir armando", async () => {
  await montarE({ inicio: real.carritoBorrador });
  assert.equal(tarjeta().getAttribute("data-pedido-en-curso"), "borrador");
  assert.match(tarjeta().className, /sunmi-border-accent/);
  assert.equal(etiqueta().textContent, "Sin enviar");
  assert.match(etiqueta().querySelector("span").className, /sunmi-badge-accent/, "la etiqueta no va en el acento");
  assert.match(etiqueta().querySelector("span").className, /font-semibold/);
  assert.equal(linea(), `${deDondeADonde} · se guarda solo`);
  const n = tarjeta().querySelector("[data-productos-en-curso]");
  assert.match(n.textContent, /^2\s*productos en el pedido$/);
  assert.match(n.querySelector("span").className, /font-bold/);
  assert.deepEqual(textos(acciones()), ["Seguir armando"]);
  assert.match(boton("Seguir armando").className, /sunmi-btn-primary/);
  await tocar(boton("Seguir armando"));
  assert.equal(vista(), "catalogo");
});

test("ENVIADO: «Enviado · esperando al depósito», cuándo, y Ver pedido / Sumar productos / Cancelar pedido", async () => {
  await montarE({ inicio: enviadoHoy() });
  assert.equal(tarjeta().getAttribute("data-pedido-en-curso"), "enviado");
  assert.match(tarjeta().className, /sunmi-border-accent/);
  assert.equal(etiqueta().textContent, "Enviado · esperando al depósito");
  assert.match(linea(), new RegExp(`^${deDondeADonde} · enviado hoy \\d\\d:\\d\\d · todavía podés sumar productos$`));
  assert.deepEqual(textos(acciones()), ["Ver pedido", "Sumar productos", "Cancelar pedido"]);
  assert.match(boton("Ver pedido").className, /sunmi-btn-slate/);
  assert.match(boton("Sumar productos").className, /sunmi-btn-primary/);
  assert.match(boton("Cancelar pedido").className, /sunmi-btn-red/);
});

test("PREPARANDO: «Preparando en el depósito» y solo Ver pedido: ni cancelar ni sumar", async () => {
  await montarE({ inicio: conFecha(real.empezadoCarrito, new Date()) });
  assert.equal(tarjeta().getAttribute("data-pedido-en-curso"), "preparando");
  assert.equal(etiqueta().textContent, "Preparando en el depósito");
  assert.deepEqual(textos(acciones()), ["Ver pedido"]);
  assert.match(boton("Ver pedido").className, /sunmi-btn-slate/);
});

// ── LAS PREGUNTAS, ADENTRO DE LA PÁGINA ───────────────────────────────────

test("Sumar productos pregunta en la tarjeta: No deja todo igual; Sí, sumar abre el catálogo en modo sumar", async () => {
  await montarE({ inicio: enviadoHoy() });
  await tocar(boton("Sumar productos"));
  assert.match(acciones().textContent, /¿Sumar productos al pedido que ya enviaste\?/);
  assert.deepEqual(textos(acciones()), ["No", "Sí, sumar"]);
  assert.equal(dialogosNativos.length, 0, "preguntó con un diálogo del navegador");
  assert.ok(!document.querySelector("[data-sunmi-modal]"), "preguntó con un modal, no en la página");
  await tocar(boton("No"));
  assert.deepEqual(textos(acciones()), ["Ver pedido", "Sumar productos", "Cancelar pedido"]);
  assert.equal(vista(), "entrada");
  await tocar(boton("Sumar productos"));
  await tocar(boton("Sí, sumar"));
  assert.equal(vista(), "catalogo");
  const agregar = boton("Agregar al pedido (0)");
  assert.ok(agregar, "no abrió en modo sumar");
});

test("Cancelar pedido pregunta en la tarjeta; con Sí, cancela una vez y la entrada queda SIN PEDIDO", async () => {
  const { pedidos } = await montarE({ inicio: enviadoHoy(), cancelar: [real.cancelado] });
  await tocar(boton("Cancelar pedido"));
  assert.match(acciones().textContent, /¿Cancelar el pedido enviado\?/);
  assert.deepEqual(textos(acciones()), ["No", "Sí, cancelar"]);
  assert.match(boton("Sí, cancelar").className, /sunmi-btn-red/);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 0, "preguntar canceló");
  assert.equal(dialogosNativos.length, 0);
  await tocar(boton("Sí, cancelar"));
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 1);
  assert.equal(tarjeta().getAttribute("data-pedido-en-curso"), "nada", "después de cancelar no quedó sin pedido");
  assert.ok(boton("Hacer un pedido"));
});

// ── VER PEDIDO: SOLO MIRAR ────────────────────────────────────────────────

/** Que la lista sea de solo mirar: ni campo, ni − ni +, ni un botón —tampoco apagado—. */
function esDeSoloMirar() {
  const t = document.querySelector("table");
  assert.ok(t, "no está la lista");
  assert.deepEqual([...t.querySelectorAll("thead th")].map((th) => th.textContent.trim()), ["Producto", "Categoría", "Se pide por", "Cantidad"]);
  assert.equal(t.querySelectorAll("tbody input, tbody button").length, 0, "en la lista hay algo para tocar, o apagado");
  assert.ok(!t.querySelector('[aria-label^="Sumar uno"], [aria-label^="Restar uno"]'), "hay − o +");
  return [...t.querySelectorAll("tbody tr")].map((tr) => [
    tr.querySelector("[data-nombre-producto]").textContent,
    tr.querySelector("[data-cantidad-pedido]").textContent,
  ]);
}

test("Ver pedido del enviado: lo pedido de solo mirar, la cantidad como dato, y Volver a la entrada", async () => {
  const { pedidos } = await montarE({ inicio: enviadoHoy() });
  await tocar(boton("Ver pedido"));
  assert.equal(vista(), "mirar");
  assert.deepEqual(esDeSoloMirar(), [["Coca 2L", "3"], ["Agua x6", "2"]]);
  assert.ok(!boton("Agregar al pedido (0)") && !boton("Sumar productos"), "Ver pedido deja agregar");
  assert.equal(llamadas(pedidos, "/api/pedidos/set-cantidad").length, 0);
  await tocar(boton("Volver"));
  assert.equal(vista(), "entrada");
});

test("Ver pedido del que el depósito prepara: también de solo mirar", async () => {
  await montarE({ inicio: conFecha(real.empezadoCarrito, new Date()) });
  await tocar(boton("Ver pedido"));
  assert.deepEqual(esDeSoloMirar(), [["ACEITE", "2"], ["ARROZ", "5"], ["GALLETITAS", "4"]]);
});

// ── PEDIDOS ANTERIORES ────────────────────────────────────────────────────

test("Pedidos anteriores: los últimos cinco, un renglón de anchos fijos cada uno, con Ver todo el historial", async () => {
  await montarE({ inicio: real.carritoVacio, historial: real.historialLargoP1 });
  const a = anteriores();
  for (const c of ["sunmi-bg-card", "rounded-xl2", "sunmi-border"]) assert.match(a.className, new RegExp(c));
  assert.match(a.querySelector("h2").textContent, /Pedidos anteriores/);
  assert.match(a.querySelector("h2").className, /font-bold/);
  assert.match(boton("Ver todo el historial").className, /sunmi-btn-slate/);
  const r = renglonesAnteriores(a);
  assert.deepEqual(r.map((x) => x.getAttribute("data-pedido-anterior")), real.historialLargoP1.cuerpo.items.slice(0, 5).map((i) => String(i.posId)));
  const [numero, fecha, estado, cantidad, ver] = r[0].children;
  assert.match(numero.textContent, /^Pedido #\d+$/);
  assert.match(numero.className, /font-semibold/);
  assert.match(fecha.className, /sunmi-text-muted/);
  assert.ok(estado.hasAttribute("data-estado-anterior"));
  assert.match(cantidad.className, /sunmi-text-muted/);
  assert.equal(ver.textContent.trim(), "Ver pedido");
  assert.match(ver.className, /sunmi-btn-slate/);
  // Los anchos, fijos y los mismos en todos los renglones.
  const anchos = (x) => [...x.children].slice(0, 4).map((h) => [...h.classList].find((c) => /^w-\d+$/.test(c)) ?? null);
  for (const x of r) assert.deepEqual(anchos(x), ["w-32", "w-28", "w-40", "w-32"]);
});

test("el estado de un anterior: Recibido en la etiqueta slate, Cancelado en texto rojo, y el en curso no se repite", async () => {
  await montarE({ inicio: real.historialCarritoEnviado, historial: real.historialTodos });
  const estadoDe = (posId) => anteriores().querySelector(`[data-pedido-anterior="${posId}"] [data-estado-anterior]`);
  const ids = real.historialIds;
  assert.equal(estadoDe(ids.pRecibido).textContent, "Recibido");
  assert.match(estadoDe(ids.pRecibido).querySelector("span").className, /sunmi-badge-muted/);
  assert.equal(estadoDe(ids.pCancelado).textContent, "Cancelado");
  assert.match(estadoDe(ids.pCancelado).querySelector("span").className, /sunmi-text-danger/);
  // El enviado (7382) es el pedido en curso de ese carrito: va en la tarjeta.
  assert.equal(real.historialCarritoEnviado.cuerpo.pendiente.posId, ids.pEnCurso, "el fixture cambió: el caso ya no prueba nada");
  assert.ok(!estadoDe(ids.pEnCurso), "el pedido en curso aparece también entre los anteriores");
  assert.equal(renglonesAnteriores(anteriores()).length, real.historialTodos.cuerpo.items.length - 1);
});

test("Ver pedido de un anterior: el mismo detalle de solo mirar, sin navegar al historial viejo", async () => {
  const ids = real.historialIds;
  await montarE({ inicio: real.carritoVacio, historial: real.historialTodos, detalles: { [ids.pRecibido]: real.detalleRecibido } });
  await tocar(boton("Ver pedido", anteriores().querySelector(`[data-pedido-anterior="${ids.pRecibido}"]`)));
  assert.equal(vista(), "mirar");
  assert.match(document.querySelector("h1").textContent, new RegExp(`Pedido #${ids.pRecibido}`));
  assert.deepEqual(esDeSoloMirar(), [["ARROZ", "3"], ["FIDEOS", "1"]]);
  assert.equal(navegacion.length, 0, "navegó a otra pantalla");
  await tocar(boton("Volver"));
  assert.equal(vista(), "entrada");
});

test("Ver todo el historial: el filtro de estado y el mismo renglón; Ver pedido y Volver vuelven al historial", async () => {
  const ids = real.historialIds;
  await montarE({ inicio: real.carritoVacio, historial: real.historialTodos, detalles: { [ids.pCancelado]: real.detalleCancelado } });
  await tocar(boton("Ver todo el historial"));
  assert.equal(vista(), "historial");
  assert.deepEqual(textos(document.querySelector('[role="group"]')), ["Todos", "En curso", "Recibidos", "Cancelados"]);
  assert.equal(renglonesAnteriores().length, real.historialTodos.cuerpo.items.length);
  await tocar(boton("Cancelados"));
  assert.deepEqual(renglonesAnteriores().map((x) => Number(x.getAttribute("data-pedido-anterior"))), [ids.pCancelado]);
  await tocar(boton("Ver pedido", renglonesAnteriores()[0]));
  assert.equal(vista(), "mirar");
  assert.deepEqual(esDeSoloMirar(), [["FIDEOS", "4"]]);
  await tocar(boton("Volver"));
  assert.equal(vista(), "historial", "Volver del detalle no volvió al historial");
  await tocar(boton("Volver"));
  assert.equal(vista(), "entrada");
  assert.equal(navegacion.length, 0);
});
