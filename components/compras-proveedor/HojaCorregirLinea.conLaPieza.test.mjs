// TANDA 13 DE LA REGLA ÚNICA DE UNIDADES: LA HOJA DE CORREGIR CUENTA CON LA
// PIEZA, CON LA MISMA FUNCIÓN QUE LA TARJETA, Y DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/HojaCorregirLinea.conLaPieza.test.mjs
//
// Las dos cuentas viven adentro de un `useMemo` del componente. El candado
// afirma que la hoja las hace con `enUnidadesDeLaFila` —la de
// `estadoDeLineaFacturada`, que es la de la tarjeta— y que esa función da
// exactamente lo que daban las expresiones de antes: `b * factor + s` y
// `cantidadDeLaFactura * factor`, con el factor tal como lo arma la hoja.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { enUnidadesDeLaFila } from "../../lib/compras-proveedor/estadoDeLineaFacturada.js";

const comoLoArmaLaHoja = (vaPorPack, factorPack) => (vaPorPack ? Number(factorPack) || 1 : 1);

test("enUnidadesDeLaFila da lo mismo que las cuentas de antes de la hoja, en toda la grilla", () => {
  for (const vaPorPack of [true, false]) for (const crudo of [null, 1, 2, 6, 12, 24, "12"]) for (const b of [0, 1, 2, 2.5, -1, 7]) for (const s of [0, 3, 6, 11]) {
    const factor = comoLoArmaLaHoja(vaPorPack, crudo);
    assert.equal(enUnidadesDeLaFila(b, factor) + s, b * factor + s, `${b} bultos y ${s} sueltas, factor ${crudo}`);
  }
});

test("los casos de la tanda: 2 bultos y 6 sueltas de 12 son 30; 2 de 24, 48; el maní, sin pack, cuenta tal cual", () => {
  assert.equal(enUnidadesDeLaFila(2, 12) + 6, 30);
  assert.equal(enUnidadesDeLaFila(2, 24), 48);
  assert.equal(enUnidadesDeLaFila(3, comoLoArmaLaHoja(false, 2)), 3);
});

test("la hoja cuenta con la función compartida, no a mano, y sigue sin escribir el factor del producto", () => {
  const fuente = fs.readFileSync(new URL("./HojaCorregirLinea.jsx", import.meta.url), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /return enUnidadesDeLaFila\(b, factor\) \+ s;/);
  assert.match(fuente, /const ofrecidas = enUnidadesDeLaFila\(Number\(cantidadDeLaFactura\) \|\| 0, factor\);/);
  assert.ok(!/b \* factor|\) \* factor/.test(fuente), "volvió a multiplicar a mano");
  assert.ok(!/factor_pack:\s/.test(fuente));
});

// ── TANDA 16: EL AVISO DE CANTIDAD CONTRA PRECIO YA NO PIDE 6 POR 3 BOLSAS ──
//
// La hoja le pasaba al control el `factorPack` crudo de la fila, y para el maní
// 1881 es 2: con 3 bolsas en el papel, el aviso decía "Tendrían que ser 6" —y si
// se ofrecían 6, cuadraba sin avisar—. Ahora le pasa el bulto leído con la pieza
// (`bultoDeLaFila`), y el maní no tiene bulto. La fila sale de la ficha real con
// `aplanarDetalles`, que es como la arma la conciliación; la llamada es la de la
// hoja, campo por campo, con el maní pedido por unidad (SOLO_UNIDAD).

import { bultoDeLaFila } from "../../lib/compras-proveedor/estadoDeLineaFacturada.js";
import { aplanarDetalles } from "../../lib/compras-proveedor/comprobante/analisisDeComprobante.js";
import { laCantidadCuadraConElPrecio, textoDeLaEscalaQueNoCuadra } from "../../lib/compras-proveedor/laCantidadCuadraConElPrecio.js";
import P from "../../lib/unidades/posVentaConLaPieza.productos.json" with { type: "json" };

const filaDe = (base, extra) => ({ ...aplanarDetalles([{ id: 1, cantidad: 3, precioCosto: base.precio_costo, unidad: "UNIDAD", producto: { baseId: base.id, base } }])[0], ...extra });
const comoLlamaLaHoja = (fila, ofrecidas) =>
  laCantidadCuadraConElPrecio({ subtotal: fila?.subtotal, cantidad: fila?.cantidad, fisicas: ofrecidas, porKilo: fila?.porKilo === true, factorPack: bultoDeLaFila(fila) });

test("TANDA 16: 3 bolsas de maní esperan 3, no 6, con su ficha real", () => {
  const fila = filaDe(P.base_mani1881, { subtotal: 18000 });
  const corto = comoLlamaLaHoja(fila, 2);
  assert.equal(corto.cuadra, false);
  assert.equal(corto.esperado, 3, "antes: 6");
  assert.match(textoDeLaEscalaQueNoCuadra(corto), /Tendrían que ser 3\./);
  assert.equal(comoLlamaLaHoja(fila, 3).cuadra, true, "las 3 bolsas del papel cuadran");
  assert.equal(comoLlamaLaHoja(fila, 6).cuadra, false, "antes, 6 cuadraban sin avisar");
});

test("TANDA 16, CONTRAPRUEBA: el pack de 12 y el producto por kilo siguen igual", () => {
  const pack = filaDe(P.base_pack12, { subtotal: 115200 });
  assert.deepEqual(comoLlamaLaHoja(pack, 36), { aplica: true, cuadra: true, esperado: 36, valuado: 115200, precioUnitario: 3200, subtotal: 115200 });
  assert.equal(comoLlamaLaHoja(pack, 24).esperado, 36);
  const kilo = filaDe(P.base_kilo, { subtotal: 24000, porKilo: true });
  assert.equal(comoLlamaLaHoja(kilo, 3).aplica, false);
});

test("TANDA 16: la hoja le pasa al control el bulto leído con la pieza", () => {
  const fuente = fs.readFileSync(new URL("./HojaCorregirLinea.jsx", import.meta.url), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  // Desde el 2026-11-07 la hoja y el cierre llaman a la misma función con la
  // fila (`laCantidadCuadraDeLaFila`), y es ella la que lee el bulto con la pieza.
  assert.match(fuente, /laCantidadCuadraDeLaFila\(\{ fila, fisicas: ofrecidas \}\)/);
  const lib = fs.readFileSync(new URL("../../lib/compras-proveedor/laCantidadCuadraConElPrecio.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const j = lib.indexOf("export function laCantidadCuadraDeLaFila");
  assert.ok(j > 0);
  assert.match(lib.slice(j, j + 900), /factorPack: bultoDeLaFila\(fila\),/);
  assert.match(fuente, /\}, \[cantidadDeLaFactura, vaPorPack, fila\]\);/, "el memo se recalcula si cambia la fila");
});
