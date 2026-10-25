// EL RELOJ DEL REFRESCO DEL PEDIDO Y LA GUARDIA DE LECTURAS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/refrescoDelPedido.test.mjs
//
// `useRefrescoDelPedido` relee el pedido cada pocos segundos con la pestaña a
// la vista, y nunca con la pestaña oculta. Lo que relee lo prueban las
// pantallas (`app/modulos/pedidos/variosDispositivos.test.mjs`, que vuelve a
// la pestaña); acá, el reloj, con un período chico para no esperar cinco
// segundos de verdad. Y la guardia, que es pura.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

// El arnés de Pedidos arma el DOM (jsdom) y `act`.
const { act, asentar } = await import("../../app/modulos/pedidos/montarPantallaPedidos.mjs");
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { useRefrescoDelPedido, REFRESCO_DEL_PEDIDO_MS } = await import("./useRefrescoDelPedido.js");
const { crearGuardiaDeLecturas } = await import("./guardiaDeLecturas.js");

let raiz = null;
afterEach(async () => {
  if (raiz) await act(async () => raiz.unmount());
  raiz = null;
  delete document.visibilityState;
});

async function montarReloj(refrescar, opciones) {
  function Reloj() {
    useRefrescoDelPedido(refrescar, opciones);
    return null;
  }
  raiz = createRoot(document.createElement("div"));
  await act(async () => raiz.render(React.createElement(Reloj)));
}

test("«cada pocos segundos»: el período de las pantallas está entre 2 y 10 segundos", () => {
  assert.ok(REFRESCO_DEL_PEDIDO_MS >= 2000 && REFRESCO_DEL_PEDIDO_MS <= 10000, String(REFRESCO_DEL_PEDIDO_MS));
});

test("con la pestaña a la vista, relee solo, una y otra vez", async () => {
  let veces = 0;
  await montarReloj(async () => {
    veces += 1;
  }, { cadaMs: 20 });
  await asentar(130);
  assert.ok(veces >= 3, `releyó ${veces} veces en 130 ms con un período de 20`);
});

test("con la pestaña oculta, no relee", async () => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  let veces = 0;
  await montarReloj(async () => {
    veces += 1;
  }, { cadaMs: 20 });
  await asentar(130);
  assert.equal(veces, 0);
});

test("apagado (`activo: false`, la pantalla todavía sin cargar), no relee", async () => {
  let veces = 0;
  await montarReloj(async () => {
    veces += 1;
  }, { cadaMs: 20, activo: false });
  await asentar(100);
  assert.equal(veces, 0);
});

test("no se superpone: con una lectura en vuelo, la vuelta siguiente se saltea", async () => {
  let empezadas = 0;
  let soltar;
  await montarReloj(() => {
    empezadas += 1;
    return new Promise((r) => (soltar = r));
  }, { cadaMs: 20 });
  await asentar(130);
  assert.equal(empezadas, 1, "se empezaron lecturas encima de otra en vuelo");
  soltar();
});

test("al desmontarse, deja de releer", async () => {
  let veces = 0;
  await montarReloj(async () => {
    veces += 1;
  }, { cadaMs: 20 });
  await act(async () => raiz.unmount());
  raiz = null;
  const despues = veces;
  await asentar(100);
  assert.equal(veces, despues);
});

// ── LA GUARDIA ────────────────────────────────────────────────────────────

test("guardia: una lectura sin escrituras de por medio se aplica", () => {
  const g = crearGuardiaDeLecturas();
  const m = g.leyendo();
  assert.equal(g.vigente(m), true);
});

test("guardia: una lectura que salió antes de una escritura no se aplica, ni con la escritura en vuelo ni terminada", () => {
  const g = crearGuardiaDeLecturas();
  const m = g.leyendo();
  const listo = g.escribiendo();
  assert.equal(g.vigente(m), false, "en vuelo");
  listo();
  assert.equal(g.vigente(m), false, "terminada: la lectura igual es de antes");
});

test("guardia: una lectura que salió con una escritura en vuelo no se aplica", () => {
  const g = crearGuardiaDeLecturas();
  const listo = g.escribiendo();
  const m = g.leyendo();
  assert.equal(g.vigente(m), false);
  listo();
  assert.equal(g.vigente(m), false);
  assert.equal(g.vigente(g.leyendo()), true, "la que sale después de terminar sí");
});

test("guardia: terminar dos veces la misma escritura no descuenta otra", () => {
  const g = crearGuardiaDeLecturas();
  const a = g.escribiendo();
  g.escribiendo(); // otra en vuelo
  a();
  a();
  assert.equal(g.vigente(g.leyendo()), false, "con la otra todavía en vuelo, una lectura no se puede aplicar");
});
