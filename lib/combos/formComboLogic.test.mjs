// Tests de la lógica del FormCombo (resumen/disponibilidad/validación).
// Runner: `node --test lib/combos/formComboLogic.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resumenCombo,
  disponibilidadPreview,
  validarComposicionUI,
  validarCabeceraUI,
  precioPorMargen,
} from "./formComboLogic.js";

// ── Precio por margen (espejo del backend) ────────────────────────────────
test("precioPorMargen: costo 1000, margen 50, sin redondeo → 1500", () => {
  assert.equal(precioPorMargen(1000, 50, false), 1500);
});
test("precioPorMargen: costo 100, margen 45, con redondeo a 100 → 200", () => {
  assert.equal(precioPorMargen(100, 45, true), 200);
});
test("precioPorMargen: margen 0 → precio = costo", () => {
  assert.equal(precioPorMargen(750, 0, false), 750);
});

const comp = (o) => ({ componenteProductoLocalId: 1, nombre: "X", cantidad: 1, costoUnitario: 100, stock: 10, tieneStockLocal: true, activo: true, ...o });

// ── 12) Costo, ganancia y margen ──────────────────────────────────────────
test("12) resumen: costo total, ganancia y margen", () => {
  const r = resumenCombo([comp({ costoUnitario: 100, cantidad: 2 }), comp({ componenteProductoLocalId: 2, costoUnitario: 800, cantidad: 1 })], 1200);
  assert.equal(r.costoTotal, 1000);
  assert.equal(r.ganancia, 200);
  assert.equal(r.margen, 20);
  assert.equal(r.aviso, null);
});

// ── 13) Advertir margen negativo (no bloquear) ────────────────────────────
test("13) precio < costo → aviso MARGEN_NEGATIVO", () => {
  const r = resumenCombo([comp({ costoUnitario: 500, cantidad: 1 })], 400);
  assert.equal(r.aviso, "MARGEN_NEGATIVO");
});

test("precio == costo → aviso GANANCIA_CERO", () => {
  const r = resumenCombo([comp({ costoUnitario: 500, cantidad: 1 })], 500);
  assert.equal(r.aviso, "GANANCIA_CERO");
});

// ── 22) Disponibilidad + componente limitante ─────────────────────────────
test("22) disponibilidad preview = componente limitante", () => {
  const r = disponibilidadPreview([
    comp({ componenteProductoLocalId: 1, stock: 10, cantidad: 2 }), // 5
    comp({ componenteProductoLocalId: 2, stock: 3, cantidad: 1 }), // 3
  ]);
  assert.equal(r.disponibilidad, 3);
  assert.equal(r.bloqueadoEstructural, false);
});

test("disponibilidad: componente desactivado → bloqueadoEstructural", () => {
  const r = disponibilidadPreview([comp({ activo: false })]);
  assert.equal(r.disponibilidad, 0);
  assert.equal(r.bloqueadoEstructural, true);
});

// ── 9/10/11) Validación de composición ────────────────────────────────────
test("11) composición vacía → inválida", () => {
  const v = validarComposicionUI([]);
  assert.equal(v.ok, false);
  assert.ok(v.errores.some((e) => e.tipo === "VACIA"));
});

test("9) duplicados → inválida", () => {
  const v = validarComposicionUI([comp({ componenteProductoLocalId: 1 }), comp({ componenteProductoLocalId: 1 })]);
  assert.ok(v.errores.some((e) => e.tipo === "DUPLICADO"));
});

test("10) cantidad <= 0 → inválida", () => {
  const v = validarComposicionUI([comp({ cantidad: 0 })]);
  assert.ok(v.errores.some((e) => e.tipo === "CANTIDAD"));
});

test("15) componente desactivado en la composición → inválida (bloquea guardar)", () => {
  const v = validarComposicionUI([comp({ activo: false })]);
  assert.ok(v.errores.some((e) => e.tipo === "INACTIVO"));
});

test("composición válida → ok", () => {
  const v = validarComposicionUI([comp({ cantidad: 2 })]);
  assert.equal(v.ok, true);
});

// ── Cabecera ──────────────────────────────────────────────────────────────
test("cabecera: nombre vacío o precio <= 0 → inválida", () => {
  assert.equal(validarCabeceraUI({ nombre: "", precioVenta: 100 }).ok, false);
  assert.equal(validarCabeceraUI({ nombre: "C", precioVenta: 0 }).ok, false);
  assert.equal(validarCabeceraUI({ nombre: "C", precioVenta: 100 }).ok, true);
});
