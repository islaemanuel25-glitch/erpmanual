// LA VERSIÓN DE COMPUTADORA DE PEDIDOS AL DEPÓSITO, DESDE lg.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/escritorio.test.mjs
//
// `components/pedidos/PedidosEscritorio.jsx`, montada por la página entera con
// el arnés (`montarPantallaPedidos.mjs`) y las respuestas REALES de las rutas
// sobre erpazul_al, con la ventana de computadora: la página monta solo esta
// composición (`montaje.test.mjs`). Que el teléfono no cambió lo dice
// `celularIntacto.test.mjs`.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const { real, montar, desmontarTodo, tocar, asentar, llamadas, modal, escritorio, navegacion } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

// ── LO QUE SE MIRA ────────────────────────────────────────────────────────

const enEscritorio = () => escritorio();
const botonesE = () => [...enEscritorio().querySelectorAll("button")];
const botonE = (t) => botonesE().find((b) => b.textContent.trim().startsWith(t)) ?? null;
const textoE = () => enEscritorio().textContent;
const franja = () => enEscritorio().querySelector("[data-franja-pedido]");
const panel = () => enEscritorio().querySelector("[data-panel-pedido]");
const herramientas = () => enEscritorio().querySelector("[data-herramientas-pedido]");
const tabla = () => enEscritorio().querySelector("table");
const pill = () => franja().querySelector("span.inline-block")?.textContent.trim() ?? null;
const dato = () => franja().querySelector("[data-dato-pedido]").textContent;
/** Una fila del catálogo, por el nombre del producto. */
function fila(nombre) {
  const tr = [...(tabla()?.querySelectorAll("tbody tr") ?? [])].find((f) => f.querySelector(".font-semibold")?.textContent === nombre);
  if (!tr) return null;
  return {
    tr,
    campo: tr.querySelector(`input[aria-label="Cantidad de ${nombre}"]`),
    mas: tr.querySelector('button[aria-label^="Sumar uno"]'),
    quitar: tr.querySelector(`button[aria-label="Quitar ${nombre} del pedido"]`),
    lugar: tr.querySelector("[data-lugar-quitar-escritorio]"),
    marca: tr.querySelector("[data-marca-cambio]")?.textContent ?? null,
  };
}
const renglones = () =>
  [...panel().querySelectorAll("[data-renglon-pedido]")].map((r) => ({
    nombre: r.getAttribute("data-renglon-pedido"),
    texto: r.textContent,
    acento: !!r.querySelector(".sunmi-text-accent"),
  }));
const setCantidades = (pedidos) => llamadas(pedidos, "/api/pedidos/set-cantidad").map((p) => p.cuerpo);
const id = (n) => real.catalogo.cuerpo.items.find((i) => i.nombre === n).productoLocalId;

const conFecha = (r, fecha) => ({ ...r, cuerpo: { ...r.cuerpo, pendiente: { ...r.cuerpo.pendiente, solicitadoAt: fecha.toISOString() } } });
const enviadoHoy = () => conFecha(real.carritoPendiente, new Date());

// Con la ventana de computadora, que es la única que lo monta. No tiene
// página de entrada.
const montarE = (r) => montar({ ...r, ancho: "escritorio" });

// ── ARMANDO ───────────────────────────────────────────────────────────────

test("armando: la franja —Borrador, de dónde a dónde, cuántos— y las tres acciones en orden", async () => {
  await montarE({ inicio: real.carritoBorrador });
  const { local, deposito } = real.opciones.cuerpo;
  assert.match(franja().querySelector("h1").textContent, /Pedido al depósito/);
  assert.match(franja().querySelector("h1").className, /font-bold/);
  assert.equal(pill(), "Borrador");
  assert.match(franja().textContent, new RegExp(`${local.nombre} → ${deposito.nombre} · se guarda solo`));
  assert.match(dato(), /Productos en el pedido\s*2/);
  const acciones = [...franja().querySelectorAll("button")].map((b) => b.textContent.trim());
  assert.deepEqual(acciones, ["Pedidos anteriores ›", "← Volver", "Enviar pedido al depósito (2)"]);
  assert.match(botonE("← Volver").className, /sunmi-btn-slate/);
  assert.match(botonE("Enviar pedido al depósito").className, /sunmi-btn-primary/);
  assert.equal(botonE("Enviar pedido al depósito").disabled, false);
});

test("armando: las herramientas en una fila, y el catálogo como tabla con sus cuatro columnas", async () => {
  await montarE({ inicio: real.carritoBorrador });
  assert.ok(herramientas(), "faltan las herramientas");
  assert.ok(herramientas().querySelector('input[placeholder="Buscar producto o código"]'), "falta el buscador");
  assert.match(herramientas().textContent, /Categoría/);
  assert.match(herramientas().textContent, /Todas · 3/);
  assert.match(herramientas().textContent, /Ver fotos/);
  assert.match(herramientas().textContent, /Mostrar/);
  const titulos = [...tabla().querySelectorAll("thead th")].map((th) => th.textContent.trim());
  assert.deepEqual(titulos, ["Producto", "Unidad", "Cantidad", ""]);
  assert.match(fila("Agua x6").tr.textContent, /Por BULTO de 6 u/);
  assert.match(fila("Coca 2L").tr.textContent, /UNIDAD/);
  assert.equal(fila("Coca 2L").campo.value, "3");
  // Con el 0 de guía, como en el teléfono.
  assert.equal(fila("Yerba 1kg").campo.value, "");
  assert.equal(fila("Yerba 1kg").campo.getAttribute("placeholder"), "0");
  // El paginador: "‹ Página N de M ›" y al lado, suave, "viendo a–b de N" —la
  // forma del celular del kit, `formaDelCelular`—, no la fila de escritorio.
  const paginador = enEscritorio().querySelector('[data-paginador="compacto"]');
  assert.ok(paginador, "falta el paginador, o no es el compacto");
  assert.match(paginador.textContent, /Página 1 de 1/);
  assert.match(paginador.textContent, /viendo 1–3 de 3/);
  assert.ok(paginador.querySelector('button[aria-label="Página anterior"]') && paginador.querySelector('button[aria-label="Página siguiente"]'));
  assert.doesNotMatch(textoE(), /« Anterior|items\)/, "quedó la fila de escritorio del paginador");
});

test("la ✕: solo en lo pedido, con el lugar reservado siempre", async () => {
  await montarE({ inicio: real.carritoBorrador });
  assert.ok(fila("Coca 2L").quitar, "la coca está en el pedido: lleva ✕");
  assert.ok(fila("Agua x6").quitar);
  const yerba = fila("Yerba 1kg");
  assert.ok(!yerba.quitar, "la yerba no está en el pedido: sin ✕");
  assert.ok(yerba.lugar, "sin el lugar de la ✕");
  assert.ok(yerba.lugar.classList.contains("invisible"));
  assert.equal(yerba.lugar.disabled, true);
});

test("armando: cada cambio va por set-cantidad al instante, y el panel lo suma", async () => {
  const { pedidos } = await montarE({ inicio: real.carritoBorrador });
  assert.match(panel().textContent, /Tu pedido/);
  assert.match(panel().textContent, /2 productos · se guarda solo/);
  assert.deepEqual(renglones().map((r) => r.nombre), ["Coca 2L", "Agua x6"]);
  assert.match(renglones()[1].texto, /2 bultos/);
  await tocar(fila("Yerba 1kg").mas);
  assert.deepEqual(setCantidades(pedidos).at(-1), { productoLocalId: id("Yerba 1kg"), cantidad: 1, unidad: "UNIDAD" });
  assert.deepEqual(renglones().map((r) => r.nombre), ["Coca 2L", "Agua x6", "Yerba 1kg"]);
  assert.match(dato(), /Productos en el pedido\s*3/);
  assert.ok(!botonE("Cancelar pedido"), "armando no se cancela");
});

test("armando: Enviar pedido al depósito envía al primer toque, sin nada en el medio", async () => {
  const { pedidos } = await montarE({ inicio: real.carritoBorrador, solicitar: [real.solicitado] });
  const antes = pedidos.length;
  await tocar(botonE("Enviar pedido al depósito (2)"));
  await asentar(200);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1, "no envió al primer toque");
  assert.equal(pedidos[antes].ruta, "/api/pos-transferencias/solicitar", "algo se pidió antes del envío");
  assert.deepEqual(pedidos[antes].cuerpo, { posId: real.carritoBorrador.cuerpo.posId });
  assert.equal(pill(), "Enviado", "después de enviar no quedó en Enviado");
  assert.ok(!botonE("Confirmar"), "apareció un segundo paso");
});

test("sin pedido: Borrador, 0 productos y el botón apagado", async () => {
  await montarE({ inicio: real.carritoVacio });
  assert.equal(pill(), "Borrador");
  assert.match(dato(), /Productos en el pedido\s*0/);
  assert.equal(botonE("Enviar pedido al depósito (0)").disabled, true);
  assert.ok(tabla(), "sin pedido no hay catálogo");
});

// ── ENVIADO: EL MODO SUMAR ────────────────────────────────────────────────

test("enviado: la franja dice cuándo y cuántos cambios, y Agregar al pedido arranca apagado", async () => {
  await montarE({ inicio: enviadoHoy() });
  assert.equal(pill(), "Enviado");
  assert.match(franja().textContent, /Enviado hoy \d\d:\d\d · podés sumar hasta que el depósito lo empiece/);
  assert.match(dato(), /Cambios sin confirmar\s*0/);
  const agregar = botonE("Agregar al pedido (0)");
  assert.ok(agregar && agregar.disabled);
  assert.match(agregar.className, /sunmi-btn-primary/);
  assert.ok(!botonE("Enviar pedido al depósito"));
  assert.match(panel().textContent, /2 en el pedido · 0 cambios sin confirmar/);
});

test("enviado otro día: fecha corta y hora", async () => {
  await montarE({ inicio: conFecha(real.carritoPendiente, new Date(Date.now() - 3 * 24 * 3600 * 1000)) });
  assert.match(franja().textContent, /Enviado \d\d\/\d\d \d\d:\d\d · podés sumar/);
});

test("enviado: nada se escribe hasta Agregar al pedido; la fila y el panel marcan lo pendiente", async () => {
  const { pedidos } = await montarE({ inicio: enviadoHoy(), sumar: [real.mainSumado] });
  await tocar(fila("Yerba 1kg").mas);
  await tocar(fila("Agua x6").mas);
  assert.equal(setCantidades(pedidos).length, 0, "el modo sumar llamó a set-cantidad");
  assert.equal(llamadas(pedidos, "/api/pedidos/sumar-al-enviado").length, 0, "se escribió sin confirmar");
  // La fila: el tono de fila destacada del kit, y la marca en el acento.
  assert.match(fila("Yerba 1kg").tr.className, /sunmi-fila-atencion/);
  assert.equal(fila("Yerba 1kg").marca, "nuevo, sin confirmar");
  assert.equal(fila("Agua x6").marca, "2 → 3, sin confirmar");
  assert.doesNotMatch(fila("Coca 2L").tr.className, /sunmi-fila-atencion/);
  assert.ok(fila("Yerba 1kg").tr.querySelector(".sunmi-text-accent"));
  // El panel: lo nuevo se suma en el acento.
  const yerba = renglones().find((r) => r.nombre === "Yerba 1kg");
  assert.ok(yerba && yerba.acento, "lo nuevo no se suma al panel en el acento");
  assert.match(yerba.texto, /1 · nuevo/);
  assert.match(panel().textContent, /2 en el pedido · 2 cambios sin confirmar/);
  assert.match(dato(), /Cambios sin confirmar\s*2/);

  await tocar(botonE("Agregar al pedido (2)"));
  const envios = llamadas(pedidos, "/api/pedidos/sumar-al-enviado");
  assert.equal(envios.length, 1, "no fue una sola confirmación");
  assert.equal(envios[0].cuerpo.posId, real.carritoPendiente.cuerpo.pendiente.posId);
  assert.deepEqual(
    envios[0].cuerpo.cambios.map((c) => c.productoLocalId).sort(),
    [id("Yerba 1kg"), id("Agua x6")].sort()
  );
  assert.match(document.body.textContent, /Se agregaron 2 cambios al pedido/);
  assert.match(dato(), /Cambios sin confirmar\s*0/);
});

test("enviado: un 409 al confirmar avisa arriba, descarta los cambios y pasa a Preparando", async () => {
  const { estado } = await montarE({ inicio: enviadoHoy(), sumar: [real.sumarEmpezado] });
  await tocar(fila("Yerba 1kg").mas);
  estado.carrito = real.empezadoCarrito;
  await tocar(botonE("Agregar al pedido (1)"));
  const aviso = enEscritorio().querySelector("[data-aviso-escritorio]");
  assert.ok(aviso, "el aviso no salió");
  assert.match(aviso.textContent, /El depósito ya está preparando tu pedido\. Ya no se puede cambiar\./);
  // Arriba de la franja.
  assert.ok(aviso.compareDocumentPosition(franja()) & 4, "el aviso no está arriba de la franja");
  assert.equal(pill(), "Preparando");
});

test("la hoja de descartar: con cambios, Volver y Pedidos anteriores preguntan; sin cambios, salen", async () => {
  await montarE({ inicio: enviadoHoy() });
  await tocar(botonE("← Volver"));
  assert.ok(!modal(), "sin cambios se abrió la hoja");
  assert.deepEqual(navegacion.at(-1), ["back"]);

  await tocar(fila("Yerba 1kg").mas);
  await tocar(botonE("← Volver"));
  assert.ok(modal(), "con cambios, Volver no preguntó");
  assert.match(modal().textContent, /Tenés 1 cambio sin confirmar\. ¿Descartarlos\?/);
  const delModal = [...modal().querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => t === "Seguir cargando" || t === "Descartar");
  assert.deepEqual(delModal, ["Seguir cargando", "Descartar"]);
  await tocar([...modal().querySelectorAll("button")].find((b) => b.textContent.trim() === "Seguir cargando"));
  assert.ok(!modal());
  assert.equal(fila("Yerba 1kg").campo.value, "1", "Seguir cargando perdió el cambio");
  assert.equal(navegacion.length, 1, "Seguir cargando se fue");

  await tocar(botonE("Pedidos anteriores ›"));
  assert.ok(modal(), "con cambios, Pedidos anteriores no preguntó");
  await tocar([...modal().querySelectorAll("button")].find((b) => b.textContent.trim() === "Descartar"));
  assert.deepEqual(navegacion.at(-1), ["push", "/modulos/pedidos/historial"]);
});

// ── CANCELAR, SOLO ENVIADO ────────────────────────────────────────────────

test("cancelar: solo con el pedido enviado, botón rojo al pie del panel, con la hoja", async () => {
  await montarE({ inicio: real.carritoBorrador });
  assert.ok(!botonE("Cancelar pedido"), "armando apareció cancelar");
  await desmontarTodo();

  await montarE({ inicio: conFecha(real.empezadoCarrito, new Date()) });
  assert.ok(!botonE("Cancelar pedido"), "preparando apareció cancelar");
  await desmontarTodo();

  const { pedidos } = await montarE({ inicio: enviadoHoy(), cancelar: [real.cancelado] });
  const cancelar = botonE("Cancelar pedido");
  assert.ok(cancelar, "enviado sin cancelar");
  assert.match(cancelar.className, /sunmi-btn-red/);
  assert.match(cancelar.className, /w-full/);
  assert.ok(panel().contains(cancelar) && [...panel().querySelectorAll("button")].at(-1) === cancelar, "no está al pie del panel");
  await tocar(cancelar);
  assert.ok(modal(), "no abrió la hoja");
  assert.match(modal().textContent, /¿Cancelar el pedido solicitado\?/);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 0, "abrir la hoja canceló");
  await tocar([...modal().querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancelar pedido"));
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 1);
  assert.equal(pill(), "Borrador", "después de cancelar no volvió a armar");
});

// ── PREPARANDO ────────────────────────────────────────────────────────────

test("preparando: sin catálogo ni herramientas ni acción principal; solo el panel, apagado", async () => {
  await montarE({ inicio: conFecha(real.empezadoCarrito, new Date()) });
  assert.equal(pill(), "Preparando");
  assert.match(franja().textContent, /El depósito lo está preparando/);
  assert.match(dato(), /Productos en el pedido\s*3/);
  assert.deepEqual([...franja().querySelectorAll("button")].map((b) => b.textContent.trim()), ["Pedidos anteriores ›", "← Volver"]);
  assert.ok(!herramientas(), "con herramientas");
  assert.ok(!tabla(), "con el catálogo");
  assert.match(panel().textContent, /3 productos/);
  assert.equal(renglones().length, 3);
  assert.equal(panel().querySelectorAll("button").length, 0, "en el panel hay algo que tocar");
});

test("Ver fotos: la miniatura o la inicial a la izquierda del nombre, con la clave del celular", async () => {
  try { localStorage.setItem("pedidos_ver_fotos", "1"); } catch {}
  await montarE({ inicio: real.carritoBorrador });
  assert.ok(fila("Agua x6").tr.querySelector("[data-tarjeta-foto]"), "el agua sin su foto");
  assert.ok(fila("Coca 2L").tr.querySelector("[data-tarjeta-inicial]"), "la coca sin su inicial");
  await desmontarTodo();
  await montarE({ inicio: real.carritoBorrador });
  assert.ok(!fila("Agua x6").tr.querySelector("[data-tarjeta-foto]"), "apagado, con foto");
});
