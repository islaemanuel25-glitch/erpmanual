// LA RUTA DE IMPORTAR NO USA UNA RECETA QUE DESCARTA MÁS DE LO QUE LEE.
//
// ── EL CASO ─────────────────────────────────────────────────────────────────
//
// Importación #22, la lista de vinos de Carozo: la receta guardada del
// proveedor se reaplicó en silencio —el PDF no tiene títulos, así que su huella
// "v1:5:-,-,-,-,-" la cumple cualquier archivo de cinco columnas— y leyó 17
// renglones descartando 104 "sin precio". Se importó igual.
//
// Las dos reglas son funciones puras con sus candados en `recetaDeLista.test.mjs`.
// Lo que este candado mira es que la RUTA las use, que es donde el defecto
// ocurrió: una regla escrita que nadie llama defiende lo mismo que ninguna.
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

test("la receta se pide sabiendo si la lectura viene de confirmar las columnas", () => {
  assert.match(CODIGO, /recienConfirmada\s*=\s*form\.get\(\s*["']columnaPrecio["']\s*\)\s*!==\s*null/);
  assert.match(CODIGO, /recetaAplicable\(\{[^}]*recienConfirmada[^}]*\}\)/);
});

test("si con la receta se descarta más de lo que se lee, se vuelve a preguntar con la propuesta", () => {
  const bloque = CODIGO.match(/if\s*\(\s*uso\.ok\s*&&\s*!recienConfirmada\s*&&\s*descartaMasDeLoQueLee\([\s\S]*?\n {2}\}/);
  assert.ok(bloque, "falta el control de descartes sobre la receta guardada");
  assert.match(bloque[0], /tabla\.filasDescartadas\.length\s*\+\s*lectura\.descartadas\.length/);
  assert.match(bloque[0], /MOTIVO_RECETA\.DESCARTA_MAS_DE_LO_QUE_LEE/);
  assert.match(bloque[0], /lectura\s*=\s*leerCon\(\s*propuesta\.mapeo\s*\)/, "tiene que contar con la propuesta, como la primera vez");
});

test("el tamaño que se guarda es el de los bytes del archivo", () => {
  assert.match(CODIGO, /archivoTamano:\s*bytes\.length/);
});
