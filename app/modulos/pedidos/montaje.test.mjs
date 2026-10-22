// SE MONTA UNA SOLA VERSIÓN: EL TELÉFONO O LA COMPUTADORA, SEGÚN EL ANCHO.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/montaje.test.mjs
//
// En 99d7410 `page.jsx` montaba las dos composiciones a la vez y escondía una
// por CSS: al entrar, opciones, carrito y catálogo se pedían dos veces —una
// por composición— y cada una llevaba su estado. Desde el 2026-10-22 el
// envoltorio mira el ancho real de la ventana (`(min-width: 1024px)`, el
// `lg` de Tailwind) y monta UNA. La otra no está en el árbol: no corre
// efectos ni pide nada.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const { real, montar, desmontarTodo, llamadas, escritorio, entrada, cambiarAncho } = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

const RUTAS = ["/api/pedidos/opciones", "/api/pedidos/carrito", "/api/pedidos/catalogo", "/api/pedidos/historial"];
const cuantas = (pedidos) => Object.fromEntries(RUTAS.map((r) => [r, llamadas(pedidos, r).length]));
/** El teléfono está si está su página de entrada o alguna de sus tarjetas. */
const telefono = () => entrada() ?? document.querySelector("[data-tarjeta-pedido]");

test("ventana chica: solo el teléfono, y cada ruta UNA vez al entrar", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador, enLaEntrada: true });
  assert.ok(entrada(), "no está el teléfono");
  assert.ok(!escritorio(), "se montó también la computadora");
  assert.deepEqual(cuantas(pedidos), {
    "/api/pedidos/opciones": 1,
    "/api/pedidos/carrito": 1,
    "/api/pedidos/catalogo": 1,
    "/api/pedidos/historial": 1,
  });
});

test("ventana grande: solo la computadora, y cada ruta UNA vez al entrar", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador, ancho: "escritorio" });
  assert.ok(escritorio(), "no está la computadora");
  assert.ok(!telefono(), "se montó también el teléfono");
  // La computadora no tiene pedidos anteriores en la página: no pide historial.
  assert.deepEqual(cuantas(pedidos), {
    "/api/pedidos/opciones": 1,
    "/api/pedidos/carrito": 1,
    "/api/pedidos/catalogo": 1,
    "/api/pedidos/historial": 0,
  });
});

test("cruzar el corte desmonta una y monta la otra, que pide lo suyo una vez", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador, enLaEntrada: true });
  await cambiarAncho("escritorio");
  assert.ok(escritorio(), "al agrandar no apareció la computadora");
  assert.ok(!telefono(), "al agrandar quedó el teléfono");
  assert.equal(llamadas(pedidos, "/api/pedidos/opciones").length, 2, "la computadora no pidió sus opciones, o las pidió de más");
  await cambiarAncho("telefono");
  assert.ok(entrada(), "al achicar no volvió el teléfono");
  assert.ok(!escritorio(), "al achicar quedó la computadora");
  assert.equal(llamadas(pedidos, "/api/pedidos/opciones").length, 3);
});

test("mientras no se sabe el ancho —en el servidor— no se monta ninguna: el mismo Cargando...", async () => {
  const React = (await import("react")).default;
  const { renderToString } = await import("react-dom/server");
  const { default: Pagina } = await import("@/app/modulos/pedidos/page.jsx");
  let pedidos = 0;
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async () => {
    pedidos += 1;
    throw new Error("no tiene que pedir nada");
  };
  try {
    const html = renderToString(React.createElement(Pagina));
    assert.match(html, /Cargando\.\.\./);
    assert.match(html, /min-h-screen sunmi-bg flex items-center justify-center/, "no es el mismo estado de carga de la pantalla");
    assert.doesNotMatch(html, /data-pedidos-escritorio-pantalla|data-entrada-pedido/, "se dibujó una de las dos");
    assert.equal(pedidos, 0);
  } finally {
    globalThis.fetch = fetchAntes;
  }
});
