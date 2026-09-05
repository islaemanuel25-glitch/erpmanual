// Candados del PRECIO DE OFERTA y su porcentaje derivado.
// node --test lib/ofertas/precio.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  descuentoPctDesdePrecios,
  precioDesdeDescuentoPct,
  descuentoUnitario,
  margenOferta,
  validarPrecioOferta,
  validarDescuentoPct,
  resolverCargaDeLinea,
} from "./precio.js";

// ── Las dos formas de cargar, y que den lo mismo ─────────────────────────────
test("cargar $900 sobre $1.000 equivale a cargar 10 %", () => {
  const porPrecio = resolverCargaDeLinea({ precioNormal: 1000, precioOferta: 900 });
  const porPct = resolverCargaDeLinea({ precioNormal: 1000, descuentoPct: 10 });
  assert.equal(porPrecio.precioOferta, 900);
  assert.equal(porPct.precioOferta, 900);
  assert.equal(porPrecio.descuentoPct, 10);
  assert.equal(porPct.descuentoPct, 10);
});

test("si vienen los dos, manda el precio: es la fuente canónica", () => {
  const r = resolverCargaDeLinea({ precioNormal: 1000, precioOferta: 900, descuentoPct: 50 });
  assert.equal(r.precioOferta, 900);
  assert.equal(r.descuentoPct, 10, "el 50 % que vino de más se ignora");
});

test("sin ninguno de los dos, no se guarda nada", () => {
  const r = resolverCargaDeLinea({ precioNormal: 1000 });
  assert.equal(r.valido, false);
  assert.match(r.error, /precio de oferta o el porcentaje/);
});

// ── Derivación ───────────────────────────────────────────────────────────────
test("el porcentaje se deriva del precio y no al revés", () => {
  assert.equal(descuentoPctDesdePrecios(1000, 900), 10);
  assert.equal(descuentoPctDesdePrecios(650, 500), 23.08);
  assert.equal(descuentoPctDesdePrecios(0, 500), null, "sin precio normal no hay porcentaje");
  assert.equal(descuentoPctDesdePrecios(null, 500), null);
});

test("el precio se deriva del porcentaje al cargar", () => {
  assert.equal(precioDesdeDescuentoPct(1000, 10), 900);
  assert.equal(precioDesdeDescuentoPct(999, 15), 849.15);
  assert.equal(precioDesdeDescuentoPct(0, 10), null);
});

test("descuento unitario en pesos", () => {
  assert.equal(descuentoUnitario(1000, 900), 100);
  assert.equal(descuentoUnitario(1000, 1200), 0, "nunca negativo");
});

// ── Margen ───────────────────────────────────────────────────────────────────
test("margen de la oferta contra el costo — el ejemplo del pedido", () => {
  const m = margenOferta(900, 700);
  assert.equal(m.importe, 200);
  assert.equal(m.pct, 22.22);
});

test("margen negativo se informa, no se bloquea", () => {
  const m = margenOferta(900, 1000);
  assert.equal(m.importe, -100);
  assert.ok(m.pct < 0);
});

test("el costo que subió deja el margen del ejemplo: $900 − $820 = $80", () => {
  assert.equal(margenOferta(900, 820).importe, 80);
});

// ── Validaciones ─────────────────────────────────────────────────────────────
test("el precio de oferta tiene que ser menor al normal", () => {
  const r = validarPrecioOferta({ precioNormal: 1000, precioOferta: 1000 });
  assert.equal(r.valido, false);
  assert.match(r.error, /menor al precio normal/);
});

test("un precio de oferta en cero o negativo se rechaza", () => {
  assert.equal(validarPrecioOferta({ precioNormal: 1000, precioOferta: 0 }).valido, false);
  assert.equal(validarPrecioOferta({ precioNormal: 1000, precioOferta: -5 }).valido, false);
});

test("un producto sin precio normal no se puede ofertar", () => {
  const r = validarPrecioOferta({ precioNormal: 0, precioOferta: 900 });
  assert.equal(r.valido, false);
  assert.match(r.error, /precio normal válido/);
});

test("vender bajo costo NO se bloquea: es una decisión comercial", () => {
  const r = validarPrecioOferta({ precioNormal: 1000, precioOferta: 500 });
  assert.equal(r.valido, true, "aunque el costo fuera 700, se deja pasar");
});

test("el descuento tiene que estar entre 0 y 100, sin incluirlos", () => {
  assert.equal(validarDescuentoPct({ precioNormal: 1000, descuentoPct: 0 }).valido, false);
  assert.equal(validarDescuentoPct({ precioNormal: 1000, descuentoPct: 100 }).valido, false);
  assert.equal(validarDescuentoPct({ precioNormal: 1000, descuentoPct: 150 }).valido, false);
  assert.equal(validarDescuentoPct({ precioNormal: 1000, descuentoPct: 0.5 }).valido, true);
});

test("un porcentaje que no es número se rechaza sin romper", () => {
  const r = validarDescuentoPct({ precioNormal: 1000, descuentoPct: "diez" });
  assert.equal(r.valido, false);
  assert.match(r.error, /no es un número/);
});
