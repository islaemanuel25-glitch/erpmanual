// LAS SUELTAS SON PARTE DE LO RECIBIDO, TAMBIÉN EN LA PLATA DE UNA COMPRA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/sueltasEnLaValorizacion.test.mjs
//
// `cuantoSeValoriza` tomaba solo `cantidadRecibida`, que es el campo de BULTOS.
// Con 2 bultos + 4 sueltas valorizaba 2 bultos; con 0 bultos + 4 sueltas caía a
// la cantidad del PAPEL y valorizaba el renglón entero. Es el mismo defecto que
// la transferencia #373 (b073514), del lado de compras.
//
// La fila tiene la forma que arma `filasDeConciliacion` —`cantidad` del papel,
// `cantidadRecibida` en bultos, `factorPack`, `unidadesSueltas`— con el Yogurt
// Tremblay del pedido #242: PACK x10 a $15.629, 3 bultos en el papel. Las
// sueltas solo existen cuando la hoja contó en bultos, que es este caso.

import { test } from "node:test";
import assert from "node:assert/strict";

import { cuantoSeValoriza } from "@/lib/compras-proveedor/gananciaDelDeposito";
import { totalDeLaLinea } from "@/lib/compras-proveedor/tarjetaDeRecepcion";

const YOGURT = Object.freeze({
  producto: "Yogurt Tremblay Vainilla",
  cantidad: 3,
  unidad: null,
  unidadPedido: "BULTO",
  costoFactura: 15629,
  costoCatalogo: 15629,
  factorPack: 10,
  cantidadRecibida: null,
  unidadesSueltas: null,
  porKilo: false,
});

const alCentavo = (n) => Math.round(n * 100) / 100;

test("0 bultos + 4 sueltas valen 4/10 de bulto, no la cantidad del papel", () => {
  const fila = { ...YOGURT, cantidadRecibida: 0, unidadesSueltas: 4 };
  assert.equal(cuantoSeValoriza(fila), 0.4, "cayó a la cantidad del papel");
  // La tarjeta de recepción hereda la cuenta: 0,4 × $15.629.
  assert.equal(alCentavo(totalDeLaLinea(fila)), 6251.6);
});

test("2 bultos + 4 sueltas valen 2,4 bultos", () => {
  const fila = { ...YOGURT, cantidadRecibida: 2, unidadesSueltas: 4 };
  assert.equal(cuantoSeValoriza(fila), 2.4, "las sueltas no se sumaron");
  assert.equal(alCentavo(totalDeLaLinea(fila)), 37509.6);
});

test("sin sueltas no cambia nada: bultos contados, y el papel si no se contó", () => {
  assert.equal(cuantoSeValoriza({ ...YOGURT, cantidadRecibida: 2, unidadesSueltas: 0 }), 2);
  assert.equal(cuantoSeValoriza({ ...YOGURT, cantidadRecibida: 2 }), 2);
  assert.equal(cuantoSeValoriza(YOGURT), 3);
});
