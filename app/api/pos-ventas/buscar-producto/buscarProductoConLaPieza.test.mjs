// TANDA 14 DE LA REGLA ÚNICA DE UNIDADES: EL BUSCADOR DEL POS DIVIDE CON LA
// PIEZA Y MUESTRA LOS MISMOS PRECIOS QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/pos-ventas/buscar-producto/buscarProductoConLaPieza.test.mjs
//
// Las cuatro divisiones viven adentro de `mapProductos`, que es privada de la
// ruta y un candado no puede llamar. Al hacer el cambio se corrió `mapProductos`
// —con una copia de la ruta que la exporta— sobre las fichas de la tanda 8 en el
// local y en el depósito, antes y después: 36 respuestas idénticas byte a byte.
// Este candado afirma que la ruta divide con `unidadDelBulto`, y que
// `unidadDelBulto` da exactamente lo que daba `precio / factorPack` —con el
// redondeo a centavos de la ruta y sin él— para el `factorPack` tal como lo
// arma la ruta y las condiciones en que divide (pack o cajón, factor mayor a 1).
//
// ── LA CONTRADICCIÓN QUE QUEDA ─────────────────────────────────────────────
//
// El buscador decide si hay bulto por la unidad de medida —"pack" o "cajón"—,
// no con la lectora de la pieza. Una ficha "unidad" con factor 12 no se divide
// (el precio es el de la unidad) y la pieza la lee como pack de 12. Es la misma
// diferencia que la tanda 6 anotó entre las rutas de stock. No se arregla acá.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { unidadDelBulto } from "../../../../lib/unidades/reglaDeUnidades.js";

test("unidadDelBulto da lo mismo que precio / factorPack, con y sin el redondeo de la ruta", () => {
  for (const crudo of [2, 6, 10, 12, 20, 24, "12"]) for (const precio of [50000, 38400, 45600, 1480, 1999, 0.01, 150000, 6136]) {
    const factorPack = Number(crudo || 1);
    assert.equal(unidadDelBulto({ precio, factor: factorPack }), precio / factorPack, `${precio} ÷ ${crudo}`);
    assert.equal(Number(unidadDelBulto({ precio, factor: factorPack }).toFixed(2)), Number((precio / factorPack).toFixed(2)));
  }
});

test("los casos de la tanda: pack de 12 a $50.000 son $4.166,67 la unidad; a costo $38.400, $3.200", () => {
  assert.equal(Number(unidadDelBulto({ precio: 50000, factor: 12 }).toFixed(2)), 4166.67);
  assert.equal(Number(unidadDelBulto({ precio: 38400, factor: 12 }).toFixed(2)), 3200);
});

test("la ruta divide con la pieza, no a mano, y solo en un pack o cajón", () => {
  const fuente = fs.readFileSync(new URL("./route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  // Desde la tanda 17 también pide a la pieza el precio de la pieza de fiambre.
  assert.match(fuente, /import \{ precioDeLaPieza, unidadDelBulto \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.equal((fuente.match(/precioDeLaPieza\(\{ precioPorKilo: (precioDB|precioCosto), pesoKg: pesoReferenciaKg \}\)/g) || []).length, 2);
  assert.equal((fuente.match(/unidadDelBulto\(\{ precio: (precioDB|precioCosto), factor: factorPack \}\)/g) || []).length, 4);
  assert.ok(!/(precioDB|precioCosto) \/ factorPack/.test(fuente), "volvió a dividir a mano");
  assert.match(fuente, /\["pack", "cajon"\]\.includes\(unidadMedida\)/);
});
