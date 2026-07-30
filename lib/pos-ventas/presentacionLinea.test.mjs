// Tests del helper de presentación y formato de cantidades del comprobante.
// Correr con: node --test lib/pos-ventas/presentacionLinea.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  presentacionLinea,
  formatCantidadPresentacion,
  cantidadDeLinea,
} from "./presentacionLinea.js";

const dep = (o = {}) => ({
  modo: o.modo ?? null,
  factorPack: o.factorPack ?? 1,
  cantidadStock: o.cantidadStock ?? null,
  unidadMedida: o.unidadMedida ?? null,
  modoVentaDeposito: o.modoVentaDeposito ?? "PESO",
  modoEnvio: o.modoEnvio ?? null,
});

// ── presentacionLinea ────────────────────────────────────────────────────────

test("Pack con factor real → 'Pack xN'", () => {
  assert.deepEqual(
    presentacionLinea({ deposito: dep({ modo: "PACK", factorPack: 10, unidadMedida: "pack" }) }),
    { etiqueta: "Pack x10", unidad: "pack" }
  );
  assert.equal(
    presentacionLinea({ deposito: dep({ modo: "PACK", factorPack: 12, unidadMedida: "pack" }) }).etiqueta,
    "Pack x12"
  );
  assert.equal(
    presentacionLinea({ deposito: dep({ modo: "PACK", factorPack: 24, unidadMedida: "pack" }) }).etiqueta,
    "Pack x24"
  );
});

test("cajón → 'Caja xN'", () => {
  assert.equal(
    presentacionLinea({ deposito: dep({ modo: "PACK", factorPack: 6, unidadMedida: "cajon" }) }).etiqueta,
    "Caja x6"
  );
});

test("Pack sin factor válido → 'Pack' sin xN (no se inventa el factor)", () => {
  for (const f of [1, 0, null, undefined, "abc", 1.5, -3]) {
    assert.equal(
      presentacionLinea({ deposito: dep({ modo: "PACK", factorPack: f, unidadMedida: "pack" }) }).etiqueta,
      "Pack",
      `factorPack=${f} no debería producir xN`
    );
  }
});

test("Unidad suelta y SOLO_UNIDAD → 'Unidad'", () => {
  assert.deepEqual(
    presentacionLinea({ deposito: dep({ modo: "UNIDAD", factorPack: 12, unidadMedida: "pack" }) }),
    { etiqueta: "Unidad", unidad: "u" }
  );
  assert.deepEqual(
    presentacionLinea({ deposito: dep({ modo: "UNIDAD", modoEnvio: "SOLO_UNIDAD", unidadMedida: "unidad" }) }),
    { etiqueta: "Unidad", unidad: "u" }
  );
});

test("PIEZA → 'Pieza', y gana sobre unidad_medida kg", () => {
  assert.deepEqual(
    presentacionLinea({ deposito: dep({ modo: "PIEZA", unidadMedida: "kg", modoVentaDeposito: "PIEZA" }) }),
    { etiqueta: "Pieza", unidad: "pz" }
  );
});

test("unidad_medida kg → 'Kg' (nunca 'u'), también sin modo", () => {
  assert.deepEqual(
    presentacionLinea({ deposito: dep({ modo: null, unidadMedida: "kg" }) }),
    { etiqueta: "Kg", unidad: "kg" }
  );
  // Venta en un local (sin modo de depósito) de un producto por peso.
  assert.equal(presentacionLinea({ deposito: dep({ unidadMedida: "kg" }) }).unidad, "kg");
});

test("servicio → 'Servicio'", () => {
  assert.deepEqual(presentacionLinea({ esServicio: true }), { etiqueta: "Servicio", unidad: null });
  // Gana sobre cualquier descriptor.
  assert.equal(
    presentacionLinea({ esServicio: true, deposito: dep({ modo: "PACK", factorPack: 6 }) }).etiqueta,
    "Servicio"
  );
});

test("sin datos suficientes → presentación neutra, nunca 'Unidad' por defecto", () => {
  assert.deepEqual(presentacionLinea({}), { etiqueta: "—", unidad: null });
  assert.deepEqual(presentacionLinea({ deposito: null }), { etiqueta: "—", unidad: null });
  // Línea histórica: sin modo y sin unidad_medida → no se asume unidad (podría ser peso).
  assert.deepEqual(
    presentacionLinea({ deposito: dep({ modo: null, unidadMedida: null }) }),
    { etiqueta: "—", unidad: null }
  );
});

test("sin modo pero con unidad_medida discreta → 'Unidad'", () => {
  assert.equal(presentacionLinea({ deposito: dep({ unidadMedida: "unidad" }) }).etiqueta, "Unidad");
  assert.equal(presentacionLinea({ deposito: dep({ unidadMedida: "pack" }) }).etiqueta, "Unidad");
});

// ── formatCantidadPresentacion ───────────────────────────────────────────────

test("kg: entero sin decimales, fraccionario con 3", () => {
  assert.equal(formatCantidadPresentacion(1, "kg"), "1 kg");
  assert.equal(formatCantidadPresentacion(1.92, "kg"), "1,920 kg");
  assert.equal(formatCantidadPresentacion(3.285, "kg"), "3,285 kg");
  assert.equal(formatCantidadPresentacion(0.5, "kg"), "0,500 kg");
  assert.equal(formatCantidadPresentacion(12, "kg"), "12 kg");
});

test("kg: el separador DECIMAL es coma (el punto solo agrupa miles)", () => {
  for (const n of [1.92, 3.285, 0.755, 1234.5, 12345.678]) {
    const s = formatCantidadPresentacion(n, "kg");
    const num = s.replace(" kg", "");
    assert.ok(num.includes(","), `${s} debería usar coma decimal`);
    // La coma tiene que ser el ÚLTIMO separador: el punto es de miles (1.234,500).
    assert.ok(
      num.lastIndexOf(",") > num.lastIndexOf("."),
      `${s}: el separador decimal debería ser la coma`
    );
  }
  // Y un entero grande agrupa miles con punto, sin decimales.
  assert.equal(formatCantidadPresentacion(1234, "kg"), "1.234 kg");
});

test("unidades discretas: entero sin '3,000'", () => {
  assert.equal(formatCantidadPresentacion(3, "u"), "3 u");
  assert.equal(formatCantidadPresentacion(20, "u"), "20 u");
  assert.equal(formatCantidadPresentacion(1, "pz"), "1 pz");
  assert.equal(formatCantidadPresentacion(4, "pz"), "4 pz");
  for (const u of ["u", "pz", "pack"]) {
    assert.ok(!formatCantidadPresentacion(3, u).includes(",000"));
    assert.ok(!formatCantidadPresentacion(3, u).includes(".000"));
  }
});

test("packs: singular con 1, plural con más", () => {
  assert.equal(formatCantidadPresentacion(1, "pack"), "1 pack");
  assert.equal(formatCantidadPresentacion(2, "pack"), "2 packs");
  assert.equal(formatCantidadPresentacion(3, "pack"), "3 packs");
});

test("fracciones legítimas en unidades discretas conservan precisión útil", () => {
  assert.equal(formatCantidadPresentacion(2.5, "pack"), "2,5 packs");
  assert.equal(formatCantidadPresentacion(0.755, "u"), "0,755 u");
});

test("sin unidad → solo el número", () => {
  assert.equal(formatCantidadPresentacion(3, null), "3");
  assert.equal(formatCantidadPresentacion(1.5, null), "1,5");
});

test("valores inválidos no explotan", () => {
  assert.equal(formatCantidadPresentacion(NaN, "u"), "0 u");
  assert.equal(formatCantidadPresentacion(undefined, "kg"), "0 kg");
  assert.equal(formatCantidadPresentacion(null, null), "0");
});

// ── Integración de los ejemplos del pedido ───────────────────────────────────

test("ejemplos del pedido", () => {
  const casos = [
    [{ deposito: dep({ modo: "PACK", factorPack: 10, unidadMedida: "pack" }), cantidad: 3 }, "Pack x10", "3 packs"],
    [{ deposito: dep({ modo: "PACK", factorPack: 24, unidadMedida: "pack" }), cantidad: 3 }, "Pack x24", "3 packs"],
    [{ deposito: dep({ modo: null, unidadMedida: "kg" }), cantidad: 1.92 }, "Kg", "1,920 kg"],
    [{ deposito: dep({ modo: null, unidadMedida: "kg" }), cantidad: 3.285 }, "Kg", "3,285 kg"],
    [{ deposito: dep({ modo: "PIEZA", unidadMedida: "kg" }), cantidad: 4 }, "Pieza", "4 pz"],
    [{ deposito: dep({ modo: "UNIDAD", unidadMedida: "unidad" }), cantidad: 20 }, "Unidad", "20 u"],
    [{ esServicio: true, cantidad: 1 }, "Servicio", "1"],
  ];
  for (const [linea, etiqueta, cantidad] of casos) {
    assert.equal(presentacionLinea(linea).etiqueta, etiqueta);
    assert.equal(cantidadDeLinea(linea), cantidad);
  }
});
