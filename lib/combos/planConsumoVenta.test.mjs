// Tests del plan consolidado de consumo (helper puro).
// Runner: `node --test lib/combos/planConsumoVenta.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { planConsumoVenta } from "./planConsumoVenta.js";

const normal = (o) => ({ tipo: "NORMAL", precio: 100, costoUnitario: 50, baseStock: { factorPack: 1 }, ...o });
const combo = (o) => ({ tipo: "COMBO", precio: 1000, costoUnitario: 0, componentes: [], ...o });

const consumoDe = (r, plId) => r.consumoFisicoConsolidado.find((c) => c.productoLocalId === plId);

// ── 20) Paridad de conversión: local normal (factor 1) ────────────────────
test("20) normal local: consumo = cantidad", () => {
  const r = planConsumoVenta({ lineas: [normal({ productoLocalId: 10, productoBaseId: 1, cantidad: 3 })], esDeposito: false });
  assert.equal(consumoDe(r, 10).cantidad, 3);
});

test("20.b) depósito pack (unidad_medida pack, modo null) → cantidad × factor", () => {
  const r = planConsumoVenta({
    lineas: [normal({ productoLocalId: 10, productoBaseId: 1, cantidad: 2, baseStock: { factorPack: 6, modo_envio: null, unidad_medida: "pack" } })],
    esDeposito: true,
  });
  assert.equal(consumoDe(r, 10).cantidad, 12);
});

test("20.c) depósito pack + UNIDAD_REMANENTE → cantidad (sin ×factor)", () => {
  const r = planConsumoVenta({
    lineas: [normal({ productoLocalId: 10, productoBaseId: 1, cantidad: 5, modoVentaLinea: "UNIDAD_REMANENTE", baseStock: { factorPack: 6, unidad_medida: "pack" } })],
    esDeposito: true,
  });
  assert.equal(consumoDe(r, 10).cantidad, 5);
});

test("20.d) depósito fiambre PIEZA → cantidad tal cual (piezas)", () => {
  const r = planConsumoVenta({
    lineas: [normal({ productoLocalId: 10, productoBaseId: 1, cantidad: 4, baseStock: { factorPack: 1, modoVentaDeposito: "PIEZA", pesoReferenciaKg: 0.5 } })],
    esDeposito: true,
  });
  assert.equal(consumoDe(r, 10).cantidad, 4);
});

// ── 4) Vender N combos multiplica los componentes ─────────────────────────
test("4) N combos multiplican los componentes", () => {
  const r = planConsumoVenta({
    lineas: [combo({ productoBaseId: 200, comboProductoLocalId: 2000, cantidad: 3, componentes: [
      { productoLocalId: 10, productoBaseId: 1, cantidadPorCombo: 2, costoUnitario: 100 },
      { productoLocalId: 11, productoBaseId: 2, cantidadPorCombo: 1, costoUnitario: 800 },
    ] })],
  });
  assert.equal(consumoDe(r, 10).cantidad, 6);
  assert.equal(consumoDe(r, 11).cantidad, 3);
  assert.deepEqual(r.lineasComerciales[0].componentesCongelables.map((c) => c.cantidad), [6, 3]);
});

// ── 5) Producto directo + combo consolidan el mismo componente ────────────
test("5) normal + combo que comparten componente → consolidan en una entrada", () => {
  const r = planConsumoVenta({
    lineas: [
      normal({ productoLocalId: 10, productoBaseId: 1, cantidad: 3 }),
      combo({ productoBaseId: 200, comboProductoLocalId: 2000, cantidad: 1, componentes: [
        { productoLocalId: 10, productoBaseId: 1, cantidadPorCombo: 2, costoUnitario: 50 },
      ] }),
    ],
    esDeposito: false,
  });
  const c = consumoDe(r, 10);
  assert.equal(c.cantidad, 5); // 3 directo + 2 componente
  assert.equal(c.fuentes.length, 2);
  assert.equal(r.consumoFisicoConsolidado.filter((x) => x.productoLocalId === 10).length, 1);
});

// ── 6) Dos combos comparten un componente y consolidan ────────────────────
test("6) dos combos que comparten componente → consolidan", () => {
  const r = planConsumoVenta({
    lineas: [
      combo({ productoBaseId: 200, comboProductoLocalId: 2000, cantidad: 1, componentes: [{ productoLocalId: 10, productoBaseId: 1, cantidadPorCombo: 2, costoUnitario: 50 }] }),
      combo({ productoBaseId: 201, comboProductoLocalId: 2001, cantidad: 1, componentes: [{ productoLocalId: 10, productoBaseId: 1, cantidadPorCombo: 1, costoUnitario: 50 }] }),
    ],
  });
  assert.equal(consumoDe(r, 10).cantidad, 3);
});

// ── 7) Cada ProductoLocal aparece UNA sola vez en el consumo consolidado ──
test("7) consolidación: una entrada por productoLocalId", () => {
  const r = planConsumoVenta({
    lineas: [
      normal({ productoLocalId: 10, productoBaseId: 1, cantidad: 1 }),
      normal({ productoLocalId: 10, productoBaseId: 1, cantidad: 2 }),
      combo({ productoBaseId: 200, comboProductoLocalId: 2000, cantidad: 1, componentes: [{ productoLocalId: 10, productoBaseId: 1, cantidadPorCombo: 4, costoUnitario: 50 }] }),
    ],
    esDeposito: false,
  });
  assert.equal(r.consumoFisicoConsolidado.length, 1);
  assert.equal(consumoDe(r, 10).cantidad, 7); // 1 + 2 + 4
});

// ── Decimales ─────────────────────────────────────────────────────────────
test("cantidades decimales: 1.5 × 2 combos = 3", () => {
  const r = planConsumoVenta({
    lineas: [combo({ productoBaseId: 200, comboProductoLocalId: 2000, cantidad: 2, componentes: [{ productoLocalId: 10, productoBaseId: 1, cantidadPorCombo: 1.5, costoUnitario: 50 }] })],
  });
  assert.equal(consumoDe(r, 10).cantidad, 3);
});

// ── costoLinea por línea ──────────────────────────────────────────────────
test("costoLinea = costoUnitario × cantidad (combo y normal)", () => {
  const r = planConsumoVenta({
    lineas: [
      normal({ productoLocalId: 10, productoBaseId: 1, cantidad: 3, costoUnitario: 100 }),
      combo({ productoBaseId: 200, comboProductoLocalId: 2000, cantidad: 2, costoUnitario: 300, componentes: [{ productoLocalId: 11, productoBaseId: 2, cantidadPorCombo: 1, costoUnitario: 300 }] }),
    ],
    esDeposito: false,
  });
  assert.equal(r.lineasComerciales[0].costoLinea, 300);
  assert.equal(r.lineasComerciales[1].costoLinea, 600);
});
