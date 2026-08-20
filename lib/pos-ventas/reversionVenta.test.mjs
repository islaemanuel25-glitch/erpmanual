// Candados del MOTOR DE REVERSIÓN DE UNA VENTA.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ─────────────────────────────────────────────
//
// Estos candados nacieron en `anularVenta.test.mjs`, junto a la ruta que anulaba
// una venta desde Ventas. Esa ruta se retiró el 2026-08-20 —una venta interna se
// corrige desde el REMITO— pero el motor no: lo usa la cancelación de
// transferencias.
//
// Es la segunda vez en dos días que borrar una operación se lleva por delante los
// candados de una pieza que sobrevive. La regla, otra vez: un candado vive con la
// pieza que prueba, no con la pantalla que la estrenó.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { deltaDeDevolucion, impactoEnArqueo } from "./reversionVenta.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

// ── LO QUE HAY QUE DEVOLVER AL STOCK ────────────────────────────────────────

test("1. devuelve exactamente lo que la venta consumió", () => {
  const delta = deltaDeDevolucion([
    { productoLocalId: 7, cantidadStock: 3, componentes: [] },
    { productoLocalId: 9, cantidadStock: 2.5, componentes: [] },
  ]);
  assert.deepEqual(delta, [
    { productoLocalId: 7, delta: 3 },
    { productoLocalId: 9, delta: 2.5 },
  ]);
});

test("1b. un combo devuelve por sus COMPONENTES, no por la línea", () => {
  // La línea del combo no mueve stock: lo mueven sus partes. Devolver por la
  // línea repondría una unidad de un producto que no existe en el inventario.
  const delta = deltaDeDevolucion([
    {
      productoLocalId: 100,
      cantidadStock: 1,
      componentes: [
        { productoLocalId: 7, cantidad: 2 },
        { productoLocalId: 9, cantidad: 1 },
      ],
    },
  ]);
  assert.deepEqual(delta, [
    { productoLocalId: 7, delta: 2 },
    { productoLocalId: 9, delta: 1 },
  ]);
  assert.ok(!delta.some((d) => d.productoLocalId === 100), "el combo en sí no tiene stock");
});

test("1c. un servicio no devuelve nada, y dos líneas del mismo producto se suman", () => {
  // `cantidadStock: null` marca la línea que no mueve stock.
  const conServicio = deltaDeDevolucion([
    { productoLocalId: null, cantidadStock: null, componentes: [] },
    { productoLocalId: 7, cantidadStock: 1, componentes: [] },
    { productoLocalId: 7, cantidadStock: 2, componentes: [] },
  ]);
  assert.deepEqual(conServicio, [{ productoLocalId: 7, delta: 3 }]);
});

test("1d. cantidades cero o inválidas no generan escrituras", () => {
  assert.deepEqual(deltaDeDevolucion([]), []);
  assert.deepEqual(deltaDeDevolucion([{ productoLocalId: 7, cantidadStock: 0, componentes: [] }]), []);
  assert.deepEqual(deltaDeDevolucion([{ productoLocalId: 7, cantidadStock: "x", componentes: [] }]), []);
});

// ── EL IMPACTO EN EL ARQUEO ─────────────────────────────────────────────────

test("2. una venta comercial BAJA el esperado; una interna no lo mueve", () => {
  // La diferencia entre las dos es de cientos de miles de pesos y desde la
  // pantalla se ven iguales. Por eso el número se calcula y se muestra antes de
  // confirmar, en vez de que el cajero lo descubra al cerrar la caja.
  const comercial = {
    transferencia: null,
    anuladaEn: null,
    pagos: [{ medio: "EFECTIVO", monto: 155486.4 }],
  };
  const i = impactoEnArqueo(comercial);
  assert.equal(i.contabaEnArqueo, true);
  assert.equal(i.deltaEsperado, -155486.4);

  const interna = { ...comercial, transferencia: { id: 97 } };
  const k = impactoEnArqueo(interna);
  assert.equal(k.contabaEnArqueo, false);
  assert.equal(k.deltaEsperado, 0, "una interna no estaba en el esperado: revertirla no lo mueve");
  assert.deepEqual(k.medios, []);
});

test("2b. suma todos los medios de un pago dividido", () => {
  const i = impactoEnArqueo({
    transferencia: null,
    anuladaEn: null,
    pagos: [{ medio: "EFECTIVO", monto: 1000 }, { medio: "DEBITO", monto: 500 }],
  });
  assert.equal(i.deltaEsperado, -1500);
  assert.equal(i.medios.length, 2);
});

// ── EL MOTOR, LEÍDO ─────────────────────────────────────────────────────────

const src = () =>
  fs
    .readFileSync(path.join(RAIZ, "lib/pos-ventas/reversionVenta.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("3. REUSA las piezas de la corrección completa, no escribe otras", () => {
  const s = src();
  for (const pieza of ["aplicarDeltaStock", "ajustarCuentaCorriente", "ajustarPuntosCorreccion"]) {
    assert.ok(s.includes(pieza), `el motor dejó de usar ${pieza}: hay una reimplementación al lado`);
  }
});

test("4. NO borra nada: marca", () => {
  const s = src();
  for (const prohibido of ["venta.delete", "ventaDetalle.delete", "ventaPago.delete", "deleteMany"]) {
    assert.ok(!s.includes(prohibido), `el motor usa ${prohibido}: revertir MARCA, no borra`);
  }
  assert.match(s, /anuladaEn: new Date\(\)/);
});

test("5. NO toca la transferencia, y ésa es la mitad que evita la doble devolución", () => {
  // El motor devuelve `cantidad` al local que vendió. Si además cancelara el
  // remito con su propia reversión, el origen recuperaría la mercadería dos
  // veces. Cancelar el remito es del llamador.
  const s = src();
  assert.ok(!/tx\.transferencia\./.test(s), "el motor escribe sobre la transferencia: eso es del llamador");
  assert.ok(!/reversionStockOrigen/.test(s), "el motor revierte el tránsito: eso es del llamador");
});

test("6. no abre su propia transacción: la recibe", () => {
  // Es lo que permite que la cancelación del remito y la reversión de la venta
  // sean todo o nada. Si el motor abriera la suya, serían dos transacciones y
  // una podría quedar aplicada sin la otra.
  const s = src();
  assert.ok(!/\$transaction/.test(s), "el motor abre su propia transacción: rompe la atomicidad del conjunto");
  assert.match(s, /export async function revertirVenta\(\s*tx,/);
});

test("7. bloqueo optimista Y guardia de doble anulación", () => {
  // Sin `anuladaEn: null` en el where, dos reversiones concurrentes devolverían
  // el stock dos veces.
  const s = src();
  assert.match(s, /version: versionBase, anuladaEn: null/);
  assert.match(s, /upd\.count === 0/);
});
