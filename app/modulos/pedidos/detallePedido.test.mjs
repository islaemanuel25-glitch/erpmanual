// EL DETALLE DE UN PEDIDO ANTERIOR, en `/modulos/pedidos/historial/[id]`.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/detallePedido.test.mjs
//
// Pedido de Emanuel (2026-10-22): de solo lectura; título "Pedido #N" y Volver
// en el shell, a donde se vino; arriba una tarjeta con el número, el estado,
// las fechas que existan, cuántos productos y el enlace a la transferencia;
// debajo los productos con la tarjeta de solo lectura. Sin barra de abajo,
// sin buscador ni filtro. Uno en curso va a la entrada de Pedidos. En la
// computadora, la misma pantalla, centrada.
//
// Montada con las respuestas REALES de `/api/pedidos/historial/[id]` sobre
// erpazul_al (`scripts/pruebas-db/pedidosEnviarCancelar.mjs`, sección 13): un
// pedido recibido con su transferencia, uno cancelado, uno en camino, uno en
// curso que el depósito empezó, y el 404 que le contesta la ruta a otro local.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const {
  real, montar, desmontarTodo, contenido, filaShell, tituloShell, navegacion, tocar, boton, botones, tarjetas, esDeSoloLectura, llamadas,
} = await import("./montarPantallaPedidos.mjs");
const { default: DetalleDePedido } = await import("./historial/[id]/page.jsx");

afterEach(desmontarTodo);

const ids = real.historialIds;
const cabecera = () => document.querySelector("[data-cabecera-pedido]");
const pill = () => cabecera()?.querySelector("span.inline-block")?.textContent.trim() ?? null;
const renglones = () => [...(cabecera()?.querySelectorAll("p") ?? [])].map((p) => p.textContent);
const FECHA = "\\d\\d/\\d\\d \\d\\d:\\d\\d";

const montarDetalle = (id, respuesta, extra = {}) =>
  montar({ pagina: DetalleDePedido, params: { id: String(id) }, detalles: { [id]: respuesta }, ...extra });

test("el fixture: la ruta contesta cada caso, y a otro local un 404", () => {
  const r = real.detalleRecibido.cuerpo.pedido;
  assert.equal(r.posId, ids.pRecibido);
  assert.equal(r.transferencia.id, ids.tRecibido);
  assert.equal(r.transferencia.estado, "Recibida");
  assert.ok(r.transferencia.fechaRecepcion);
  assert.equal(real.detalleCancelado.cuerpo.pedido.estado, "Cancelado");
  assert.ok(real.detalleCancelado.cuerpo.pedido.canceladoAt);
  assert.equal(real.detalleCancelado.cuerpo.pedido.transferencia, null);
  assert.equal(real.detalleCamino.cuerpo.pedido.transferencia.estado, "Enviada");
  assert.equal(real.detalleEnCurso.cuerpo.pedido.depositoEmpezo, true);
  assert.equal(real.detalleDeOtroLocal.status, 404);
});

test("el título y el Volver van en el shell; el Volver vuelve a donde se vino", async () => {
  const { pedidos } = await montarDetalle(ids.pRecibido, real.detalleRecibido);
  assert.equal(tituloShell(), `Pedido #${ids.pRecibido}`);
  assert.deepEqual(llamadas(pedidos, `/api/pedidos/historial/${ids.pRecibido}`).length, 1, "no pidió ESE pedido");
  const volver = boton("Volver", filaShell());
  assert.ok(volver, "no hay Volver en el shell");
  assert.ok(!boton("Volver", contenido()), "el Volver quedó adentro del contenido");
  await tocar(volver);
  assert.deepEqual(navegacion, [["back"]]);
});

test("recibido: el número con su estado, las fechas de envío y recepción, los productos y la transferencia", async () => {
  await montarDetalle(ids.pRecibido, real.detalleRecibido);
  assert.equal(cabecera().querySelector(".font-semibold")?.textContent, `Pedido #${ids.pRecibido}`);
  assert.equal(pill(), "Recibido");
  const [fechas, cuantos] = renglones();
  assert.match(fechas, new RegExp(`^Enviado ${FECHA} · recibido ${FECHA}$`));
  assert.equal(cuantos, `2 productos · Transferencia #${ids.tRecibido}`);
  await tocar(boton(`Transferencia #${ids.tRecibido}`, cabecera()));
  assert.deepEqual(navegacion.at(-1), ["push", `/modulos/transferencias/${ids.tRecibido}`]);
  // Sin "Recibido: N": la ruta no lo trae.
  assert.doesNotMatch(contenido().textContent, /Recibido:/);
});

test("los productos, con la tarjeta de solo lectura y lo pedido", async () => {
  await montarDetalle(ids.pRecibido, real.detalleRecibido);
  const items = real.detalleRecibido.cuerpo.pedido.items;
  assert.deepEqual(tarjetas().map((t) => t.nombre), items.map((i) => i.nombre));
  for (const t of tarjetas()) assert.ok(esDeSoloLectura(t), `${t.nombre}: no es de solo lectura`);
  const pedido = Object.fromEntries(items.map((i) => [i.nombre, String(i.sugerido)]));
  for (const t of tarjetas()) assert.equal(t.cantidad, pedido[t.nombre], `${t.nombre}: no muestra lo pedido`);
  // Ver fotos apagado (no hay nada guardado): sin foto ni inicial.
  for (const t of tarjetas()) assert.ok(!t.foto && !t.inicial, `${t.nombre}: con foto sin Ver fotos`);
});

test("con Ver fotos prendido en Pedidos, las tarjetas llevan la foto o la inicial", async () => {
  localStorage.setItem("pedidos_ver_fotos", "1");
  await montarDetalle(ids.pRecibido, real.detalleRecibido);
  assert.ok(tarjetas().length > 0);
  for (const t of tarjetas()) assert.ok(t.foto || t.inicial, `${t.nombre}: sin foto ni inicial`);
});

test("sin barra de abajo, sin buscador y sin filtro: lo único que se toca es el enlace", async () => {
  await montarDetalle(ids.pRecibido, real.detalleRecibido);
  assert.equal(contenido().querySelectorAll("input, select, textarea").length, 0, "hay un campo");
  assert.ok(!contenido().querySelector('[role="group"]'), "hay un filtro");
  assert.deepEqual(botones(contenido()).map((b) => b.textContent.trim()), [`Transferencia #${ids.tRecibido}`]);
});

test("cancelado: su estado, la fecha en que se canceló, y sin transferencia", async () => {
  await montarDetalle(ids.pCancelado, real.detalleCancelado);
  assert.equal(pill(), "Cancelado");
  const [fechas, cuantos] = renglones();
  assert.match(fechas, new RegExp(`^Enviado ${FECHA} · cancelado ${FECHA}$`));
  assert.equal(cuantos, "1 producto");
  assert.doesNotMatch(cabecera().textContent, /Transferencia/);
  for (const t of tarjetas()) assert.ok(esDeSoloLectura(t), `${t.nombre}: no es de solo lectura`);
});

test("en camino: sin fecha de recepción, con su transferencia", async () => {
  await montarDetalle(ids.pCamino, real.detalleCamino);
  assert.equal(pill(), "En camino");
  const [fechas, cuantos] = renglones();
  assert.match(fechas, new RegExp(`^Enviado ${FECHA}$`));
  assert.match(cuantos, /^1 producto · Transferencia #\d+$/);
});

test("uno en curso no se mira acá: va a la entrada de Pedidos", async () => {
  await montarDetalle(ids.pEnCurso, real.detalleEnCurso);
  assert.deepEqual(navegacion, [["replace", "/modulos/pedidos"]]);
  assert.ok(!cabecera(), "dibujó el detalle de un pedido en curso");
});

test("el pedido de otro local: el 404 de la ruta, dicho, y nada del pedido", async () => {
  await montarDetalle(ids.pRecibido, real.detalleDeOtroLocal);
  assert.ok(!cabecera(), "dibujó un pedido");
  assert.equal(tarjetas().length, 0);
  assert.match(contenido().textContent, new RegExp(real.detalleDeOtroLocal.cuerpo.error.replace(/[.]/g, "\\.")));
});

test("en la computadora, la misma pantalla, centrada", async () => {
  await montarDetalle(ids.pRecibido, real.detalleRecibido, { ancho: "escritorio" });
  const pantalla = document.querySelector("[data-detalle-pedido]");
  assert.ok(pantalla, "no se montó el detalle");
  assert.match(pantalla.className, /\bmax-w-xl\b/);
  assert.match(pantalla.className, /\bmx-auto\b/);
  assert.equal(pill(), "Recibido");
});
