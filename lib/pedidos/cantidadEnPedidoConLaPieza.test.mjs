// TANDA 15 DE LA REGLA ÚNICA DE UNIDADES: `cantidadEnPedido` PREGUNTA POR BULTOS
// ENTEROS A LA PIEZA Y VALIDA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/cantidadEnPedidoConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 15
// (`lib/unidades/tanda15Arnes.mjs`): 672 cambios de cantidad.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { pedidos, huella } from "../unidades/tanda15Arnes.mjs";

test("la cantidad en pedido se valida igual que antes de la tanda 15 (grilla completa)", async () => {
  assert.equal(huella(await pedidos()), "268e23db539910453ff2ef10973e702ef400e4525f6c5a20939db1afe96a02b9");
});

test("los casos de la tanda: solo por bulto exige múltiplos del bulto en UNIDAD", async () => {
  const p = await pedidos();
  assert.equal(p["pack12|SOLO_BULTO|UNIDAD|24"].ok, true);
  assert.equal(p["pack12|SOLO_BULTO|UNIDAD|25"].error, "Este producto se pide por bulto completo (x12).");
  assert.equal(p["pack12|MIXTO|UNIDAD|25"].ok, true);
  assert.equal(p["pack12|SOLO_BULTO|BULTO|3"].ok, true);
  assert.equal(p["mani1881|SOLO_UNIDAD|UNIDAD|3"].ok, true, "el maní real sale solo por unidad");
});

test("la pregunta por bultos enteros va a la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./cantidadEnPedido.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ bultosDe \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/cantidad % factorPack/.test(fuente), "volvió a contar a mano");
});
