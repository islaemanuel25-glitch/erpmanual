// TANDA 13 DE LA REGLA ÚNICA DE UNIDADES: `recibir/[id]` VALORIZA LAS SUELTAS
// CON LA PIEZA Y DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/compras-proveedor/recibir/recibirConLaPieza.test.mjs
//
// La cuenta vive adentro del manejador de la ruta y no se puede llamar suelta.
// El candado afirma dos cosas: que la ruta la hace con `bultosEnFraccion`, y que
// `bultosEnFraccion` da exactamente lo que daba la expresión de antes
// —`contadas / factorPack`— en una grilla de físicas y factores, con el
// `factorPack` tal como lo arma la ruta: `Math.max(1, Number(base?.factor_pack || 1))`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { bultosEnFraccion } from "../../../../lib/unidades/reglaDeUnidades.js";

const comoLaArmaLaRuta = (factorPack) => Math.max(1, Number(factorPack || 1));

test("bultosEnFraccion da lo mismo que contadas / factorPack, para todas las físicas y factores de la grilla", () => {
  for (const crudo of [null, 0, 1, 2, 6, 12, 20, 24, "12"]) for (const contadas of [0, 3, 6, 25, 30, 33, 48, 2.75, 1e-3]) {
    const factorPack = comoLaArmaLaRuta(crudo);
    assert.equal(bultosEnFraccion({ unidades: contadas, base: { factor_pack: factorPack } }), contadas / factorPack, `${contadas} con factor ${crudo}`);
  }
});

test("los casos de la tanda: 2 bultos y 6 sueltas de 12 se valorizan como 2,5; de 24, 30 unidades son 1,25", () => {
  assert.equal(bultosEnFraccion({ unidades: 30, base: { factor_pack: 12 } }), 2.5);
  assert.equal(bultosEnFraccion({ unidades: 30, base: { factor_pack: 24 } }), 1.25);
});

test("la ruta valoriza las sueltas con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./[id]/route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ bultosEnFraccion, comoViene, escalaDelCosto \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.match(fuente, /: bultosEnFraccion\(\{ unidades: contadas, base: \{ factor_pack: factorPack \} \}\);/);
  assert.ok(!/contadas \/ factorPack/.test(fuente), "volvió a dividir a mano");
});
