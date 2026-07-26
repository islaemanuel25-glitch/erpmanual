// Tests del cálculo de costo de combos.
// Runner nativo: `node --test lib/combos/costo.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costoUnitarioComponente,
  costoCombo,
  gananciaYMargen,
} from "./costo.js";

// ── 11) Costo unitario con OVERRIDE local ─────────────────────────────────
test("11) override ProductoLocal.precio_costo gana sobre la base", () => {
  const c = costoUnitarioComponente({
    base: { precio_costo: 100, factor_pack: 1 },
    productoLocal: { precio_costo: 60 },
  });
  assert.equal(c, 60);
});

// ── 12) Costo unitario con FALLBACK a la base ─────────────────────────────
test("12) sin override → usa ProductoBase.precio_costo", () => {
  const c = costoUnitarioComponente({
    base: { precio_costo: 100, factor_pack: 1 },
    productoLocal: { precio_costo: null },
  });
  assert.equal(c, 100);
});

test("12.b) override 0 NO cae al fallback ('??', no '||')", () => {
  const c = costoUnitarioComponente({
    base: { precio_costo: 100, factor_pack: 1 },
    productoLocal: { precio_costo: 0 },
  });
  assert.equal(c, 0);
});

// ── 13) Costo por BULTO / factor_pack ─────────────────────────────────────
test("13) factor_pack > 1: el costo está por bulto → dividir", () => {
  const c = costoUnitarioComponente({
    base: { precio_costo: 1200, factor_pack: 12 },
    productoLocal: { precio_costo: null },
  });
  assert.equal(c, 100);
});

test("13.b) factor_pack = 1: sin división", () => {
  const c = costoUnitarioComponente({
    base: { precio_costo: 350, factor_pack: 1 },
    productoLocal: {},
  });
  assert.equal(c, 350);
});

// ── Fiambre fijo (depósito): costo por pieza = costoPorKg × pesoReferenciaKg ─
const fiambreBase = {
  precio_costo: 2000, // por kg
  factor_pack: null,
  unidad_medida: "kg",
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: 0.5,
  modoVentaDeposito: "PIEZA",
};

test("Fiambre fijo en DEPÓSITO: multiplica por pesoReferenciaKg", () => {
  const c = costoUnitarioComponente({
    base: fiambreBase,
    productoLocal: { precio_costo: null },
    esDeposito: true,
  });
  assert.equal(c, 1000); // 2000 × 0.5
});

test("Fiambre fijo NO en depósito: se trata como normal (sin multiplicar)", () => {
  const c = costoUnitarioComponente({
    base: fiambreBase,
    productoLocal: { precio_costo: null },
    esDeposito: false,
  });
  assert.equal(c, 2000);
});

// ── Costo total del combo ─────────────────────────────────────────────────
test("costoCombo = Σ(costoUnitario × cantidad)", () => {
  const total = costoCombo([
    { costoUnitario: 100, cantidad: 2 }, // 200
    { costoUnitario: 800, cantidad: 1 }, // 800
  ]);
  assert.equal(total, 1000);
});

// ── Ganancia y margen ─────────────────────────────────────────────────────
test("gananciaYMargen: precio 1000, costo 800 → ganancia 200, margen 25%", () => {
  const { ganancia, margen } = gananciaYMargen({ precioVenta: 1000, costoTotal: 800 });
  assert.equal(ganancia, 200);
  assert.equal(margen, 25);
});

test("gananciaYMargen: costo 0 → margen null (no divide por cero)", () => {
  const { ganancia, margen } = gananciaYMargen({ precioVenta: 500, costoTotal: 0 });
  assert.equal(ganancia, 500);
  assert.equal(margen, null);
});
