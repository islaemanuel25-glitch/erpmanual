// TANDAS 15 Y 16 DE LA REGLA ÚNICA DE UNIDADES: EL STOCK VALORIZADO DIVIDE CON
// LA PIEZA, Y EL MANÍ 1881 DEJA DE VALORIZARSE A LA MITAD.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/reportes-stock/valorizado/valorizadoConLaPieza.test.mjs
//
// Las dos divisiones viven adentro del manejador de la ruta. Desde la tanda 16
// la ruta pide el precio de una unidad de stock a `precioDeLaUnidadDeStock`, la
// misma función de las pantallas de stock desde la tanda 7, que lee la ficha
// con la pieza.
//
// ── LO QUE CAMBIÓ EN LA TANDA 16, Y SOLO ESO ───────────────────────────────
//
// Antes la ruta dividía por el `factor_pack` crudo —`Math.max(1,
// safeNum(base.factor_pack) || 1)`, solo si era mayor que 1—, y el maní se
// valorizaba a 3.000 ÷ 2 = 1.500 el kilo. Ahora no se divide: 3.000 el kilo en
// un local, y en el depósito, que cuenta bolsas, 3.000 × 2 kg = 6.000 la bolsa
// (antes 3.000). La ficha de prueba "kilo con pack" cambia igual; en producción
// no hay ninguna.
//
// Para todas las demás fichas de la grilla —packs de 12 y de 24, cajón con
// sueltos, kilo, fiambre por pieza, unidad con factor— la función da
// exactamente lo que daba la cuenta de antes, con cada precio de la grilla.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { precioDeLaUnidadDeStock } from "../../../../lib/unidades/reglaDeUnidades.js";
import { BASES } from "../../../../lib/unidades/tanda15Arnes.mjs";
import { esFiambreFijo } from "../../../../lib/conversiones/stock.js";

const safeNum = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const comoDividiaLaRuta = (precio, base) => {
  const factor = Math.max(1, safeNum(base.factor_pack) || 1);
  return factor > 1 ? precio / factor : precio;
};
// La cuenta de la ruta después de dividir: en el depósito, un fiambre fijo pasa
// del kilo a la pieza.
const comoValorizaLaRuta = (precio, base, esDeposito) => {
  const unidad = precioDeLaUnidadDeStock({ precio, base });
  const peso = safeNum(base.pesoReferenciaKg);
  return esDeposito && esFiambreFijo(base) && peso > 0 ? unidad * peso : unidad;
};

test("para todo lo que no es el maní ni el kilo con pack, da lo mismo que la cuenta de antes", () => {
  const fichas = Object.entries(BASES).filter(([k]) => k !== "mani1881" && k !== "kgPack");
  assert.deepEqual(fichas.map(([k]) => k).sort(), ["fiambrePieza", "kilo", "pack12", "sueltos", "unidad12"]);
  for (const [k, base] of fichas) for (const precio of [38400, 50000, 3000, 1480, 1999, 0, 0.01, base.precio_costo, base.precio_venta]) {
    assert.equal(precioDeLaUnidadDeStock({ precio, base }), comoDividiaLaRuta(precio, base), `${k} a ${precio}`);
  }
});

test("TANDA 16: con la ficha real, el maní vale 3.000 el kilo en un local y 6.000 la bolsa en el depósito", () => {
  const mani = BASES.mani1881;
  assert.equal(comoDividiaLaRuta(3000, mani), 1500, "lo que daba antes");
  assert.equal(comoValorizaLaRuta(3000, mani, false), 3000);
  assert.equal(comoValorizaLaRuta(3000, mani, true), 6000, "antes 3.000");
  assert.equal(comoValorizaLaRuta(5000, mani, false), 5000, "la venta, igual");
});

test("TANDA 16, CONTRAPRUEBA: el pack de 12 y el producto por kilo siguen igual", () => {
  for (const esDeposito of [false, true]) {
    assert.equal(comoValorizaLaRuta(38400, BASES.pack12, esDeposito), 3200);
    assert.equal(comoValorizaLaRuta(8000, BASES.kilo, esDeposito), 8000);
  }
});

test("la ruta pide el precio de una unidad a la pieza, no lo divide a mano", () => {
  const fuente = fs.readFileSync(new URL("./route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ precioDeLaUnidadDeStock \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.match(fuente, /let precioCostoUnitario = precioDeLaUnidadDeStock\(\{ precio: precioCostoBase, base \}\);/);
  assert.match(fuente, /let precioVentaUnitario = precioDeLaUnidadDeStock\(\{ precio: precioVentaBase, base \}\);/);
  assert.match(fuente, /precioCostoUnitario = precioCostoUnitario \* pesoRef;/, "el depósito sigue pasando el fiambre fijo a la pieza");
  assert.ok(!/(precioCostoBase|precioVentaBase) \/ factor/.test(fuente), "volvió a dividir a mano");
  assert.ok(!/base\.factor_pack/.test(fuente), "volvió a leer el factor crudo");
});
