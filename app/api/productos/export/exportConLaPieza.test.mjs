// TANDA 15 DE LA REGLA ÚNICA DE UNIDADES: LA EXPORTACIÓN DE PRODUCTOS NO TIENE
// CUENTA DE UNIDAD CONTRA PACK.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/productos/export/exportConLaPieza.test.mjs
//
// Entró en la lista de la tanda 11 por una búsqueda que encontró `factor_pack`
// detrás de `//` en un comentario del ancho de la columna. Lo único que hace con
// el factor es exportarlo tal cual está en la ficha. Este candado lo fija: si
// alguien le agrega una cuenta por el factor, tiene que pasar por la pieza.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("la exportación lleva factor_pack tal cual, sin multiplicar ni dividir por él", () => {
  const fuente = fs.readFileSync(new URL("./route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal((fuente.match(/factor_pack: p\.factor_pack != null \? Number\(p\.factor_pack\) : "",/g) || []).length, 2);
  assert.ok(!/[*/%]\s*\(?\s*[\w.?]*factor(_pack|Pack)?\b|\bfactor(_pack|Pack)?\s*[*/%]/.test(fuente), "apareció una cuenta por el factor");
});
