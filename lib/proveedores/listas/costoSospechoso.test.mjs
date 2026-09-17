// UN COSTO REDONDO SIN HISTORIAL SE AVISA. UNO CON HISTORIAL, NO.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
//
// De la lista real de M Y F: varios TOSTEX tenían el costo en $1.000,00 exacto
// y "Caja de 1", y los siete daban el mismo +11,4 %. Un costo de mil pesos
// clavado no sale de una factura.
//
// Importa porque TODO el módulo compara contra ese número: un aumento del 11,4 %
// contra un costo inventado no es un aumento del 11,4 %, y el rango esperado
// —que es la defensa principal— juzga un porcentaje que salió del mismo lugar.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/costoSospechoso.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { costoParaMirar, esRedondo, textoDelCostoSospechoso } from "./costoSospechoso.js";

test("mil pesos clavados tiene forma de puesto a mano", () => {
  assert.equal(esRedondo(1000), true);
  // El caso real de la lista de M Y F, que es de donde salió todo esto.
  assert.equal(costoParaMirar({ costoActual: 1000, vecesAplicado: 0 }), true);
});

test("los múltiplos de 100 desde 100 son redondos; el resto no", () => {
  for (const v of [100, 500, 1000, 2500, 56400]) assert.equal(esRedondo(v), true, `${v}`);
  for (const v of [661.7, 1113.67, 1000.01, 999.99, 1430.19]) {
    assert.equal(esRedondo(v), false, `${v}`);
  }
});

test("abajo de 100 no se avisa, y no es un capricho", () => {
  // Un producto de $50 o de $80 redondo es común de verdad: avisar ahí sería un
  // renglón ámbar en media lista, y un aviso que aparece siempre deja de leerse.
  assert.equal(esRedondo(50), false);
  assert.equal(esRedondo(80), false);
  assert.equal(esRedondo(100), true);
});

test("UN COSTO QUE VIENE DE UNA DIVISIÓN NO SE CUELA POR EL BINARIO", () => {
  // `999.9999999999999 % 100` no da 0, pero tampoco da lo que uno espera al
  // revés: un costo que debería ser 1000 y llega con el arrastre del binario
  // tiene que seguir contando como redondo. Se compara sobre centavos enteros.
  assert.equal(esRedondo(999.9999999999999), true);
  assert.equal(esRedondo(1000.0000000001), true);
});

test("CON HISTORIAL NO SE AVISA, aunque el costo sea redondo", () => {
  // ES LA CONDICIÓN QUE HACE QUE EL AVISO SIRVA. Un producto que costaba
  // $952,38 y una lista lo dejó en $1.000,00 es redondo y nadie lo puso a mano.
  // Sin esto, el aviso saldría sobre productos que el sistema mismo actualizó y
  // se volvería ruido.
  assert.equal(costoParaMirar({ costoActual: 1000, vecesAplicado: 1 }), false);
  assert.equal(costoParaMirar({ costoActual: 1000, vecesAplicado: 7 }), false);
});

test("sin historial y redondo, se avisa", () => {
  assert.equal(costoParaMirar({ costoActual: 1000, vecesAplicado: 0 }), true);
  // Y el default es cero: un producto que nunca pasó por una lista no trae el
  // dato, y ése es justamente el caso que hay que mirar.
  assert.equal(costoParaMirar({ costoActual: 1000 }), true);
});

test("sin historial pero con un costo que no es redondo, no se avisa", () => {
  assert.equal(costoParaMirar({ costoActual: 661.7, vecesAplicado: 0 }), false);
});

test("un costo que falta no dispara el aviso", () => {
  // Un producto sin costo cargado ya tiene su propio grupo en la cola de
  // revisión —"Sin costo cargado"— y decir además que "parece cargado a mano"
  // sobre un campo vacío sería un segundo cartel contradiciendo al primero.
  assert.equal(costoParaMirar({ costoActual: null, vecesAplicado: 0 }), false);
  assert.equal(costoParaMirar({ costoActual: 0, vecesAplicado: 0 }), false);
  assert.equal(costoParaMirar({}), false);
});

test("el texto trae el número y le dice a la persona qué hacer", () => {
  const t = textoDelCostoSospechoso(1000);
  assert.match(t, /1\.000/, "tiene que decir cuál es el costo del que se duda");
  assert.match(t, /cargado a mano/);
  assert.match(t, /Revisá que sea real/);
  // Y NO dice que esté mal: no se puede saber desde acá. Un producto puede
  // costar $1.000 de verdad, y el aviso no bloquea nada.
  assert.ok(!/error|inválido|incorrecto/i.test(t), `dijo: ${t}`);
});
