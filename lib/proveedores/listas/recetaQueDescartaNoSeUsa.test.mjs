// LA RUTA DE IMPORTAR NO USA UNA RECETA QUE DESCARTA MÁS DE LO QUE LEE.
//
// ── EL CASO ─────────────────────────────────────────────────────────────────
//
// Importación #22, la lista de vinos de Carozo: la receta guardada del
// proveedor leyó 17 renglones descartando 104 "sin precio", y se importó igual.
//
// La decisión es `lecturaConReceta`, pura, con sus candados en
// `recetaDeLista.test.mjs` y con el PDF real en `listaVinosCarozo.test.mjs`. Lo
// que este candado mira es que la RUTA la use, que es donde el defecto ocurrió:
// una regla escrita que nadie llama defiende lo mismo que ninguna.
//
// Mira el fuente SIN COMENTARIOS: la prosa de la ruta nombra todo esto al
// explicarlo, y un candado que busca texto la tomaría por código.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const FUENTE = fs.readFileSync(path.join(RAIZ, "app/api/proveedores/listas/importar/route.js"), "utf8");
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("la ruta sabe si la lectura viene de confirmar las columnas", () => {
  assert.match(CODIGO, /recienConfirmada\s*=\s*form\.get\(\s*["']columnaPrecio["']\s*\)\s*!==\s*null/);
});

test("la receta se decide con lecturaConReceta, con todo lo que necesita", () => {
  const llamada = CODIGO.match(/lecturaConReceta\(\{([\s\S]*?)\}\);/);
  assert.ok(llamada, "la ruta no decide la receta con lecturaConReceta");
  const args = llamada[1];
  assert.match(args, /mapeoPropuesto:\s*propuesta\.mapeo/, "la pregunta tiene que salir con la propuesta");
  assert.match(args, /descartadasDelLector:\s*tabla\.filasDescartadas\.length/);
  assert.match(args, /\brecienConfirmada\b/);
  assert.match(args, /filasDelArchivo\(/);
  // Y que no quede otra decisión al lado: una sola puerta.
  assert.doesNotMatch(CODIGO, /recetaAplicable\(/, "la ruta volvió a decidir la receta por su cuenta");
});

test("el tamaño que se guarda es el de los bytes del archivo", () => {
  assert.match(CODIGO, /archivoTamano:\s*bytes\.length/);
});
