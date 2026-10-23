// EL DEPÓSITO CANCELA EL PEDIDO DESDE LA PANTALLA DE PREPARAR, EN EL CELULAR.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pos-transferencias/cancelarDesdePreparar.test.mjs
//
// Pedido por Emanuel (2026-10-23): el mismo "⋯" que la recepción, una hoja con
// "Cancelar pedido" y la hoja de confirmación del kit. Al cancelar, el aviso y
// la vuelta a "Pedidos de locales", donde ya no está.
//
// El servidor contesta con las respuestas REALES de la sección 15 de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs`: el pedido EMPEZADO que el
// depósito canceló (su detalle y la respuesta de `cancelar`), y el 409 de
// cancelar uno que ya se había enviado.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const A = await import("../pedidos/montarPantallaPedidos.mjs");
const { default: Pagina } = await import("./nueva/page.jsx");

afterEach(A.desmontarTodo);

const dep = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const ids = dep.depositoCancelarIds;
const local = ids.local;

const montarPreparar = ({ cancelar = dep.depositoCancelarEmpezado } = {}) =>
  A.montar({
    pagina: Pagina,
    ancho: "telefono",
    busqueda: `posId=${ids.pb}`,
    inicio: A.real.carritoVacio,
    otras: {
      "/api/me": dep.depositoCancelarMe,
      "/api/operador/me": dep.depositoCancelarOperadorMe,
      "/api/pos-transferencias/opciones": dep.depositoCancelarOpciones,
      "/api/pos-transferencias/solicitados": dep.depositoCancelarSolicitados,
      "/api/pos-transferencias/detalle": dep.depositoCancelarDetalle,
      "/api/pos-transferencias/cancelar": cancelar,
      "/api/pos-transferencias/nueva": { status: 200, cuerpo: { ok: false, error: "no se esperaba" } },
      [`/api/locales/${dep.depositoCancelarOpciones.cuerpo.origen.id}`]: { status: 200, cuerpo: { ok: false } },
    },
  });

const masAcciones = () => A.contenido().querySelector('button[aria-label="Más acciones"]');

async function hastaLaConfirmacion() {
  assert.ok(masAcciones(), "falta el ⋯ arriba");
  await A.tocar(masAcciones());
  const hoja = A.modal();
  assert.ok(hoja, "el ⋯ no abrió la hoja");
  assert.match(hoja.textContent, /Más acciones/);
  await A.tocar(A.boton("Cancelar pedido", hoja));
  const confirmacion = A.modal();
  assert.ok(confirmacion, "no se abrió la confirmación");
  return confirmacion;
}

test("el fixture: el pedido está empezado y Solicitado, y cancelar contestó ok", () => {
  assert.equal(dep.depositoCancelarDetalle.cuerpo.item.encabezado.id, ids.pb);
  assert.equal(dep.depositoCancelarDetalle.cuerpo.item.encabezado.estado, "Solicitado");
  assert.ok(dep.depositoCancelarDetalle.cuerpo.item.detalles.some((d) => d.revisadoEn != null));
  assert.equal(dep.depositoCancelarEmpezado.cuerpo.ok, true);
});

test("arriba, el ⋯ de la recepción: slate, con icono, anunciado como Más acciones", async () => {
  await montarPreparar();
  const b = masAcciones();
  assert.ok(b, "falta el ⋯");
  assert.equal(b.getAttribute("aria-haspopup"), "dialog");
  assert.match(b.className, /sunmi-btn-slate/);
  assert.ok(b.querySelector("svg"), "el ⋯ no es el icono");
  // Está en la tarjeta de arriba, en el renglón del local.
  assert.match(b.parentElement.parentElement.textContent, new RegExp(local));
});

test("la hoja tiene Cancelar pedido en rojo, de ancho completo", async () => {
  await montarPreparar();
  await A.tocar(masAcciones());
  const b = A.boton("Cancelar pedido", A.modal());
  assert.ok(b);
  assert.match(b.className, /sunmi-btn-red/);
  assert.match(b.className, /\bw-full\b/);
});

test("la confirmación pregunta con número y local; Volver no cancela nada", async () => {
  const { pedidos } = await montarPreparar();
  const c = await hastaLaConfirmacion();
  assert.match(c.textContent, new RegExp(`¿Cancelar el pedido #${ids.pb} de ${local}\\?`));
  assert.match(c.textContent, /Lo preparado no se envía\./);
  assert.match(A.boton("Volver", c).className, /sunmi-btn-slate/);
  assert.match(A.boton("Cancelar pedido", c).className, /sunmi-btn-red/);
  await A.tocar(A.boton("Volver", c));
  assert.ok(!document.querySelector("[data-sunmi-modal]"), "Volver no cerró la confirmación");
  assert.equal(A.llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 0);
});

test("confirmar: cancela este pedido, avisa y vuelve a Pedidos de locales", async () => {
  const { pedidos } = await montarPreparar();
  const c = await hastaLaConfirmacion();
  await A.tocar(A.boton("Cancelar pedido", c));
  assert.deepEqual(A.llamadas(pedidos, "/api/pos-transferencias/cancelar").map((p) => p.cuerpo), [{ posId: ids.pb }]);
  assert.match(A.texto(), new RegExp(`Pedido #${ids.pb} cancelado`));
  assert.deepEqual(A.navegacion.at(-1), ["push", "/modulos/pos-transferencias"]);
});

test("ya se envió (409): el aviso arriba, sin salir, y el pedido se vuelve a leer", async () => {
  const { pedidos } = await montarPreparar({ cancelar: dep.depositoCancelarYaEnviado });
  const lecturas = A.llamadas(pedidos, "/api/pos-transferencias/detalle").length;
  const c = await hastaLaConfirmacion();
  await A.tocar(A.boton("Cancelar pedido", c));
  assert.match(A.contenido().textContent, /El pedido ya se envió\. Se maneja desde la transferencia\./);
  assert.ok(!document.querySelector("[data-sunmi-modal]"), "la confirmación quedó abierta sobre el aviso");
  assert.ok(A.llamadas(pedidos, "/api/pos-transferencias/detalle").length > lecturas, "no volvió a leer el pedido");
  assert.ok(!A.navegacion.some(([, a]) => a === "/modulos/pos-transferencias"), "salió de la pantalla con el 409");
});
