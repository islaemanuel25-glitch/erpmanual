// CANDADO: LOS MODALES DE AJUSTE Y DE LÍMITES, DIBUJADOS DE VERDAD.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_locales/modalesStockPiezaRender.test.mjs
//
// ── EL DEFECTO ─────────────────────────────────────────────────────────────
//
// QUETH CHISITOS 400G con 6 piezas en el depósito: la tarjeta decía "6 pzs" y el
// modal de ajuste, en la misma pantalla, "Stock actual: 6.000 kg" y
// "Cantidad (kg)". El modal decidía la unidad mirando solo `unidadMedida`. El
// número guardado estaba bien; el rótulo invitaba a escribir kilos en una fila
// de piezas.
//
// Se ejecuta el JSX en vez de leerlo: un candado que busca texto en el fuente
// no distingue un rótulo que se dibuja de uno que quedó en una rama muerta. Los
// productos se arman con los mapeadores REALES del listado, que es lo que la
// página le pasa al modal.
//
// ── LO QUE ESTO NO PRUEBA ──────────────────────────────────────────────────
//
// El guardado —que la cantidad llegue a la ruta y termine en la fila— lo prueba
// contra PostgreSQL `scripts/pruebas-db/ajusteStockPieza.mjs`. Y que se VEA bien
// lo tiene que mirar una persona con la pantalla abierta.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import ModalAjuste from "@/components/stock_locales/ModalAjuste";
import ModalLimites from "@/components/stock_locales/ModalLimites";
import { mapStockItemDeposito, mapStockItemLocal } from "@/lib/stock/mapItem";

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
const pesoFijo = (nombre, peso, o = {}) =>
  base({ nombre, unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: peso, pesoEsFijo: true, modoVentaDeposito: "PIEZA", ...o });

const CHISITO = pesoFijo("QUETH CHISITOS 400G", 0.4);
const MANI = pesoFijo("MANI CON CASCARA x2KG", 2, { factor_pack: 2 });
const MORTADELA = pesoFijo("Mortadela", 4.5);
const VARIABLE = base({ nombre: "Cremoso", unidad_medida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5 });

const fila = (cantidad, o = {}) => ({ cantidad, stockMin: null, stockMax: null, limitesConfiguradosAt: null, ...o });
const DEPOSITO = { id: 1, nombre: "Depósito", esDeposito: true };
const LOCAL = { id: 2, nombre: "Local", esDeposito: false };
const enDeposito = (b, cantidad, o) => mapStockItemDeposito({ id: 55, localId: 1, margen: 50 }, b, fila(cantidad, o), 1);
const enLocal = (b, cantidad, o) => mapStockItemLocal({ id: 66, localId: 2, margen: 50 }, b, fila(cantidad, o));

// El texto visible, sin etiquetas: así un rótulo partido en dos nodos se lee igual.
const texto = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const ajuste = (producto, local) =>
  renderToStaticMarkup(createElement(ModalAjuste, { open: true, onClose: () => {}, producto, local }));
const limites = (producto, local) =>
  renderToStaticMarkup(createElement(ModalLimites, { open: true, onClose: () => {}, producto, local }));
const pasoDelCampo = (html) => [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)].map((m) => m[0].match(/step="([^"]+)"/)?.[1]);

test("A1. CHISITO en el depósito: 6 pzs, equivale a 2.400 kg, Cantidad (pzs) y paso entero", () => {
  const html = ajuste(enDeposito(CHISITO, 6), DEPOSITO);
  const t = texto(html);
  assert.match(t, /Stock actual: 6 pzs/);
  assert.match(t, /equivale a 2\.400 kg/);
  assert.match(t, /Cantidad \(pzs\)/);
  assert.doesNotMatch(t, /6\.000 kg/, "volvió a leer las piezas como kilos");
  assert.doesNotMatch(t, /Cantidad \(kg\)/);
  assert.deepEqual(pasoDelCampo(html), ["1"]);
});

test("A2. CHISITO en el local: 2.400 kg, Cantidad (kg) y paso de gramo", () => {
  const html = ajuste(enLocal(CHISITO, 2.4), LOCAL);
  const t = texto(html);
  assert.match(t, /Stock actual: 2\.400 kg/);
  assert.match(t, /Cantidad \(kg\)/);
  assert.doesNotMatch(t, /pzs|equivale/);
  assert.deepEqual(pasoDelCampo(html), ["0.001"]);
});

test("A3. MANÍ 2KG: 3 pzs en el depósito (no 3 kg), 6 kg en el local", () => {
  const dep = texto(ajuste(enDeposito(MANI, 3), DEPOSITO));
  assert.match(dep, /Stock actual: 3 pzs/);
  assert.match(dep, /equivale a 6\.000 kg/);
  assert.doesNotMatch(dep, /3\.000 kg/);
  assert.match(texto(ajuste(enLocal(MANI, 6), LOCAL)), /Stock actual: 6\.000 kg/);
});

test("A4. MORTADELA 4,5 KG: 2 pzs en el depósito, 9 kg en el local", () => {
  const dep = texto(ajuste(enDeposito(MORTADELA, 2), DEPOSITO));
  assert.match(dep, /Stock actual: 2 pzs/);
  assert.match(dep, /equivale a 9\.000 kg/);
  assert.match(texto(ajuste(enLocal(MORTADELA, 9), LOCAL)), /Stock actual: 9\.000 kg/);
});

test("A5. PESO VARIABLE: 4.730 kg en el depósito, sin piezas", () => {
  const html = ajuste(enDeposito(VARIABLE, 4.73), DEPOSITO);
  const t = texto(html);
  assert.match(t, /Stock actual: 4\.730 kg/);
  assert.match(t, /Cantidad \(kg\)/);
  assert.doesNotMatch(t, /pzs|equivale/);
  assert.deepEqual(pasoDelCampo(html), ["0.001"]);
});

test("A6. UNIDAD, PACK y CAJÓN: el modal sigue igual que antes", () => {
  const unidad = ajuste(enDeposito(base({ nombre: "Alfajor" }), 5), DEPOSITO);
  assert.match(texto(unidad), /Stock actual: 5 unidades/);
  assert.match(texto(unidad), /Cantidad \(unidades\)/);
  assert.deepEqual(pasoDelCampo(unidad), ["1"]);

  const pack = texto(ajuste(enDeposito(base({ nombre: "Gaseosa", unidad_medida: "pack", factor_pack: 6 }), 45), DEPOSITO));
  assert.match(pack, /Presentación: Pack x6/);
  assert.match(pack, /Stock actual: 7 bultos \+ 3 uds/);
  assert.match(pack, /Bultos/);

  const cajonLocal = texto(ajuste(enLocal(base({ nombre: "Cerveza", unidad_medida: "cajon", factor_pack: 8 }), 20), LOCAL));
  assert.match(cajonLocal, /Stock actual: 20 unidades/);
  assert.match(cajonLocal, /Cantidad \(unidades\)/);
});

test("L1. LÍMITES del peso fijo en el depósito: en pzs y con paso entero", () => {
  const html = limites(enDeposito(CHISITO, 6, { stockMin: 2, stockMax: 10, limitesConfiguradosAt: new Date() }), DEPOSITO);
  const t = texto(html);
  assert.match(t, /Stock mínimo \(pzs\)/);
  assert.match(t, /Stock máximo \(pzs\)/);
  assert.deepEqual(pasoDelCampo(html), ["1", "1"]);
});

test("L2. LÍMITES en el local y del peso variable: kilos con decimales, sin pzs", () => {
  for (const [producto, local] of [[enLocal(CHISITO, 2.4), LOCAL], [enDeposito(VARIABLE, 4.73), DEPOSITO]]) {
    const html = limites(producto, local);
    assert.doesNotMatch(texto(html), /pzs/);
    assert.deepEqual(pasoDelCampo(html), ["0.001", "0.001"]);
  }
});

test("L3. LÍMITES de pack en el depósito: siguen en bultos", () => {
  const html = limites(enDeposito(base({ unidad_medida: "pack", factor_pack: 6 }), 45), DEPOSITO);
  assert.match(texto(html), /Stock mínimo \(bultos\)/);
  assert.deepEqual(pasoDelCampo(html), ["1", "1"]);
});
