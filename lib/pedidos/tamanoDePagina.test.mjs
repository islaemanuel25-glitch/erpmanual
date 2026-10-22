// CUÁNTOS PRODUCTOS POR PÁGINA TRAE EL CATÁLOGO DE PEDIDOS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/tamanoDePagina.test.mjs
//
// La ruta tenía `PAGE_SIZE = 50` fijo y no leía el `pageSize` que le mandaba
// la pantalla. Ahora acepta 25, 50 o 100; cualquier otra cosa, o nada, 50.
//
// Tres miradas: la regla sola, las respuestas REALES de la ruta sobre
// erpazul_al (`scripts/pruebas-db/pedidosEnviarCancelar.mjs`, un local con 120
// productos en el depósito) y que la ruta use la regla y no un número propio.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { tamanoDePaginaCatalogo, TAMANOS_DE_PAGINA_CATALOGO, TAMANO_DE_PAGINA_CATALOGO } from "./tamanoDePagina.js";

const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));

test("la regla: 25, 50 y 100 tal cual; inválido o nada, 50", () => {
  assert.deepEqual([...TAMANOS_DE_PAGINA_CATALOGO], [25, 50, 100]);
  assert.equal(TAMANO_DE_PAGINA_CATALOGO, 50);
  // Así llega de `searchParams.get`: un string, o null si no vino.
  assert.equal(tamanoDePaginaCatalogo("25"), 25);
  assert.equal(tamanoDePaginaCatalogo("50"), 50);
  assert.equal(tamanoDePaginaCatalogo("100"), 100);
  assert.equal(tamanoDePaginaCatalogo("30"), 50, "un número que no está en la lista");
  assert.equal(tamanoDePaginaCatalogo(null), 50, "sin valor");
  // Y los que parecen números sin serlo de la lista.
  for (const malo of ["", "abc", "0", "-25", "50abc", "1000", "25.5", " ", "1e2"]) {
    assert.equal(tamanoDePaginaCatalogo(malo), 50, `"${malo}" tiene que dar 50`);
  }
});

test("la ruta de verdad, sobre 120 productos: cuántos trae y cuántas páginas en los cinco casos", () => {
  const casos = [
    ["paginado25", 25, 25, 5],
    ["paginado50", 50, 50, 3],
    ["paginado100", 100, 100, 2],
    ["paginadoInvalido", 50, 50, 3], // pidió 30
    ["paginadoSinValor", 50, 50, 3], // no pidió nada
  ];
  for (const [clave, tamano, items, paginas] of casos) {
    const r = real[clave];
    assert.ok(r, `falta ${clave} en el fixture`);
    assert.equal(r.status, 200, clave);
    assert.equal(r.cuerpo.total, 120, `${clave}: el total no depende del tamaño`);
    assert.equal(r.cuerpo.items.length, items, `${clave}: productos devueltos`);
    assert.equal(r.cuerpo.pageSize, tamano, `${clave}: tamaño informado`);
    assert.equal(r.cuerpo.totalPages, paginas, `${clave}: total de páginas`);
  }
  // La página 2 de 50 arranca donde terminó la 1: el tamaño también mueve el salto.
  assert.equal(real.paginado50.cuerpo.items.at(-1).nombre, "Producto 050");
  assert.equal(real.paginado50p2.cuerpo.items[0].nombre, "Producto 051");
});

test("la ruta valida con la regla, sobre el parámetro que manda la pantalla", () => {
  const fuente = readFileSync("app/api/pedidos/catalogo/route.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /tamanoDePaginaCatalogo\(searchParams\.get\("pageSize"\)\)/, "la ruta no lee pageSize con la regla");
  assert.doesNotMatch(fuente, /PAGE_SIZE\s*=\s*\d/, "volvió un tamaño fijo a la ruta");
  // Y la pantalla manda ese mismo nombre.
  const pantalla = readFileSync("app/modulos/pedidos/page.jsx", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(pantalla, /new URLSearchParams\(\{ page: p, pageSize \}\)/, "la pantalla dejó de mandar pageSize");
});
