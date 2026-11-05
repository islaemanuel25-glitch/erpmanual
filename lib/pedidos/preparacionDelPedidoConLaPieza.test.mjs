// TANDA 9 DE LA REGLA ÚNICA DE UNIDADES: `preparacionDelPedido` CUENTA CON LA
// PIEZA Y DA LO MISMO QUE ANTES. Y EL PEDIDO, PREPARADO Y ENVIADO, TAMBIÉN.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/preparacionDelPedidoConLaPieza.test.mjs
//
// Se corren las funciones de la preparación y las de quienes llaman a
// `enUnidades` —la preparación del escritorio y "cambiar por otro"— sobre cada
// línea. Y cada línea se manda y se recibe: lo que viaja, lo que descuenta el
// depósito y lo que entra al local. Los números son los del código anterior a
// la tanda 9, sacados corriéndolo: `lib/unidades/tanda9.lineaBase.json`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { LINEAS, LINEA_BASE, lineaDelDetalle, funcionesDePreparacion, enviarYRecibir } from "../unidades/tanda9Arnes.mjs";

const sin = (o, ...claves) => Object.fromEntries(Object.entries(o).filter(([k]) => !claves.includes(k)));

for (const [nombre, caso, cant] of LINEAS) {
  test(`preparación igual que antes de la tanda 9 — ${nombre}`, () => {
    assert.deepEqual(
      funcionesDePreparacion(lineaDelDetalle(caso, cant)),
      sin(LINEA_BASE.pedidos[nombre], "cantidadEnPantalla", "salePorBulto")
    );
  });
  test(`pedido preparado, enviado y recibido igual que antes — ${nombre}`, () => {
    assert.deepEqual(enviarYRecibir(lineaDelDetalle(caso, cant)), LINEA_BASE.envio[nombre]);
  });
}

test("el maní 1881 viaja en bolsas y entra en kilos: 3 bolsas descuentan 3 y el local recibe 6 kg", () => {
  const r = enviarYRecibir(lineaDelDetalle("mani1881", { sugerido: 3, preparado: 3 }));
  assert.deepEqual([r.saleDelDeposito.cantidad.decrement, r.entraAlLocal, r.saleDelTransito], [3, 6, 3]);
});

test("la preparación convierte con la pieza, no a mano", () => {
  const fuente = fs
    .readFileSync(new URL("./preparacionDelPedido.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ fromUnidades, toUnidades \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/\*\s*Math\.max\(1, Number\(factorPack/.test(fuente), "enUnidades volvió a multiplicar a mano");
  assert.ok(!/%\s*p\.factorPack/.test(fuente), "el texto volvió a partir en bultos a mano");
});
