// TANDA 15 DE LA REGLA ÚNICA DE UNIDADES: EL STOCK VALORIZADO DIVIDE CON LA
// PIEZA Y VALE LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/reportes-stock/valorizado/valorizadoConLaPieza.test.mjs
//
// Las dos divisiones viven adentro del manejador de la ruta. El candado afirma
// que la ruta las hace con `unidadDelBulto`, y que `unidadDelBulto` da
// exactamente lo que daba `precio / factor` con el factor como lo arma la ruta:
// `Math.max(1, safeNum(base.factor_pack) || 1)`, y solo con factor mayor que 1.
//
// ── LA CONTRADICCIÓN QUE QUEDA ─────────────────────────────────────────────
//
// El valorizado divide por el `factor_pack` crudo: el maní 1881 se valoriza a la
// mitad (3.000 ÷ 2), y desde la tanda 7 las pantallas de stock ya no lo dividen
// (leen la ficha con la pieza). Se deja como está y queda informado.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { unidadDelBulto } from "../../../../lib/unidades/reglaDeUnidades.js";

const comoLoArmaLaRuta = (fp) => Math.max(1, (Number.isFinite(Number(fp)) ? Number(fp) : 0) || 1);

test("unidadDelBulto da lo mismo que precio / factor, para los factores y precios de la grilla", () => {
  for (const fp of [2, 6, 10, 12, 20, 24, "12"]) for (const precio of [38400, 50000, 3000, 1480, 1999, 0, 0.01]) {
    const factor = comoLoArmaLaRuta(fp);
    assert.equal(unidadDelBulto({ precio, factor }), precio / factor, `${precio} ÷ ${fp}`);
  }
});

test("los casos de la tanda: un pack de 12 a $38.400 vale $3.200 la unidad; el maní, $1.500 (contradicción fijada)", () => {
  assert.equal(unidadDelBulto({ precio: 38400, factor: 12 }), 3200);
  assert.equal(unidadDelBulto({ precio: 3000, factor: 2 }), 1500);
});

test("la ruta divide con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ unidadDelBulto \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.match(fuente, /factor > 1 \? unidadDelBulto\(\{ precio: precioCostoBase, factor \}\) : precioCostoBase/);
  assert.match(fuente, /factor > 1 \? unidadDelBulto\(\{ precio: precioVentaBase, factor \}\) : precioVentaBase/);
  assert.ok(!/(precioCostoBase|precioVentaBase) \/ factor/.test(fuente), "volvió a dividir a mano");
});
