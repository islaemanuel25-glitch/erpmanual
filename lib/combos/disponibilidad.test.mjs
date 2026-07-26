// Tests de disponibilidad de combos (componente limitante).
// Runner nativo: `node --test lib/combos/disponibilidad.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { disponibilidadCombo } from "./disponibilidad.js";

const comp = (over = {}) => ({
  componenteProductoLocalId: 1,
  cantidad: 1,
  activo: true,
  tieneStockLocal: true,
  stock: 10,
  ...over,
});

// ── 14) Disponibilidad por componente LIMITANTE ───────────────────────────
test("14) min(floor(stock/cantidad)) → componente limitante", () => {
  // 10 Coca / 2 = 5 ; 3 Fernet / 1 = 3 → 3
  const r = disponibilidadCombo({
    componentes: [
      comp({ componenteProductoLocalId: 1, stock: 10, cantidad: 2 }),
      comp({ componenteProductoLocalId: 2, stock: 3, cantidad: 1 }),
    ],
  });
  assert.equal(r.disponibilidad, 3);
  assert.equal(r.inconsistente, false);
});

test("14.b) floor real: 7/2 = 3 (no 3.5)", () => {
  const r = disponibilidadCombo({ componentes: [comp({ stock: 7, cantidad: 2 })] });
  assert.equal(r.disponibilidad, 3);
});

// ── 15) Disponibilidad CERO por componente inactivo / sin stock ───────────
test("15) componente inactivo → disponibilidad 0", () => {
  const r = disponibilidadCombo({
    componentes: [comp({ stock: 100, cantidad: 1, activo: false })],
  });
  assert.equal(r.disponibilidad, 0);
  assert.deepEqual(r.motivos, [{ componenteProductoLocalId: 1, motivo: "INACTIVO" }]);
});

test("15.b) componente sin StockLocal → disponibilidad 0", () => {
  const r = disponibilidadCombo({
    componentes: [comp({ tieneStockLocal: false, stock: null, cantidad: 1 })],
  });
  assert.equal(r.disponibilidad, 0);
  assert.equal(r.motivos[0].motivo, "SIN_STOCKLOCAL");
});

// ── Cantidad inválida → inconsistencia (no vender) ────────────────────────
test("cantidad <= 0 → inconsistente y disponibilidad 0", () => {
  const r = disponibilidadCombo({ componentes: [comp({ cantidad: 0 })] });
  assert.equal(r.disponibilidad, 0);
  assert.equal(r.inconsistente, true);
  assert.equal(r.motivos[0].motivo, "CANTIDAD_INVALIDA");
});

// ── Composición vacía → 0 e inconsistente ─────────────────────────────────
test("sin componentes → disponibilidad 0 e inconsistente", () => {
  const r = disponibilidadCombo({ componentes: [] });
  assert.equal(r.disponibilidad, 0);
  assert.equal(r.inconsistente, true);
});

// ── allowNegativeStock: se informa, no se devuelve disponibilidad infinita ─
test("allowNegativeStock: disponibilidad física real + flag (no infinita)", () => {
  const r = disponibilidadCombo({
    componentes: [comp({ stock: 0, cantidad: 1 })],
    allowNegativeStock: true,
  });
  assert.equal(r.disponibilidad, 0); // física, no infinita
  assert.equal(r.allowNegativeStock, true);
  assert.ok(Number.isFinite(r.disponibilidad));
});

test("stock negativo → disponibilidad física 0 (no negativa)", () => {
  const r = disponibilidadCombo({ componentes: [comp({ stock: -5, cantidad: 1 })] });
  assert.equal(r.disponibilidad, 0);
});
