// Candados de "¿hace falta volver a pedir esto?".
//
// ── POR QUÉ ESTA REGLA NECESITA CANDADOS ────────────────────────────────────
//
// Porque las dos formas de equivocarse son invisibles y opuestas:
//
//   · de más → sale un segundo pedido idéntico mientras el primero viaja. No
//     rompe nada, no se ve, y duplica el trabajo del servidor en la pantalla que
//     esta tanda vino a acelerar. Es exactamente lo que pasó con la primera
//     versión del arreglo, y se descubrió leyendo el log del servidor;
//   · de menos → se saltea un pedido que hacía falta, y el catálogo se queda con
//     los datos de otra ubicación o de otra página. Eso sí se ve, y es peor.
//
// Ninguna de las dos la atrapa el build ni la pantalla abierta una vez.

import { test } from "node:test";
import assert from "node:assert/strict";

import { pedidoYaSalio } from "./pedidoYaSalio.js";

const CLAVE = '{"page":1,"filtros":{}}';
const OTRA = '{"page":2,"filtros":{}}';

test("G1. sin ningún pedido anotado, hay que pedir", () => {
  assert.equal(pedidoYaSalio(null, CLAVE, 0), false);
  assert.equal(pedidoYaSalio(undefined, CLAVE, 3), false);
});

test("G2. si cambió lo que se pide, hay que pedir de nuevo", () => {
  // El caso que rompería el paginador: comparar solo la ubicación haría que
  // pasar de página no pidiera nada y el listado se quedara clavado.
  const pedido = { clave: CLAVE, localIdPedido: 3, localIdRespondido: 3 };
  assert.equal(pedidoYaSalio(pedido, OTRA, 3), false);
});

test("G3. EL CASO DE LA CASCADA: salió sin ubicación y todavía viaja", () => {
  // Es el que corrige el defecto medido en el log. El pedido anticipado está en
  // el aire; llega el contexto con la ubicación; NO hay que pedir de nuevo,
  // porque ese pedido ya está contestando por esa misma ubicación.
  const enElAire = { clave: CLAVE, localIdPedido: null };
  assert.equal(pedidoYaSalio(enElAire, CLAVE, 3), true);
  assert.equal(pedidoYaSalio(enElAire, CLAVE, 0), true);
});

test("G4. contraprueba de G3: si hubiera salido CON otra ubicación, sí hay que pedir", () => {
  // Sin esta rama, G3 podría estar contestando que sí a todo.
  const otroLocal = { clave: CLAVE, localIdPedido: 7 };
  assert.equal(pedidoYaSalio(otroLocal, CLAVE, 3), false);
  assert.equal(pedidoYaSalio(otroLocal, CLAVE, 7), true);
});

test("G5. ya volvió y contestó por la misma ubicación: no se vuelve a pedir", () => {
  const servido = { clave: CLAVE, localIdPedido: null, localIdRespondido: 3 };
  assert.equal(pedidoYaSalio(servido, CLAVE, 3), true);
});

test("G6. LA RED DE SEGURIDAD: contestó por OTRA ubicación, hay que pedir", () => {
  // Solo puede pasar si la cookie de contexto cambió entre los dos pedidos. Es
  // la única rama que debe pedir dos veces, y es la que no puede faltar: sin
  // ella, la pantalla mostraría el catálogo de otro local sin decirlo.
  const servido = { clave: CLAVE, localIdPedido: null, localIdRespondido: 9 };
  assert.equal(pedidoYaSalio(servido, CLAVE, 3), false);
});

test("G7. un servidor viejo que no dice la ubicación no bloquea la pantalla", () => {
  // `localIdRespondido: null` es "contestó pero no dijo cuál". Con la ubicación
  // ya conocida hay que volver a pedir —una vez, que es el comportamiento de
  // antes de esta tanda— en vez de dar por buena una ubicación que nadie
  // confirmó.
  const sinDecir = { clave: CLAVE, localIdPedido: null, localIdRespondido: null };
  assert.equal(pedidoYaSalio(sinDecir, CLAVE, 3), false);
  // Y mientras la ubicación no se conoce, lo que contestó es lo único que hay.
  assert.equal(pedidoYaSalio(sinDecir, CLAVE, 0), true);
});

test("G8. el pedido anotado al salir no se confunde con uno que ya volvió", () => {
  // La diferencia entre las dos formas es un campo AUSENTE, no un null: si
  // `localIdRespondido` en `undefined` se leyera igual que en `null`, el pedido
  // en el aire se trataría como contestado-sin-decir y volvería el pedido doble.
  const enElAire = { clave: CLAVE, localIdPedido: null };
  const volvioSinDecir = { clave: CLAVE, localIdPedido: null, localIdRespondido: null };
  assert.equal(pedidoYaSalio(enElAire, CLAVE, 3), true);
  assert.equal(pedidoYaSalio(volvioSinDecir, CLAVE, 3), false);
});
