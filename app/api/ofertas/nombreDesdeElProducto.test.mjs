// LA OFERTA SE LLAMA COMO EL PRODUCTO, Y ESO LO DECIDE EL SERVIDOR.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/ofertas/nombreDesdeElProducto.test.mjs
//
// ── EL DEFECTO QUE ESTO CIERRA, CON SU NOMBRE PROPIO ──────────────────────
//
// La única oferta que llegó a producción se llama **"91100"**. No es un código
// ni una referencia: es lo que alguien tipeó porque el formulario pedía un
// nombre y había que llenarlo. Está en la base, creada el 2026-09-08, y el libro
// de eventos muestra que arrancó llamándose "9 de oro" y terminó así.
//
// Una oferta es UN producto —varios son un combo, que es otra cosa y otra
// pantalla— así que pedir un nombre aparte era pedir lo mismo dos veces.
//
// ── POR QUÉ SE AFIRMA SOBRE LA RUTA Y NO SOBRE LA PANTALLA ───────────────
//
// Porque la decisión tiene que vivir del lado del servidor. Un campo oculto en
// el formulario habría dado el mismo resultado HOY y dejado abierta la puerta a
// que mañana alguien lo llene con otra cosa: dos fuentes para el mismo hecho.
//
// Estos candados leen el fuente de la ruta. Es lo que se puede afirmar sin base:
// que el nombre NO sale del cuerpo del request y que SÍ sale de las referencias,
// que se leen de la base. El efecto contra Postgres se ejerció aparte.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const sinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/[^\n]*/g, "");

const RUTA_CREAR = "app/api/ofertas/crear/route.js";
const PANTALLA = "app/modulos/ofertas/nueva/page.jsx";

test("N1 · la ruta NO toma el nombre del cuerpo del request", () => {
  const src = sinComentarios(RUTA_CREAR);
  assert.ok(
    !/body\?\.nombre/.test(src),
    "el nombre volvió a salir del cuerpo: eso es lo que produjo la oferta «91100»"
  );
  assert.ok(
    !/La oferta necesita un nombre/.test(src),
    "volvió la validación que obligaba a inventar un nombre"
  );
});

test("N2 · el nombre sale de las referencias, que se leen de la BASE", () => {
  const src = sinComentarios(RUTA_CREAR);
  // `referencias` es lo que `referenciasDeProducto` trae de Postgres. Es la
  // misma fuente con la que se congelan el precio y el costo de cada línea, y
  // por el mismo motivo: si el navegador pudiera fijarla, no querría decir nada.
  assert.match(
    src,
    /referencias\[[^\]]+\]\?\.nombre/,
    "el nombre no sale de las referencias leídas de la base"
  );
  assert.match(src, /nombre,/, "la ruta ya no manda el nombre al crear");
});

test("N3 · la PANTALLA no manda nombre, ni visible ni oculto", () => {
  const src = sinComentarios(PANTALLA);
  // ── SE MIRA EL CUERPO DEL REQUEST, NO EL ARCHIVO ENTERO ───────────────
  //
  // La primera versión buscaba `nombre:` en todo el archivo y dio un falso rojo
  // cuando la pantalla empezó a guardar la oferta a medio armar: ahí `nombre` es
  // el del PRODUCTO, para poder decir en el cartel cuál quedó a medias, y no
  // tiene nada que ver con el nombre de la oferta.
  //
  // Lo que se afirma es que el nombre NO VIAJA AL SERVIDOR. Un campo oculto
  // daría el mismo resultado hoy y abriría la puerta a dos fuentes.
  const cuerpo = /JSON\.stringify\(\{[\s\S]*?\n\s{8}\}\)/.exec(src)?.[0] || "";
  assert.ok(cuerpo, "no se encontró el cuerpo del request de crear");
  assert.ok(
    !/\bnombre\b/.test(cuerpo),
    `la pantalla volvió a mandar un nombre al crear:\n${cuerpo}`
  );
  // Y tampoco pide uno.
  assert.ok(
    !/Nombre de la oferta|placeholder="Nombre/.test(src),
    "volvió el campo de nombre al formulario"
  );
});

test("N4 · la pantalla carga UN solo producto: no hay «agregar otro»", () => {
  // Varios productos son un COMBO, que es otra cosa y otra pantalla. Si volviera
  // el botón de agregar, el nombre derivado dejaría de tener sentido y habría
  // que decidir otra vez cómo se llama la oferta.
  const src = sinComentarios(PANTALLA);
  assert.ok(
    !/Agregar otro|agregarProducto|\[\.\.\.lineas/.test(src),
    "volvió la carga de varios productos: eso es un combo, no una oferta"
  );
  // El cuerpo manda un array de UNA sola línea, que es lo que la ruta espera.
  // Se cuenta cuántos `productoLocalId:` hay adentro del array en vez de
  // matchear su forma exacta: la forma cambió al agregar los campos del
  // redondeo y el candado dio rojo sobre una pantalla correcta.
  const arrayDeLineas = /lineas: \[([\s\S]*?)\n\s{10}\]/.exec(src)?.[1] || "";
  assert.ok(arrayDeLineas, "no se encontró el array de líneas");
  assert.equal(
    (arrayDeLineas.match(/productoLocalId:/g) || []).length,
    1,
    "la pantalla manda más de una línea: eso es un combo, no una oferta"
  );
});

test("N5 · la ruta sigue aceptando varias líneas, y las nombra sin romperse", () => {
  // La pantalla móvil manda una sola, pero la ruta es de todos. Una oferta sin
  // nombre es un dato roto en la lista, así que el caso de varias tiene que
  // resolverse igual en vez de quedar en `undefined`.
  const src = sinComentarios(RUTA_CREAR);
  assert.match(src, /y \$\{nombresDeLinea\.length - 1\} más/, "falta el nombre de varias líneas");
  assert.match(src, /Oferta sin productos/, "falta el nombre cuando no hay ninguna línea");
});
