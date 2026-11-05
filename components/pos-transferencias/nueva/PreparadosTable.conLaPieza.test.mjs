// TANDA 9 DE LA REGLA ÚNICA DE UNIDADES: `PreparadosTable` CUENTA CON LA PIEZA Y
// DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test components/pos-transferencias/nueva/PreparadosTable.conLaPieza.test.mjs
//
// La tabla se monta de verdad y se ejerce con la misma secuencia de toques
// (`ejercerTabla.mjs`). Las filas son líneas con la forma de
// `pos-transferencias/detalle`. Los números son los del código anterior a la
// tanda 9, sacados corriéndolo: `lib/unidades/tanda9.lineaBase.json`.
//
// ── LA CONTRADICCIÓN QUE QUEDA, A PROPÓSITO ────────────────────────────────
//
// El maní 1881 llega con `factorPack` 2, y la tabla le ofrece "Rotura": parte
// sus bolsas en "bultos" de 2 bolsas y, al apagarla, manda la cantidad en
// BULTO, que `enviar` rechaza porque la ficha sale solo por unidad. La pieza
// única no le ve bulto al maní (factor 1). La tanda 9 no lo arregla; el último
// candado fija lo que pasa hoy.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { FICHAS, LINEAS, LINEA_BASE, PREPARADO_DOS_BULTOS, lineaDelDetalle } from "../../../lib/unidades/tanda9Arnes.mjs";
import { comoViene } from "../../../lib/unidades/reglaDeUnidades.js";
const { ejercerTabla, desmontarTodo } = await import("./ejercerTabla.mjs");

after(desmontarTodo);

const CASOS = [
  ...LINEAS.filter(([, , c]) => Number(c.preparado) > 0),
  ...Object.keys(FICHAS).map((caso) => [`${caso} preparado 2 bultos`, caso, PREPARADO_DOS_BULTOS]),
];

for (const [nombre, caso, cant] of CASOS) {
  test(`PreparadosTable igual que antes de la tanda 9 — ${nombre}`, async () => {
    assert.deepEqual(await ejercerTabla("preparados", lineaDelDetalle(caso, cant)), LINEA_BASE.preparados[nombre]);
  });
}

test("LA CONTRADICCIÓN CON LA PIEZA, FIJADA COMO ESTÁ: el maní 1881 tiene rotura en bultos de 2 bolsas", async () => {
  const pasos = await ejercerTabla("preparados", lineaDelDetalle("mani1881", { sugerido: 3, preparado: 3 }));
  const paso = (n) => pasos.find((p) => p[0] === n);
  assert.deepEqual(paso("rotura encendida")[1], ["1", "1"], "3 bolsas se muestran como 1 bulto y 1 suelta");
  assert.deepEqual(paso("rotura apagada")[3], [[18811, 4, "BULTO"]], "al apagar la rotura manda BULTO");
  assert.equal(comoViene(FICHAS.mani1881).factor, 1, "la pieza no le ve bulto");
});

test("PreparadosTable convierte con la pieza, no a mano", () => {
  const fuente = fs
    .readFileSync(new URL("./PreparadosTable.jsx", import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ fromUnidades, toUnidades \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/[*/%]\s*factorPack\b/.test(fuente), "volvió a multiplicar, dividir o partir por el factor a mano");
});
