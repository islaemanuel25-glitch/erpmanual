// CANDADOS DE LA FUNCIÓN CANÓNICA DE COSTO POR UNIDAD FÍSICA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/conversiones/costoPorUnidadFisica.test.mjs
//
// Tres grupos:
//
//   1. la matriz de las reglas de negocio, familia por familia, con los casos
//      que las fijaron —el maní, el Chisito, el pack roto—;
//   2. la conformidad con Productos: donde hoy la ficha y la función deberían
//      contestar lo mismo, contestan lo mismo, con las mismas funciones que usa
//      la ficha (`escalaDeVentaDe` + `valorEnLaEscalaDeVenta`);
//   3. la divergencia conocida, escrita como afirmación: con compra por bulto la
//      ficha dice kilo y la regla dice pieza. El día que se corrija la ficha, este
//      candado se pone rojo y hay que mirarlo.
//
// La conformidad contra `buscar-producto` del POS necesita la ruta real y vive en
// `scripts/pruebas-db/costoPorUnidadFisica.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANOMALIA_COSTO_FISICO as A,
  ESTADO_COSTO_FISICO as E,
  REGLA_COSTO_FISICO as R,
  costoPorUnidadFisica,
} from "./costoPorUnidadFisica.js";
import {
  ESCALA_KG,
  ESCALA_PIEZA,
  ESCALA_UNIDAD,
  escalaDeVentaDe,
  valorEnLaEscalaDeVenta,
} from "../precios/escalaDeVenta.js";

const deposito = (costoBase, producto, extra = {}) =>
  costoPorUnidadFisica({ costoBase, producto, esDeposito: true, ...extra });
const local = (costoBase, producto, extra = {}) =>
  costoPorUnidadFisica({ costoBase, producto, esDeposito: false, ...extra });

// Los productos, con los nombres de la base (como los trae Prisma).
const MANI = Object.freeze({
  unidad_medida: "kg",
  factor_pack: 2,
  pesoReferenciaKg: 2,
  modoVentaDeposito: "PIEZA",
  modoCompraProveedor: "UNIDAD",
});
const CHISITO = Object.freeze({
  unidad_medida: "kg",
  factor_pack: null,
  pesoReferenciaKg: 0.4,
  modoVentaDeposito: "PIEZA",
  modoCompraProveedor: "BULTO",
});
const KG_POR_PESO = Object.freeze({ unidad_medida: "kg", pesoReferenciaKg: null, modoVentaDeposito: "PESO" });
// Un cremoso: pieza de peso variable. El peso de referencia es orientativo y
// el depósito lo maneja por peso; no hay peso fijo que usar.
const CREMOSO = Object.freeze({ unidad_medida: "kg", pesoReferenciaKg: 4.5, modoVentaDeposito: "PESO" });
const UNIDAD = Object.freeze({ unidad_medida: "unidad", factor_pack: null, modoVentaDeposito: "PESO" });
const PACK6 = Object.freeze({ unidad_medida: "pack", factor_pack: 6, modoVentaDeposito: "PESO" });
const CAJON8 = Object.freeze({ unidad_medida: "cajon", factor_pack: 8, modoVentaDeposito: "PESO" });

// ── 1. LA MATRIZ ───────────────────────────────────────────────────────────

test("MANÍ en el depósito: 1 pieza de 2 kg a $4.500/kg vale $9.000", () => {
  const r = deposito(4500, MANI);
  assert.equal(r.estado, E.CONOCIDO);
  assert.equal(r.unidadFisica, "PIEZA");
  assert.equal(r.costoEfectivo, 4500);
  assert.equal(r.costoPorUnidadFisica, 9000);
  assert.equal(r.regla, R.KG_POR_PIEZA_EN_DEPOSITO);
  assert.deepEqual(r.anomalias, [A.KG_CON_FACTOR]);
});

test("el mismo MANÍ en un local: $4.500 el kilo", () => {
  const r = local(4500, MANI);
  assert.equal(r.unidadFisica, "KG");
  assert.equal(r.costoPorUnidadFisica, 4500);
  assert.equal(r.regla, R.KG_POR_KILO);
});

test("CONTRAPRUEBA: el factor del maní de 2 a 99 no mueve nada — el factor no participa en kg", () => {
  const con99 = { ...MANI, factor_pack: 99 };
  assert.equal(deposito(4500, con99).costoPorUnidadFisica, 9000);
  assert.equal(local(4500, con99).costoPorUnidadFisica, 4500);
  const sinFactor = { ...MANI, factor_pack: null };
  assert.equal(deposito(4500, sinFactor).costoPorUnidadFisica, 9000);
  assert.deepEqual(deposito(4500, sinFactor).anomalias, [], "sin factor no hay nada que advertir");
});

test("CHISITO: bolsa de 0,400 kg en el depósito, por kilo en el local", () => {
  const d = deposito(5000, CHISITO);
  assert.equal(d.unidadFisica, "PIEZA");
  assert.equal(d.costoPorUnidadFisica, 2000);
  const l = local(5000, CHISITO);
  assert.equal(l.unidadFisica, "KG");
  assert.equal(l.costoPorUnidadFisica, 5000);
  // Una bolsa vale lo mismo que los 0,400 kg que llegan al local.
  assert.equal(d.costoPorUnidadFisica, 0.4 * l.costoPorUnidadFisica);
});

test("el modo de compra NO decide la pieza: comprado por bulto sigue siendo pieza, y se avisan configuración y divergencia", () => {
  const porBulto = deposito(4500, { ...MANI, modoCompraProveedor: "BULTO" });
  assert.equal(porBulto.unidadFisica, "PIEZA");
  assert.equal(porBulto.costoPorUnidadFisica, 9000);
  assert.deepEqual(porBulto.anomalias, [A.KG_CON_FACTOR, A.PIEZA_COMPRADA_POR_BULTO, A.PIEZA_NO_RECONOCIDA_POR_ESCRITORES]);
  // Comprado por unidad: ni configuración rara ni divergencia.
  assert.deepEqual(deposito(4500, MANI).anomalias, [A.KG_CON_FACTOR]);
});

test("CONTRAPRUEBA: sin compra por BULTO no hay PIEZA_COMPRADA_POR_BULTO, aunque esFiambreFijo no lo reconozca", () => {
  // Un modo de compra que no vino, o que no es BULTO, NO es compra por bulto.
  // Negar esFiambreFijo lo marcaba igual: acá solo queda la divergencia con los
  // escritores, que es lo que esa negación demuestra de verdad.
  for (const modoCompraProveedor of [null, undefined, "", "OTRO"]) {
    const r = deposito(4500, { ...MANI, modoCompraProveedor });
    assert.equal(r.costoPorUnidadFisica, 9000, `valor con ${JSON.stringify(modoCompraProveedor)}`);
    assert.ok(!r.anomalias.includes(A.PIEZA_COMPRADA_POR_BULTO), `marcó bulto con ${JSON.stringify(modoCompraProveedor)}`);
    assert.ok(r.anomalias.includes(A.PIEZA_NO_RECONOCIDA_POR_ESCRITORES), `sin divergencia con ${JSON.stringify(modoCompraProveedor)}`);
  }
  // El enum se lee sin importar mayúsculas, como el clasificador de presentaciones.
  assert.ok(deposito(4500, { ...MANI, modoCompraProveedor: "bulto" }).anomalias.includes(A.PIEZA_COMPRADA_POR_BULTO));
  assert.ok(!deposito(4500, { ...MANI, modoCompraProveedor: "unidad" }).anomalias.includes(A.PIEZA_COMPRADA_POR_BULTO));
  // Fuera del depósito no hay pieza, así que no hay ninguno de los dos avisos.
  assert.deepEqual(local(5000, CHISITO).anomalias, []);
});

test("kg por peso: el costo por kilo, en el depósito y en el local", () => {
  for (const esDeposito of [true, false]) {
    const r = costoPorUnidadFisica({ costoBase: 3800, producto: KG_POR_PESO, esDeposito });
    assert.equal(r.unidadFisica, "KG");
    assert.equal(r.costoPorUnidadFisica, 3800);
  }
});

test("kg de peso variable: por kilo; el peso de referencia no se usa como peso fijo", () => {
  const r = deposito(12000, CREMOSO);
  assert.equal(r.unidadFisica, "KG");
  assert.equal(r.costoPorUnidadFisica, 12000);
  assert.deepEqual(r.anomalias, []);
});

test("PIEZA sin peso: no se puede contar por pieza, se cuenta por kilo — igual que todos los predicados de hoy", () => {
  // Sin anomalía: ni la regla ni los escritores lo cuentan por pieza sin peso,
  // así que no hay divergencia. Ver el encabezado de la función.
  for (const pesoReferenciaKg of [0, null]) {
    const r = deposito(3000, { ...KG_POR_PESO, modoVentaDeposito: "PIEZA", pesoReferenciaKg });
    assert.equal(r.unidadFisica, "KG");
    assert.equal(r.costoPorUnidadFisica, 3000);
    assert.deepEqual(r.anomalias, []);
  }
});

test("unidad: el costo tal cual", () => {
  const r = deposito(1000, UNIDAD);
  assert.equal(r.unidadFisica, "UNIDAD");
  assert.equal(r.costoPorUnidadFisica, 1000);
  assert.equal(r.regla, R.POR_UNIDAD);
});

test("PACK x6 a $12.000: $2.000 la unidad, en el depósito y en el local", () => {
  for (const esDeposito of [true, false]) {
    const r = costoPorUnidadFisica({ costoBase: 12000, producto: PACK6, esDeposito });
    assert.equal(r.unidadFisica, "UNIDAD");
    assert.equal(r.costoPorUnidadFisica, 2000);
    assert.equal(r.regla, R.BULTO_A_UNIDAD);
  }
  assert.equal(deposito(24000, CAJON8).costoPorUnidadFisica, 3000);
});

test("PACK roto: la unidad sigue valiendo $2.000; con 5 unidades en stock, $10.000", () => {
  const r = deposito(12000, PACK6);
  assert.equal(r.costoPorUnidadFisica, 2000);
  // La función no sabe nada de recepciones: valorizar es cantidad × unidad.
  assert.equal(5 * r.costoPorUnidadFisica, 10000);
});

test("configuraciones raras de bulto: se usa lo guardado y se avisa, sin inventar equivalencias", () => {
  for (const factor_pack of [1, null, 0]) {
    const r = deposito(9000, { unidad_medida: "cajon", factor_pack, modoVentaDeposito: "PESO" });
    assert.equal(r.costoPorUnidadFisica, 9000, `cajón con factor ${factor_pack}`);
    assert.equal(r.estado, E.CONOCIDO);
    assert.deepEqual(r.anomalias, [A.BULTO_SIN_FACTOR]);
  }
  const unidadConFactor = deposito(1000, { ...UNIDAD, factor_pack: 12 });
  assert.equal(unidadConFactor.costoPorUnidadFisica, 1000, "una unidad no se divide por su factor");
  assert.deepEqual(unidadConFactor.anomalias, [A.UNIDAD_CON_FACTOR]);
  const piezaNoKg = deposito(1000, { ...UNIDAD, modoVentaDeposito: "PIEZA", pesoReferenciaKg: 2 });
  assert.equal(piezaNoKg.unidadFisica, "UNIDAD");
  assert.equal(piezaNoKg.costoPorUnidadFisica, 1000);
  assert.deepEqual(piezaNoKg.anomalias, [A.PIEZA_EN_PRODUCTO_NO_KG]);
});

test("COMBO: no aplica, aunque tenga costo", () => {
  const r = deposito(5000, { unidad_medida: "unidad", es_combo: true });
  assert.equal(r.estado, E.NO_APLICA);
  assert.equal(r.costoPorUnidadFisica, null);
  assert.equal(r.unidadFisica, null);
  assert.equal(r.regla, R.COMBO);
});

test("SIN COSTO explícito: nunca un cero", () => {
  for (const costoBase of [0, null, undefined, "", "abc", -10]) {
    const r = deposito(costoBase, PACK6);
    assert.equal(r.estado, E.SIN_COSTO, `costo ${JSON.stringify(costoBase)}`);
    assert.equal(r.costoPorUnidadFisica, null);
    assert.equal(r.costoEfectivo, null);
    assert.equal(r.unidadFisica, "UNIDAD", "la unidad se sabe aunque falte el costo");
  }
  assert.equal(deposito(0, MANI).unidadFisica, "PIEZA");
});

test("el costo efectivo es el de precioDeLaUbicacion: el del local si es un precio, un cero no lo es", () => {
  assert.equal(local(4500, MANI, { costoLocal: 5000 }).costoPorUnidadFisica, 5000);
  assert.equal(local(4500, MANI, { costoLocal: 0 }).costoPorUnidadFisica, 4500);
  assert.equal(local(4500, MANI, { costoLocal: null }).costoPorUnidadFisica, 4500);
  assert.equal(local(0, MANI, { costoLocal: 0 }).estado, E.SIN_COSTO);
});

test("acepta la escala con los nombres del mapper y valores Decimal como texto", () => {
  const r = costoPorUnidadFisica({
    costoBase: "4500.00",
    producto: { unidadMedida: "kg", factorPack: 2, pesoReferenciaKg: "2.000", modoVentaDeposito: "PIEZA" },
    esDeposito: true,
  });
  assert.equal(r.costoPorUnidadFisica, 9000);
  assert.equal(deposito(12000, { unidadMedida: "pack", factorPack: 6 }).costoPorUnidadFisica, 2000);
});

test("una unidad de medida fuera del enum es la única conversión ambigua", () => {
  const r = deposito(1000, { unidad_medida: "litro" });
  assert.equal(r.estado, E.CONVERSION_AMBIGUA);
  assert.equal(r.costoPorUnidadFisica, null);
  assert.equal(r.regla, R.UNIDAD_DE_MEDIDA_DESCONOCIDA);
});

test("la ubicación es obligatoria y booleana: no hay un default que cambie la unidad en silencio", () => {
  for (const esDeposito of [undefined, null, 1, "true"]) {
    assert.throws(() => costoPorUnidadFisica({ costoBase: 1, producto: UNIDAD, esDeposito }), /esDeposito booleano/);
  }
  assert.throws(() => costoPorUnidadFisica({ costoBase: 1, esDeposito: true }), /producto/);
});

test("es pura: no toca lo que recibe", () => {
  // MANI está congelado: si la función escribiera en él, lanzaría en modo estricto.
  assert.doesNotThrow(() => deposito(4500, MANI));
  assert.deepEqual(deposito(4500, MANI), deposito(4500, MANI));
});

// ── 2. CONFORMIDAD CON PRODUCTOS ───────────────────────────────────────────
//
// La ficha decide la escala con `escalaDeVentaDe` y lleva el valor con
// `valorEnLaEscalaDeVenta` (app/modulos/productos/page.jsx:2896). Para cada
// producto en el que la ficha y la regla coinciden, la unidad física de la
// función corresponde a la escala de la ficha y el valor es el mismo.

const ESCALA_DE_LA_UNIDAD = { PIEZA: ESCALA_PIEZA, KG: ESCALA_KG, UNIDAD: ESCALA_UNIDAD };

function comoLaFicha(producto, costo, esDeposito) {
  // Los campos con los nombres que lee la ficha (mapper).
  const p = {
    unidadMedida: producto.unidad_medida,
    factorPack: producto.factor_pack ?? null,
    pesoReferenciaKg: producto.pesoReferenciaKg ?? null,
    modoVentaDeposito: producto.modoVentaDeposito,
    modoCompraProveedor: producto.modoCompraProveedor,
    modoEnvio: producto.modo_envio ?? null,
  };
  return { escala: escalaDeVentaDe(p, esDeposito), p };
}

const COINCIDEN = [
  ["maní comprado por unidad", MANI, 4500],
  ["mortadela 4,5 kg", { ...MANI, factor_pack: null, pesoReferenciaKg: 4.5 }, 10000],
  ["kg por peso", KG_POR_PESO, 3800],
  ["cremoso de peso variable", CREMOSO, 12000],
  ["unidad", UNIDAD, 1000],
  ["pack x6 vendido por unidad", { ...PACK6, modo_envio: "SOLO_UNIDAD" }, 12000],
  ["cajón x8 vendido por unidad", { ...CAJON8, modo_envio: "SOLO_UNIDAD" }, 24000],
];

test("CONFORMIDAD: donde la ficha y la regla coinciden, el mismo valor por unidad física", () => {
  for (const [nombre, producto, costo] of COINCIDEN) {
    for (const esDeposito of [true, false]) {
      const r = costoPorUnidadFisica({ costoBase: costo, producto, esDeposito });
      const { escala, p } = comoLaFicha(producto, costo, esDeposito);
      const donde = `${nombre} en ${esDeposito ? "depósito" : "local"}`;
      assert.equal(escala, ESCALA_DE_LA_UNIDAD[r.unidadFisica], `${donde}: la ficha vende ${escala}`);
      const deLaFicha = valorEnLaEscalaDeVenta({
        escala,
        valor: costo,
        factor: p.factorPack,
        unidad: p.unidadMedida,
        pesoReferenciaKg: p.pesoReferenciaKg,
        redondeo100: false,
      });
      assert.equal(r.costoPorUnidadFisica, deLaFicha, donde);
    }
  }
});

test("CONFORMIDAD: el pack que la ficha vende por bulto vale lo mismo, unidad por unidad", () => {
  // En el depósito un pack sin modo de envío se vende por bulto: la ficha
  // muestra $12.000 y la función $2.000 por unidad física. Son la misma plata.
  const r = deposito(12000, PACK6);
  const { escala } = comoLaFicha(PACK6, 12000, true);
  assert.equal(escala, "por bulto");
  assert.equal(r.costoPorUnidadFisica * 6, 12000);
});

// ── 3. LA DIVERGENCIA CONOCIDA ─────────────────────────────────────────────

test("DIVERGENCIA CONOCIDA: kg + PIEZA + peso + compra por bulto — la ficha dice kilo, la regla dice pieza", () => {
  // La ficha usa `esFiambreFijo`, que exige compra por unidad. Se corrige en su
  // propia tanda; mientras tanto la función sigue la regla de negocio. Si esta
  // afirmación se pone roja, la ficha cambió: revisar que ahora coincidan y
  // pasar el caso a CONFORMIDAD.
  for (const producto of [CHISITO, { ...MANI, modoCompraProveedor: "BULTO" }]) {
    const { escala } = comoLaFicha(producto, 1, true);
    assert.equal(escala, ESCALA_KG, "la ficha lo vende por kilo en el depósito");
    const r = deposito(1000, producto);
    assert.equal(r.unidadFisica, "PIEZA");
    assert.ok(r.anomalias.includes(A.PIEZA_COMPRADA_POR_BULTO));
    assert.ok(r.anomalias.includes(A.PIEZA_NO_RECONOCIDA_POR_ESCRITORES));
  }
});
