// "CAMBIAR POR OTRO" EN PREPARAR PEDIDO (2026-11-03).
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pos-transferencias/cambiarPorOtro.test.mjs
//
// El local pidió POETT VERDE, el depósito no lo tiene y manda POETT ROSA. Todo
// sale de las respuestas REALES de la sección 18 de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs` (corrida con
// ESCRIBIR_FIXTURE_CAMBIO=1): el detalle, cada escritura de `detalle/editar`
// con su respuesta, cada búsqueda de la hoja, el viaje con el stock, la
// recepción del local y el detalle de su pedido. Si una pantalla manda un
// cuerpo que la ruta no contestó en la corrida real, el servidor falla.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const A = await import("../pedidos/montarPantallaPedidos.mjs");
const { default: Pagina } = await import("./nueva/page.jsx");
const { queEsLoLeido, cantidadInicial, cuerpoDelCambio, LEIDO, TEXTO_CODIGO_DESCONOCIDO } = await import("../../../lib/pedidos/cambiarPorOtro.js");
const { estadoDePreparacion, conteoDePreparacion, ESTADO_PREPARACION, FILTRO_PREPARAR, rotuloDeLoQueVa, textoPedisteVa } = await import("../../../lib/pedidos/preparacionDelPedido.js");
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: TarjetaRecepcionMovil } = await import("../../../components/transferencias/TarjetaRecepcionMovil.jsx");
const { default: TarjetaPedido } = await import("../../../components/pedidos/TarjetaPedido.jsx");

afterEach(A.desmontarTodo);

const fx = JSON.parse(readFileSync("app/modulos/pos-transferencias/cambiarPorOtro.fixture.json", "utf8"));
const ids = fx.cambioIds;
const lineaDe = (det, n) => det.cuerpo.item.detalles.find((d) => d.productoNombre === n);
const verde = lineaDe(fx.cambioDetalleNuevo, "POETT VERDE");
const BUSQUEDAS = ["cambioBuscarRosa", "cambioBuscarRosaCaja", "cambioBuscarVerde", "cambioBuscarDesconocido", "cambioBuscarTexto"].map((k) => fx[k]);

function escritura(cuerpo) {
  const igual = (a, b) => Object.keys(a).every((k) => a[k] === b[k]) && Object.keys(b).every((k) => a[k] === b[k]);
  const e = fx.cambioEscrituras.find((x) => igual(x.cuerpo, cuerpo));
  assert.ok(e, `la pantalla mandó a detalle/editar un cuerpo que la ruta no contestó en la corrida real: ${JSON.stringify(cuerpo)}`);
  return e.respuesta;
}

function busqueda({ params }) {
  const b = BUSQUEDAS.find((x) => x.q === params.q);
  assert.ok(b, `la hoja buscó "${params.q}", que la corrida real no buscó`);
  assert.equal(Number(params.origenId), fx.cambioOpciones.cuerpo.origen.id, "la hoja no buscó en el catálogo del depósito que prepara");
  return b.respuesta;
}

const montar = ({ ancho = "telefono", detalle = fx.cambioDetalleNuevo } = {}) =>
  A.montar({
    pagina: Pagina,
    ancho,
    busqueda: `posId=${ids.posId}`,
    inicio: A.real.carritoVacio,
    otras: {
      "/api/me": fx.cambioMe,
      "/api/operador/me": fx.cambioOperadorMe,
      "/api/pos-transferencias/opciones": fx.cambioOpciones,
      "/api/pos-transferencias/solicitados": fx.cambioSolicitados,
      "/api/pos-transferencias/detalle": detalle,
      "/api/pos-transferencias/detalle/editar": ({ cuerpo }) => escritura(cuerpo),
      "/api/pos-transferencias/buscarProductos": busqueda,
      "/api/pos-transferencias/nueva": { status: 200, cuerpo: { ok: false, error: "no se esperaba" } },
      [`/api/locales/${fx.cambioOpciones.cuerpo.origen.id}`]: { status: 200, cuerpo: { ok: false } },
    },
  });

const linea = (n) => document.querySelector(`[data-linea-preparar="${n}"]`);
const ultimoCuerpo = (pedidos) => A.llamadas(pedidos, "/api/pos-transferencias/detalle/editar").at(-1)?.cuerpo;
const campoDeLaHoja = () => A.modal().querySelector('input[placeholder="Escaneá el que vas a mandar"]');
async function escanear(codigo) {
  await A.teclear(campoDeLaHoja(), codigo);
  await A.asentar();
  campoDeLaHoja().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await A.asentar(100);
}
async function abrirCambiar(n) {
  await A.tocar(A.boton("Cambiar", linea(n)));
  assert.ok(A.modal(), "no se abrió la hoja");
}

// ── EL FIXTURE ────────────────────────────────────────────────────────────

test("el fixture: tres líneas sin reemplazo, cada escritura con su respuesta, y el rosa con código de unidad y de caja", () => {
  assert.deepEqual(fx.cambioDetalleNuevo.cuerpo.item.detalles.map((d) => [d.productoNombre, d.reemplazo]), [["POETT VERDE", null], ["LAVANDINA", null], ["JABON X3", null]]);
  const rosa = fx.cambioBuscarRosa.respuesta.cuerpo.items.find((p) => p.productoLocalId === ids.rosa);
  assert.equal(fx.cambioBuscarRosa.q, rosa.codigoBarra);
  assert.equal(fx.cambioBuscarRosaCaja.q, rosa.codigoBarraSecundario);
});

// ── LO QUE DECIDE LA HOJA, CON LO QUE CONTESTÓ `buscarProductos` ─────────

test("LO LEÍDO: otro producto por su código de unidad y por el de caja; el mismo; un código desconocido; un texto con varios", () => {
  const leer = (b) => queEsLoLeido(verde, b.respuesta.cuerpo.items, b.q);
  for (const b of [fx.cambioBuscarRosa, fx.cambioBuscarRosaCaja]) {
    const r = leer(b);
    assert.equal(r.tipo, LEIDO.OTRO, b.q);
    assert.equal(r.producto.productoLocalId, ids.rosa);
  }
  assert.equal(leer(fx.cambioBuscarVerde).tipo, LEIDO.MISMO);
  assert.equal(leer(fx.cambioBuscarDesconocido).tipo, LEIDO.DESCONOCIDO);
  const varios = leer(fx.cambioBuscarTexto);
  assert.equal(varios.tipo, LEIDO.VARIOS);
  assert.deepEqual(varios.items.map((p) => p.nombre).sort(), ["POETT ROSA", "POETT VERDE"]);
});

test("CANTIDAD QUE VA: por defecto la pedida, en la unidad del que va; 0 o vacío no deja mandar", () => {
  const rosa = fx.cambioBuscarRosa.respuesta.cuerpo.items.find((p) => p.productoLocalId === ids.rosa);
  const i = cantidadInicial(verde, rosa);
  assert.deepEqual(i, { porKilo: false, unidad: "UNIDAD", factorPack: 1, valor: "2" });
  assert.deepEqual(cuerpoDelCambio(rosa, i, "2"), { preparado: 2, unidadPreparada: "UNIDAD", reemplazoProductoId: ids.rosa });
  assert.equal(cuerpoDelCambio(rosa, i, "0"), null);
  assert.equal(cuerpoDelCambio(rosa, i, ""), null);
});

test("EL RENGLÓN CAMBIADO cuenta como preparado y «Con cambios», y dice lo que va en la presentación del que va", () => {
  const cambiada = lineaDe(fx.cambioDetalleCambiado, "POETT VERDE");
  assert.equal(cambiada.reemplazo.productoNombre, "POETT ROSA");
  assert.equal(estadoDePreparacion(cambiada), ESTADO_PREPARACION.CON_CAMBIOS);
  const c = conteoDePreparacion(fx.cambioDetalleCambiado.cuerpo.item.detalles);
  assert.equal(c[FILTRO_PREPARAR.CON_CAMBIOS], 1);
  assert.equal(c[FILTRO_PREPARAR.PREPARADOS], 1);
  assert.equal(rotuloDeLoQueVa(cambiada), "2 UNIDAD");
});

// ── EL CELULAR ────────────────────────────────────────────────────────────

test("«Cambiar» va en la fila de abajo, entre «Corregir» y «No hay»", async () => {
  await montar();
  for (const n of ["POETT VERDE", "LAVANDINA", "JABON X3"]) {
    const textos = A.botones(linea(n)).map((b) => b.textContent.trim());
    const [i, j, k] = ["Corregir", "Cambiar", "No hay"].map((t) => textos.indexOf(t));
    assert.ok(i >= 0 && j > i && k > j, `${n}: ${JSON.stringify(textos)}`);
  }
});

test("REEMPLAZO CON OTRO PRODUCTO: escanear el rosa, «Va este», la cantidad pedida y mandar; el renglón muestra el que va", async () => {
  const { pedidos } = await montar();
  await abrirCambiar("POETT VERDE");
  const hoja = A.modal();
  assert.match(hoja.textContent, /Cambiar por otro/);
  assert.match(hoja.textContent, /Pidió: POETT VERDE · 2 UNIDAD/);
  await escanear(fx.cambioBuscarRosa.q);
  assert.match(A.modal().textContent, /Va este: POETT ROSA/);
  assert.equal(A.modal().querySelector('input[aria-label="Cantidad que va de POETT ROSA"]').value, "2");
  await A.tocar(A.boton("Mandar este en lugar del pedido", A.modal()));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: verde.detalleId, preparado: 2, unidadPreparada: "UNIDAD", reemplazoProductoId: ids.rosa });
  assert.ok(!A.modal(), "la hoja no se cerró");

  // El filtro está en Pendientes: la cambiada se ve en "Con cambios".
  await A.tocar(A.botones(A.contenido().querySelector('[role="group"]')).find((b) => b.textContent.startsWith("Con cambios")));
  const r = linea("POETT VERDE");
  assert.equal(r.getAttribute("data-reemplazo"), "POETT ROSA");
  assert.match(r.textContent, /^POETT ROSA/);
  assert.match(r.textContent, /Reemplazo/);
  assert.match(r.textContent, /Pidió: POETT VERDE/);
  assert.match(r.textContent, /Va\s*2 UNIDAD/);
  assert.deepEqual(A.botones(r).map((b) => b.textContent.trim()), ["Deshacer cambio", "Cambiar"]);
  assert.match(A.contenido().textContent, /1 \/ 3 preparados/);
});

test("DESHACER CAMBIO: vuelve al renglón original, pendiente", async () => {
  const { pedidos } = await montar({ detalle: fx.cambioDetalleCambiado });
  await A.tocar(A.botones(A.contenido().querySelector('[role="group"]')).find((b) => b.textContent.startsWith("Con cambios")));
  await A.tocar(A.boton("Deshacer cambio", linea("POETT VERDE")));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: verde.detalleId, pendiente: true });
  await A.tocar(A.botones(A.contenido().querySelector('[role="group"]')).find((b) => b.textContent.startsWith("Pendientes")));
  const r = linea("POETT VERDE");
  assert.equal(r.getAttribute("data-reemplazo"), null);
  assert.equal(r.getAttribute("data-estado"), "pendiente");
  assert.ok(A.boton("✓ Va completo", r));
  assert.match(A.contenido().textContent, /0 \/ 3 preparados/);
});

test("MISMO PRODUCTO: «✓ Es el mismo que pidieron» y «✓ Va completo», sin marca de reemplazo", async () => {
  const { pedidos } = await montar();
  await abrirCambiar("POETT VERDE");
  await escanear(fx.cambioBuscarVerde.q);
  assert.match(A.modal().textContent, /✓ Es el mismo que pidieron/);
  assert.ok(!A.boton("Mandar este en lugar del pedido", A.modal()));
  await A.tocar(A.boton("✓ Va completo", A.modal()));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: verde.detalleId, preparado: 2, unidadPreparada: "UNIDAD" });
  await A.tocar(A.botones(A.contenido().querySelector('[role="group"]')).find((b) => b.textContent.startsWith("Todos")));
  assert.equal(linea("POETT VERDE").getAttribute("data-estado"), "completo");
  assert.equal(linea("POETT VERDE").getAttribute("data-reemplazo"), null);
});

test("CÓDIGO DESCONOCIDO: avisa y no deja seguir; no escribe nada", async () => {
  const { pedidos } = await montar();
  await abrirCambiar("POETT VERDE");
  await escanear(fx.cambioBuscarDesconocido.q);
  assert.match(A.modal().textContent, new RegExp(TEXTO_CODIGO_DESCONOCIDO));
  assert.ok(!A.boton("Mandar este en lugar del pedido", A.modal()));
  assert.ok(!A.boton("✓ Va completo", A.modal()));
  assert.equal(A.llamadas(pedidos, "/api/pos-transferencias/detalle/editar").length, 0);
});

test("POR EL CÓDIGO DE CAJA, y ESCRIBIENDO: el de caja encuentra el rosa; un texto da la lista para elegir", async () => {
  await montar();
  await abrirCambiar("POETT VERDE");
  await escanear(fx.cambioBuscarRosaCaja.q);
  assert.match(A.modal().textContent, /Va este: POETT ROSA/);
  await escanear(fx.cambioBuscarTexto.q);
  await A.tocar(A.botones(A.modal()).find((b) => /POETT ROSA/.test(b.textContent)));
  assert.match(A.modal().textContent, /Va este: POETT ROSA/);
});

// ── LA COMPUTADORA ────────────────────────────────────────────────────────

test("ESCRITORIO: «Cambiar» en la fila, la misma hoja centrada, y el renglón cambiado con «Deshacer cambio»", async () => {
  const { pedidos } = await montar({ ancho: "escritorio" });
  const pantalla = () => document.querySelector("[data-preparar-pedido-escritorio]");
  const fila = (n) => [...pantalla().querySelectorAll("tbody tr")].find((tr) => tr.querySelector("[data-nombre-producto]")?.textContent.trim() === n);
  await A.tocar(fila("POETT VERDE").querySelector("[data-cambiar]"));
  assert.ok(A.modal(), "no se abrió la hoja");
  assert.match(A.modal().textContent, /Cambiar por otro/);
  await escanear(fx.cambioBuscarRosa.q);
  await A.tocar(A.boton("Mandar este en lugar del pedido", A.modal()));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: verde.detalleId, preparado: 2, unidadPreparada: "UNIDAD", reemplazoProductoId: ids.rosa });
  await A.tocar(A.botones(pantalla().querySelector('[role="group"]')).find((b) => b.textContent.startsWith("Todos")));
  const f = fila("POETT ROSA");
  assert.ok(f, "el renglón no muestra el producto que va");
  assert.match(f.textContent, /Reemplazo/);
  assert.match(f.querySelector("[data-lo-preparo]").textContent, /Pidió: POETT VERDE/);
  assert.equal(f.querySelector("[data-estado-resuelto]").textContent, "✓ Reemplazo");
  assert.ok(A.boton("Deshacer cambio", f));
  assert.ok(f.querySelector("[data-cambiar]"), "el cambiado no se puede cambiar de nuevo");
  await A.tocar(A.boton("Deshacer cambio", f));
  assert.deepEqual(ultimoCuerpo(pedidos), { detalleId: verde.detalleId, pendiente: true });
  assert.ok(fila("POETT VERDE"), "deshacer no volvió al original");
});

// ── LO QUE VIAJA Y LO QUE LE LLEGA AL LOCAL ───────────────────────────────

test("STOCK: se descuenta del que va y no del pedido; la transferencia lleva el rosa recordando que se pidió el verde", () => {
  assert.equal(fx.cambioViaje.bajaDelStock["POETT ROSA"], 2);
  assert.equal(fx.cambioViaje.bajaDelStock["POETT VERDE"], 0);
  const rosa = fx.cambioViaje.lineas.find((l) => l.nombre === "POETT ROSA");
  assert.deepEqual(rosa, { nombre: "POETT ROSA", cantidad: 2, unidadEnviada: "UNIDAD", pediste: "POETT VERDE" });
  assert.ok(!fx.cambioViaje.lineas.some((l) => l.nombre === "POETT VERDE"), "viajó el pedido");
});

test("LA MARCA EN LA RECEPCIÓN: «Pediste POETT VERDE, va POETT ROSA», abierta y ya revisada; las demás sin marca", () => {
  const items = fx.cambioRecepcion.cuerpo.item.items;
  const rosa = items.find((d) => d.nombre === "POETT ROSA");
  const lavandina = items.find((d) => d.nombre === "LAVANDINA");
  const marca = textoPedisteVa("POETT VERDE", "POETT ROSA");
  assert.equal(marca, "Pediste POETT VERDE, va POETT ROSA");
  assert.ok(renderToStaticMarkup(createElement(TarjetaRecepcionMovil, { d: rosa, puedeRecibir: true })).includes(marca));
  assert.ok(renderToStaticMarkup(createElement(TarjetaRecepcionMovil, { d: { ...rosa, revisadoEnRecepcion: true, cantidadRecibida: rosa.cantidadEnviada } })).includes(marca));
  assert.ok(!renderToStaticMarkup(createElement(TarjetaRecepcionMovil, { d: lavandina, puedeRecibir: true })).includes("Pediste"));
});

test("LA MARCA EN EL DETALLE DEL PEDIDO del local: el renglón del verde dice que fue el rosa", () => {
  const items = fx.cambioHistorialDetalle.cuerpo.pedido.items;
  const v = items.find((i) => i.nombre === "POETT VERDE");
  const l = items.find((i) => i.nombre === "LAVANDINA");
  const html = renderToStaticMarkup(createElement(TarjetaPedido, { producto: v, cantidad: 2, soloLectura: true }));
  assert.ok(html.includes("Pediste POETT VERDE, va POETT ROSA"), html);
  assert.ok(!renderToStaticMarkup(createElement(TarjetaPedido, { producto: l, cantidad: 3, soloLectura: true })).includes("Pediste"));
});
