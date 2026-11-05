// LA REGLA ÚNICA DE UNIDADES, TANDA 7: EL PESO FIJO NO TIENE BULTO DE UNIDADES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/unidades/stockPesoFijo.test.mjs
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// El MANI CON CASCARA X2KG (id 1881). Su ficha real, leída en producción con
// una consulta de solo lectura el 2026-11-05: factor_pack 2, unidad_medida kg,
// compra por UNIDAD, pesoReferenciaKg 2, modoVentaDeposito PIEZA, pesoEsFijo
// true, modo_envio SOLO_UNIDAD. En el depósito se maneja por bolsa de 2 kg y en
// los locales se vende por kilo, y Emanuel confirmó que la ficha está bien así.
//
// Compras ya la leía bien con `comoViene`: fiambre, costo por kilo, factor 1.
// Stock tomaba el `factor_pack` como un bulto de 2 unidades, y de ahí salían
// dos errores. Dividía por 2 el precio unitario de las pantallas de stock del
// local, y al despachar en BULTO descontaba el doble del depósito. La tanda 7
// hace que stock lea la ficha con la misma pieza que compras.
//
// El despacho, con el camino completo hasta la recepción, está en
// `lib/transferencias/crearTransferencia.test.mjs`, que tiene el doble de
// Prisma. Acá van el precio y la comprobación de que la ruta de envío calcula
// el factor con la pieza.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { comoViene, precioDeLaUnidadDeStock } from "./reglaDeUnidades.js";
import { mapStockItemLocal } from "../stock/mapItem.js";
import { precioUnitarioDeObtener, preciosDeVentaDeLaBusqueda } from "../stock/preciosDeStock.js";

// La ficha real, con los precios por kilo de ejemplo. `redondeo_100` en true
// es el default de la columna.
const FICHA_1881 = {
  id: 1881, nombre: "MANI CON CASCARA X2KG", codigo_barra: null, factor_pack: 2, unidad_medida: "kg",
  modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 2, modoVentaDeposito: "PIEZA", pesoEsFijo: true,
  modo_envio: "SOLO_UNIDAD", sueltos_por_unidad: null, redondeo_100: true,
  precio_costo: 3000, precio_venta: 5000,
};
// La contraprueba: un pack común de 12, con los números del caso A de la tanda 6.
const PACK_12 = {
  id: 1, nombre: "Pack de 12", codigo_barra: null, factor_pack: 12, unidad_medida: "pack",
  modoCompraProveedor: "BULTO", pesoReferenciaKg: null, modoVentaDeposito: "PESO", pesoEsFijo: false,
  sueltos_por_unidad: null, redondeo_100: true, precio_costo: 38400, precio_venta: 50000,
};
const pl = (base) => ({ id: 1, localId: 2, baseId: base.id, precio_costo: base.precio_costo, precio_venta: base.precio_venta, margen: null, base });

test("1881: compras y stock leen la misma ficha — factor 1, el costo es por kilo", () => {
  assert.deepEqual(comoViene(FICHA_1881), { naturaleza: "FIAMBRE", factor: 1 });
  assert.equal(precioDeLaUnidadDeStock({ precio: 3000, base: FICHA_1881 }), 3000, "el kilo no se divide por 2");
});

test("1881: las tres pantallas de stock del local muestran el kilo sin dividir por 2", () => {
  const item = mapStockItemLocal(pl(FICHA_1881), FICHA_1881, { cantidad: -0.213, stockMin: null, stockMax: null, limitesConfiguradosAt: null });
  assert.deepEqual([item.stock, item.precioUnitario, item.precioVentaUnitario], [-0.213, 3000, 5000], "listar");
  assert.equal(precioUnitarioDeObtener(pl(FICHA_1881)).precioUnitario, 3000, "obtener");
  const r = preciosDeVentaDeLaBusqueda(pl(FICHA_1881), false);
  assert.deepEqual([r.precioVentaUnitario, r.precioVentaBulto, r.unidadMedida], [5000, 5000, "kg"], "buscar-producto en el local");
});

test("1881: en el depósito sigue por pieza, como antes de la tanda — la bolsa vale 2 kg", () => {
  const r = preciosDeVentaDeLaBusqueda(pl(FICHA_1881), true);
  assert.deepEqual([r.precioVentaUnitario, r.precioVentaBulto, r.unidadMedida], [10000, 10000, "unidad"]);
});

test("contraprueba: el pack común de 12 da los mismos números que antes de la tanda", () => {
  assert.equal(comoViene(PACK_12).factor, 12);
  assert.equal(precioDeLaUnidadDeStock({ precio: 38400, base: PACK_12 }), 3200);
  const item = mapStockItemLocal(pl(PACK_12), PACK_12, { cantidad: 30, stockMin: null, stockMax: null, limitesConfiguradosAt: null });
  assert.deepEqual([item.precioUnitario, item.precioVentaUnitario], [3200, 4200]);
  assert.equal(precioUnitarioDeObtener(pl(PACK_12)).precioUnitario, 3200);
  const r = preciosDeVentaDeLaBusqueda(pl(PACK_12), false);
  assert.deepEqual([r.precioVentaUnitario, r.precioVentaBulto], [4200, 50000]);
});

test("LA RUTA DE ENVÍO CALCULA EL FACTOR CON LA PIEZA, NO CON EL factor_pack CRUDO", () => {
  const ruta = fs
    .readFileSync(new URL("../../app/api/pos-transferencias/enviar/route.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(ruta, /import \{ comoViene \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.match(ruta, /const factorPack = comoViene\(base\)\.factor;/);
  assert.ok(!/const factorPack = Number\(base\?\.factor_pack/.test(ruta), "enviar volvió a leer el factor_pack crudo");
  // Y ese factor es el que viaja a crearTransferencia y a la validación de stock.
  assert.match(ruta, /factorPack: item\.factorPack,/);
});
