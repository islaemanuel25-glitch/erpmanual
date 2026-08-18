// CANDADOS DE LA ETIQUETA DE ESCALA.
//
// Dos mitades, y hacen falta las dos. La primera prueba que la función dice lo
// correcto. La segunda prueba que las pantallas LA USEN — porque el defecto que
// originó todo esto no fue una función equivocada: fue una pantalla que escribía
// "/ un" a mano sobre un número que estaba en otra escala, mientras la función
// que sabía la verdad vivía a tres archivos de distancia.
//
// Es el mismo hueco que este repo ya documentó al mudar la tabla del detalle de
// pedido: los candados afirmaban sobre la pieza y NADIE comprobaba que la página
// se la pasara.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { etiquetaEscalaPrecio, ESCALA } from "./escalaPrecio.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
// Los comentarios se sacan ANTES de buscar. Un candado que busca texto encuentra
// la prosa que lo explica y se pone verde por el motivo equivocado: ya pasó tres
// veces en este repo, y la peor fue un VERDE falso.
const sinComentarios = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\/[^\n]*/g, "");

// ── LA FUNCIÓN ────────────────────────────────────────────────────────────

test("pack y cajón van por bulto: es la escala en la que se guarda su precio", () => {
  assert.equal(etiquetaEscalaPrecio("pack"), "por bulto");
  assert.equal(etiquetaEscalaPrecio("cajon"), "por bulto");
});

test("kg va por kg", () => {
  assert.equal(etiquetaEscalaPrecio("kg"), "por kg");
});

test("lo suelto va por unidad, y lo desconocido también", () => {
  assert.equal(etiquetaEscalaPrecio("unidad"), "por unidad");
  // Un valor que no existe en el enum no puede inventar una escala: por unidad
  // es el caso base y el único que no afirma nada raro sobre el número.
  assert.equal(etiquetaEscalaPrecio(null), "por unidad");
  assert.equal(etiquetaEscalaPrecio(undefined), "por unidad");
  assert.equal(etiquetaEscalaPrecio("loQueSea"), "por unidad");
});

test("NO mira el factor, y eso está decidido: la ficha tiene que quedar idéntica", () => {
  // Existe un predicado más estricto —`tienePack`, que además exige factor > 1—.
  // No se usa acá a propósito: los dos criterios difieren solo en los pack o
  // cajón con factor 1, nulo o cero, y en producción hay EXACTAMENTE UNO. Usar
  // el estricto le cambiaría la etiqueta a ese producto EN LA FICHA, que es la
  // pantalla de la que se sacó esta pieza.
  //
  // Este candado se pone rojo si alguien "mejora" la función agregándole el
  // factor sin darse cuenta de que mueve otra pantalla.
  assert.equal(etiquetaEscalaPrecio("pack"), "por bulto");
  assert.equal(etiquetaEscalaPrecio.length, 1, "recibe la unidad y nada más");
});

test("las tres escalas están nombradas y no se repiten", () => {
  const valores = Object.values(ESCALA);
  assert.equal(valores.length, 3);
  assert.equal(new Set(valores).size, 3);
});

// ── QUE LAS PANTALLAS LA USEN ─────────────────────────────────────────────

test("la ficha de producto arma su etiqueta con esta función, no con un ternario propio", () => {
  const src = sinComentarios("components/productos/FormProducto.jsx");
  assert.match(src, /etiquetaEscalaPrecio/, "la ficha tiene que importarla y usarla");
  assert.doesNotMatch(
    src,
    /\(por bulto\)/,
    "el texto no puede volver a estar escrito a mano en la ficha"
  );
});

test("la tarjeta del catálogo rotula con la escala del producto, no con un texto fijo", () => {
  const src = sinComentarios("app/modulos/productos/page.jsx");
  assert.match(
    src,
    /etiquetaEscalaPrecio\(\s*p\.unidadMedida\s*\)/,
    "el rótulo tiene que salir de la unidad del producto"
  );
  // El defecto exacto que llegó a producción sobre 1.293 de 2.600 productos.
  assert.doesNotMatch(
    src,
    /sunmi-text-muted">\s*\/?\s*un\s*</,
    'no puede volver el rótulo fijo "/ un" sobre el precio'
  );
});

test("el andamio deriva sus textos del dato, como la pantalla real", () => {
  // El andamio TAPÓ tres de los cinco defectos porque tenía el sufijo y la
  // equivalencia escritos como cadenas sueltas: dos textos que no podían
  // contradecirse porque no salían de ningún campo común.
  const src = sinComentarios("app/andamio-producto-card/page.jsx");
  assert.match(src, /etiquetaEscalaPrecio/, "el sufijo se deriva");
  assert.match(src, /lineaDeEquivalencia/, "la equivalencia se deriva");
  assert.doesNotMatch(src, /sufijo:/, "no vuelve el sufijo escrito a mano");
  assert.doesNotMatch(src, /equivalencia:\s*"/, "no vuelve la equivalencia escrita a mano");
});

test("la tarjeta le pasa el id a abrirEditar, no la fila entera", () => {
  // `abrirEditar` valida con `Number(id)`: pasarle el objeto da NaN y muestra
  // "ID de producto inválido" sin entrar nunca. La tabla ya lo llamaba bien.
  const src = sinComentarios("app/modulos/productos/page.jsx");
  assert.doesNotMatch(
    src,
    /abrirEditar\(\s*p\s*\)/,
    "abrirEditar recibe un id, nunca el objeto del producto"
  );
});
