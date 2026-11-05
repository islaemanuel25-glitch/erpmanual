// TANDA 9 DE LA REGLA ÚNICA DE UNIDADES: `TablaSugeridos` CUENTA CON LA PIEZA Y
// DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test components/pos-transferencias/nueva/TablaSugeridos.conLaPieza.test.mjs
//
// La tabla se monta de verdad y se ejerce con la misma secuencia de toques
// (`ejercerTabla.mjs`): en cada paso, los campos, los números de la fila y lo
// que le manda a la página. Las filas son las que arma la página desde un
// pedido, y las de la sugerencia automática, que además traen los campos de
// fiambre. Los números son los del código anterior a la tanda 9, sacados
// corriéndolo: `lib/unidades/tanda9.lineaBase.json`.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  FICHAS, LINEAS, LINEA_BASE, PEDIDOS_SIN_PREPARAR, lineaDelDetalle, filaSugeridaDelPedido, filaSugeridaAutomatica,
} from "../../../lib/unidades/tanda9Arnes.mjs";
const { ejercerTabla, desmontarTodo } = await import("./ejercerTabla.mjs");

after(desmontarTodo);

const CASOS = [
  ...LINEAS.filter(([, , c]) => Number(c.sugerido) > 0 && !(Number(c.preparado) > 0)).map(([n, caso, cant]) => [n, caso, cant]),
  ...Object.keys(FICHAS).flatMap((caso) => PEDIDOS_SIN_PREPARAR.map((cant) => [`${caso} ${JSON.stringify(cant)}`, caso, cant])),
];

for (const [nombre, caso, cant] of CASOS) {
  test(`TablaSugeridos igual que antes de la tanda 9, desde un pedido — ${nombre}`, async () => {
    assert.deepEqual(await ejercerTabla("sugeridos", filaSugeridaDelPedido(lineaDelDetalle(caso, cant))), LINEA_BASE.sugeridosDelPedido[nombre]);
  });
  test(`TablaSugeridos igual que antes de la tanda 9, sugerencia automática — ${nombre}`, async () => {
    const esperado = LINEA_BASE.sugeridosAutomaticos[nombre] ?? LINEA_BASE.sugeridosDelPedido[nombre];
    assert.deepEqual(await ejercerTabla("sugeridos", filaSugeridaAutomatica(lineaDelDetalle(caso, cant))), esperado);
  });
}

test("TablaSugeridos convierte con la pieza, no a mano", () => {
  const fuente = fs
    .readFileSync(new URL("./TablaSugeridos.jsx", import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ fromUnidades, toUnidades \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/[*/%]\s*factorPack\b/.test(fuente), "volvió a multiplicar, dividir o partir por el factor a mano");
});
