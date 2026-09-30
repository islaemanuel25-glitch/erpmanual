// CANDADO: LAS CANTIDADES DEL LIBRO SE LEEN CON LA PRESENTACIÓN DEL ERP.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/cantidadesDelLibro.test.mjs
//
// ── EL DEFECTO QUE REPRODUCE ─────────────────────────────────────────────
//
// Producción mostraba "FERNET BRANCA 450ML — Apertura -24 PACK → Ahora -36
// PACK, En tránsito 36 PACK". El libro guarda la copia exacta de
// `StockLocal.cantidad`, que está SIEMPRE en unidades físicas: -36 son 36
// botellas, no 36 packs. La pantalla le pegaba al número la `unidad_medida` del
// producto en mayúsculas, así que un pack x6 con 36 botellas se leía como 36
// packs —seis veces más mercadería de la que había—.
//
// No era el libro: era la etiqueta. La presentación canónica del ERP para una
// cantidad de `StockLocal` es `presentacionCantidadStock`
// (`lib/stock/presentacion.js`), la que usan la tabla y la tarjeta de Stock
// Locales: en el depósito un pack/cajón con factor se desglosa en bultos +
// unidades sueltas; en un local se cuenta en unidades; el kilo en kilos; la
// pieza del depósito en piezas. Este candado exige esa y no otra.
//
// Los productos salen del motor —`identidadMostrada`, `stockDeCadena`,
// `cadenaApi`— con la forma que devuelve la consulta de identidades, no a mano.

import { test } from "node:test";
import assert from "node:assert/strict";

import { PUNTO_CERO_PRODUCCION, estadoDelPeriodo, identidadMostrada, movidoDesdeAgregado, stockDeCadena } from "./stockDiario.js";
import { cadenaApi, periodoApi } from "./stockDiarioApi.js";
import { renglonDeProducto } from "./stockDiarioPantalla.js";
import { presentacionCantidadStock } from "@/lib/stock/presentacion";

const PC = { dia: PUNTO_CERO_PRODUCCION.dia, instante: PUNTO_CERO_PRODUCCION.instanteUTC };
const HOY = "2026-10-05";
const DIA = "2026-10-01";

/** La fila de `ProductoBase` que devuelve la consulta de identidades. */
const base = (x) => ({
  nombre: "FERNET BRANCA 450ML",
  codigoBarra: "779",
  unidadMedida: "pack",
  factorPack: 6,
  pesoReferenciaKg: null,
  pesoEsFijo: false,
  modoCompraProveedor: "BULTO",
  modoVentaDeposito: "PESO",
  categoriaId: null,
  categoriaNombre: null,
  ...x,
});

function respuesta({ esDeposito }) {
  const periodo = estadoDelPeriodo({ desde: DIA, hasta: DIA, puntoCero: PC, hoy: HOY });
  return { ok: true, local: { id: 1, nombre: "X", esDeposito }, ...periodoApi({ periodo, puntoCero: PC, hoy: HOY }, { unidad: "DIA", fecha: DIA }) };
}

function item(r, { apertura, cierre, transito = "0", actual }) {
  const periodo = estadoDelPeriodo({ desde: DIA, hasta: DIA, puntoCero: PC, hoy: HOY });
  const u = (c, t = "0") => ({ tipo: "CAMBIO", cantidadPosterior: c, cantidadAnterior: c, enTransitoPosterior: t, enTransitoAnterior: t });
  return cadenaApi(
    stockDeCadena({
      localId: 1,
      productoLocalId: 9,
      periodo,
      ultimoAntes: u(apertura),
      ultimoHasta: u(cierre, transito),
      movido: movidoDesdeAgregado({}),
      identidad: identidadMostrada({ productoBaseId: 3, actual, congelada: null, productoLocalExiste: true }),
    })
  );
}

test("A. PACK x12 en el depósito: 12 unidades físicas son 1 bulto, no 12 PACK", () => {
  const r = respuesta({ esDeposito: true });
  const f = renglonDeProducto(item(r, { apertura: "12", cierre: "12", actual: base({ factorPack: 12 }) }), r);
  assert.ok(!/PACK/.test(f.linea), f.linea);
  // Singular desde el 2026-10-01: la pieza compartida decía "1 bultos".
  assert.equal(f.linea, "Apertura 1 bulto → Cierre 1 bulto");
});

test("B. PACK x12 en el depósito: 14 unidades son bultos + sueltas, con la pieza canónica", () => {
  const r = respuesta({ esDeposito: true });
  const f = renglonDeProducto(item(r, { apertura: "12", cierre: "14", actual: base({ factorPack: 12 }) }), r);
  const esperado = presentacionCantidadStock({ stock: 14, unidadMedida: "pack", factorPack: 12 }, true).texto;
  assert.equal(esperado, "1 bulto + 2 uds");
  assert.equal(f.linea, `Apertura 1 bulto → Cierre ${esperado}`);
  assert.ok(!/14 PACK/.test(f.linea));
});

test("el caso de producción: FERNET x6 en el depósito, -24 → -36 con 36 en tránsito", () => {
  const r = respuesta({ esDeposito: true });
  const f = renglonDeProducto(item(r, { apertura: "-24", cierre: "-36", transito: "36", actual: base() }), r);
  assert.equal(f.linea, "Apertura -4 bultos → Cierre -6 bultos");
  assert.ok(f.avisos.includes("En tránsito 6 bultos"), f.avisos.join(" | "));
  assert.ok(!f.avisos.some((a) => /PACK/.test(a)));
});

test("un pack en un LOCAL se cuenta en unidades, como en Stock Locales", () => {
  const r = respuesta({ esDeposito: false });
  const f = renglonDeProducto(item(r, { apertura: "12", cierre: "14", actual: base({ factorPack: 12 }) }), r);
  assert.equal(f.linea, "Apertura 12 uds → Cierre 14 uds");
});

test("C. UNIDAD sigue siendo unidad", () => {
  const r = respuesta({ esDeposito: true });
  const f = renglonDeProducto(item(r, { apertura: "18", cierre: "22", actual: base({ unidadMedida: "unidad", factorPack: null }) }), r);
  assert.equal(f.linea, "Apertura 18 uds → Cierre 22 uds");
  assert.equal(f.variacion, "+4 uds");
});

test("D. KG respeta la conversión existente: kilos en el local, piezas en el depósito", () => {
  const kg = base({ unidadMedida: "kg", factorPack: null });
  const rl = respuesta({ esDeposito: false });
  assert.equal(renglonDeProducto(item(rl, { apertura: "3.8", cierre: "2.95", actual: kg }), rl).linea, "Apertura 3.800 kg → Cierre 2.950 kg");
  // Fiambre de pieza fija: en el depósito la fila está en PIEZAS.
  const pieza = base({ unidadMedida: "kg", factorPack: null, modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 2.5 });
  const rd = respuesta({ esDeposito: true });
  assert.equal(renglonDeProducto(item(rd, { apertura: "6", cierre: "4", actual: pieza }), rd).linea, "Apertura 6 pzs → Cierre 4 pzs");
});

test("CONTRAPRUEBA: ningún renglón etiqueta la cantidad física con la unidad de medida en mayúsculas", () => {
  const r = respuesta({ esDeposito: true });
  for (const um of ["pack", "cajon", "unidad", "kg"]) {
    const f = renglonDeProducto(item(r, { apertura: "24", cierre: "36", transito: "12", actual: base({ unidadMedida: um }) }), r);
    const todo = [f.linea, f.variacion, ...f.avisos].join(" ");
    assert.ok(!new RegExp(`\\b${um.toUpperCase()}\\b`).test(todo), `${um}: ${todo}`);
  }
});
