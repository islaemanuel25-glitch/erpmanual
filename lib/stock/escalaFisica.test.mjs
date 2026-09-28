// CANDADOS DE LA UNIDAD FÍSICA DE UNA FILA DE STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/escalaFisica.test.mjs
//
// El peso fijo se cuenta en PIEZAS en el depósito y en KILOS en los locales; el
// resto no cambia. Los ítems se arman con los mapeadores REALES del listado
// —`mapStockItemDeposito` y `mapStockItemLocal`—, que son los que le llegan a los
// modales, no con un objeto escrito a mano con la forma que uno supone.

import test from "node:test";
import assert from "node:assert/strict";

import { mapStockItemDeposito, mapStockItemLocal } from "@/lib/stock/mapItem";
import { presentacionCantidadStock, unidadFisicaDeItem, esFiambreFijoItem } from "@/lib/stock/presentacion";
import {
  UNIDAD_FISICA_STOCK,
  TEXTO_PIEZA_FRACCIONADA,
  motivoCantidadNoAdmitida,
  unidadFisicaDeStock,
} from "@/lib/stock/escalaFisica";
import { esFiambreFijoEnUbicacion } from "@/lib/conversiones/stock";

const { PIEZA, KG, UNIDAD } = UNIDAD_FISICA_STOCK;

const base = (o = {}) => ({
  id: 10,
  nombre: "Producto",
  codigo_barra: "779",
  categoria_id: 1,
  proveedor_id: 2,
  area_fisica_id: null,
  unidad_medida: "unidad",
  factor_pack: 1,
  precio_costo: 100,
  precio_venta: 150,
  redondeo_100: false,
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
  modoVentaDeposito: "PESO",
  ...o,
});

// Las familias del encargo, con la configuración que el formulario de producto
// permite cargar: la venta por pieza solo aparece con compra "por pieza".
const CASOS = {
  CHISITO: base({ nombre: "QUETH CHISITOS 400G", unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 0.4, pesoEsFijo: true, modoVentaDeposito: "PIEZA" }),
  MANI: base({ nombre: "MANI CON CASCARA x2KG", unidad_medida: "kg", factor_pack: 2, modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 2, pesoEsFijo: true, modoVentaDeposito: "PIEZA" }),
  MORTADELA: base({ nombre: "Mortadela", unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5, pesoEsFijo: true, modoVentaDeposito: "PIEZA" }),
  VARIABLE: base({ nombre: "Cremoso", unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5, pesoEsFijo: false, modoVentaDeposito: "PESO" }),
  UNIDAD: base({ nombre: "Alfajor", unidad_medida: "unidad" }),
  PACK: base({ nombre: "Gaseosa x6", unidad_medida: "pack", factor_pack: 6 }),
  CAJON: base({ nombre: "Cerveza x8", unidad_medida: "cajon", factor_pack: 8 }),
};

const fila = (cantidad) => ({ cantidad, stockMin: null, stockMax: null, limitesConfiguradosAt: null });
const enDeposito = (b, cantidad) => mapStockItemDeposito({ id: 55, localId: 1, margen: 50 }, b, fila(cantidad), 1);
const enLocal = (b, cantidad) => mapStockItemLocal({ id: 66, localId: 2, margen: 50 }, b, fila(cantidad));

test("1. CHISITO 400G: 6 en el depósito son 6 PIEZAS, 2,4 en el local son KILOS", () => {
  const dep = enDeposito(CASOS.CHISITO, 6);
  assert.equal(unidadFisicaDeItem(dep, true), PIEZA);
  assert.equal(presentacionCantidadStock(dep, true).texto, "6 pzs");

  const loc = enLocal(CASOS.CHISITO, 2.4);
  assert.equal(unidadFisicaDeItem(loc, false), KG);
  assert.equal(presentacionCantidadStock(loc, false).texto, "2.400 kg");
});

test("2. MANÍ 2KG: 3 en el depósito son 3 pzs y NO 3 kg; 6 en el local son 6 kg", () => {
  // El factor 2 no participa: la pieza la decide el peso de referencia.
  const dep = enDeposito(CASOS.MANI, 3);
  assert.equal(unidadFisicaDeItem(dep, true), PIEZA);
  assert.equal(presentacionCantidadStock(dep, true).texto, "3 pzs");

  const loc = enLocal(CASOS.MANI, 6);
  assert.equal(unidadFisicaDeItem(loc, false), KG);
  assert.equal(presentacionCantidadStock(loc, false).texto, "6.000 kg");
});

test("3. MORTADELA 4,5 KG: 2 pzs en el depósito, 9 kg en el local", () => {
  assert.equal(presentacionCantidadStock(enDeposito(CASOS.MORTADELA, 2), true).texto, "2 pzs");
  assert.equal(unidadFisicaDeItem(enDeposito(CASOS.MORTADELA, 2), true), PIEZA);
  assert.equal(presentacionCantidadStock(enLocal(CASOS.MORTADELA, 9), false).texto, "9.000 kg");
  assert.equal(unidadFisicaDeItem(enLocal(CASOS.MORTADELA, 9), false), KG);
});

test("4. PESO VARIABLE: 4,730 kg siguen siendo 4,730 kg, también en el depósito", () => {
  const dep = enDeposito(CASOS.VARIABLE, 4.73);
  assert.equal(unidadFisicaDeItem(dep, true), KG);
  assert.equal(presentacionCantidadStock(dep, true).texto, "4.730 kg");
  assert.equal(motivoCantidadNoAdmitida(4.73, KG), null);
});

test("5. UNIDAD, PACK y CAJÓN no cambian: son UNIDAD en las dos ubicaciones", () => {
  for (const clave of ["UNIDAD", "PACK", "CAJON"]) {
    assert.equal(unidadFisicaDeItem(enDeposito(CASOS[clave], 45), true), UNIDAD, clave);
    assert.equal(unidadFisicaDeItem(enLocal(CASOS[clave], 45), false), UNIDAD, clave);
    assert.equal(motivoCantidadNoAdmitida(3, UNIDAD), null);
  }
  // La presentación del depósito sigue desglosando bultos.
  assert.equal(presentacionCantidadStock(enDeposito(CASOS.PACK, 45), true).texto, "7 bultos + 3 uds");
  assert.equal(presentacionCantidadStock(enDeposito(CASOS.CAJON, 16), true).texto, "2 bultos");
  assert.equal(presentacionCantidadStock(enDeposito(CASOS.UNIDAD, 5), true).texto, "5 uds");
});

test("6. MEDIA PIEZA NO; kilos con decimales SÍ", () => {
  assert.equal(motivoCantidadNoAdmitida(0.5, PIEZA), TEXTO_PIEZA_FRACCIONADA);
  assert.equal(motivoCantidadNoAdmitida(2.5, PIEZA), TEXTO_PIEZA_FRACCIONADA);
  assert.equal(motivoCantidadNoAdmitida("0.5", PIEZA), TEXTO_PIEZA_FRACCIONADA);
  for (const n of [2, 8, 10, 0]) assert.equal(motivoCantidadNoAdmitida(n, PIEZA), null, String(n));
  assert.equal(motivoCantidadNoAdmitida(0.5, KG), null);
  assert.equal(motivoCantidadNoAdmitida(2.4, KG), null);
});

test("7. UNA SOLA DECISIÓN: la unidad física coincide con el predicado único y con la tabla", () => {
  // Si alguna vez divergen, el modal diría una cosa y la tabla otra, que es
  // exactamente el defecto que esto cierra.
  for (const [clave, b] of Object.entries(CASOS)) {
    for (const esDeposito of [true, false]) {
      const esPieza = unidadFisicaDeStock(b, esDeposito) === PIEZA;
      assert.equal(esPieza, esFiambreFijoEnUbicacion(b, esDeposito), `${clave} ${esDeposito}`);
      const item = esDeposito ? enDeposito(b, 1) : enLocal(b, 1);
      assert.equal(esPieza, esDeposito && esFiambreFijoItem(item), `${clave} ${esDeposito} (item)`);
    }
  }
});
