// EL PAPEL QUE NO TRAE TOTAL NO ES UN PAPEL MAL LEÍDO.
//
// Los datos NO son inventados: son las 21 líneas con cantidad de la planilla de
// Mauro, el único comprobante real que hay en producción, tal como quedaron
// leídas. Ese papel no tiene total, ni neto, ni IVA: es una planilla de pedido.
//
// Lo que estos candados fijan es la distinción que separa tres cosas que antes
// se decían con la misma palabra: la LECTURA falló (MAL_LEIDO), el PAPEL no
// cierra (DIFIERE), y el papel NO TRAE con qué verificar (SIN_TOTAL).

import test from "node:test";
import assert from "node:assert/strict";

import { pasarPorLaPuerta, ESTADO, traeTotal } from "./puerta.js";
import { normalizarLectura } from "./contrato.js";

// La receta de Mauro: el precio ya es el final, sin IVA que agregarle.
const RECETA_MAURO = {
  ivaPorLinea: false,
  alicuotaIvaPct: 0,
  tieneImpuestoInterno: false,
  ivaIncluyeInternoEnLaBase: false,
  percepciones: [],
  percepcionesEnCosto: true,
  facturaPor: "UNIDAD",
};

// Las 21 líneas CON CANTIDAD del papel real. Las otras 10 filas de la planilla
// están sin cantidad e importe cero, y no son mercadería de este comprobante.
const LINEAS_MAURO = [
  [40, 3360, 134400, "PHILIPS MORRIS 10"],
  [130, 2250, 292500, "PHILIPS SELECT RED KS"],
  [60, 5250, 315000, "PHILIPS MORRIS 20 KS"],
  [20, 5650, 113000, "PHILIPS MORRIS 20 CONV"],
  [20, 5650, 113000, "PHILIPS MORRIS 20 BOX"],
  [50, 3010, 150500, "CHESTERFIELD 10"],
  [30, 3010, 90300, "CHESTERFIELD 10 CONV"],
  [100, 4650, 465000, "CHESTERFIELD 20 KS"],
  [10, 4650, 46500, "CHESTERFIELD 20 CONV KS"],
  [20, 5050, 101000, "CHESTERFIELD 20 CONV BOX"],
  [20, 3700, 74000, "MARLBORO 10"],
  [10, 3700, 37000, "MARLBORO 10 FUSION UVA"],
  [20, 5800, 116000, "MARLBORO 20 KS"],
  [20, 6200, 124000, "MARLBORO 20 BOX"],
  [10, 6200, 62000, "MARLBORO 20 XL FUSION UVA"],
  [60, 4050, 243000, "M.CRAFTED 20 BOX CONV"],
  [20, 4050, 81000, "M.CRAFTED 20 BOX RED"],
  [10, 4050, 40500, "M.CRAFTED 20 BOX CORAL"],
  [20, 4050, 81000, "M.CRAFTED 20 BOX UVA"],
  [200, 3650, 730000, "M.CRAFTED 20 KS RED"],
  [100, 3650, 365000, "M.CRAFTED 20 CONV KS"],
].map(([cantidad, netoUnitario, subtotalImpreso, descripcion]) => ({
  cantidad, netoUnitario, subtotalImpreso, descripcion,
}));

const lecturaDeMauro = ({ pie, lineasEnElPapel = 21 } = {}) =>
  normalizarLectura({
    // Una planilla no tiene identidad fiscal: ni tipo, ni punto de venta, ni número.
    identidad: {},
    lineas: LINEAS_MAURO,
    pie,
    lineasEnElPapel,
    consumo: { tokensEntrada: 1500, tokensSalida: 400, costoMicroUsd: 0 },
    modelo: "gemini-3.6-flash",
  });

// ── EL PREDICADO ───────────────────────────────────────────────────────────

test("un total en cero cuenta como ausente, que es lo que devuelve el modelo", () => {
  // El esquema de salida EXIGE `total`, así que un modelo que no encuentra
  // ninguno igual pone algo, y pone 0. Medido con este papel.
  assert.equal(traeTotal({ total: 0 }), false);
  assert.equal(traeTotal({ total: null }), false);
  assert.equal(traeTotal({}), false);
  assert.equal(traeTotal(null), false);
  assert.equal(traeTotal({ total: 3774700 }), true);
});

// ── LA DISTINCIÓN, QUE ES TODO EL PUNTO ────────────────────────────────────

test("la planilla real queda en SIN_TOTAL, no en MAL_LEIDO", () => {
  const r = pasarPorLaPuerta({
    lectura: lecturaDeMauro({ pie: { neto: 0, total: 0 } }),
    receta: RECETA_MAURO,
    recetaVersion: 1,
  });
  assert.equal(r.estado, ESTADO.SIN_TOTAL);
  assert.notEqual(r.estado, ESTADO.MAL_LEIDO, "la lectura fue perfecta: decir que falló es falso");
  assert.equal(r.sinTotal, true);
});

test("sin total NO se propone ningún costo, igual que si no cerrara", () => {
  const r = pasarPorLaPuerta({
    lectura: lecturaDeMauro({ pie: { neto: 0, total: 0 } }),
    receta: RECETA_MAURO,
    recetaVersion: 1,
  });
  assert.equal(r.proponeCostos, false);
  assert.equal(r.cierra, false);
});

test("la diferencia va NULA y no en cero: un cero se leería como que cierra", () => {
  const r = pasarPorLaPuerta({
    lectura: lecturaDeMauro({ pie: { neto: 0, total: 0 } }),
    receta: RECETA_MAURO,
    recetaVersion: 1,
  });
  assert.equal(r.diferenciaCentavos, null);
});

test("el texto dice las tres cosas, y no acusa al lector", () => {
  const r = pasarPorLaPuerta({
    lectura: lecturaDeMauro({ pie: { neto: 0, total: 0 } }),
    receta: RECETA_MAURO,
    recetaVersion: 1,
  });
  assert.match(r.porque, /no trae total/i, "qué pasó");
  assert.match(r.porque, /no se puede verificar|no hay contra qué comparar/i, "por qué");
  assert.match(r.porque, /no se propone ningún costo/i, "y qué NO va a pasar");
  // No puede decir que se leyó mal: es justo lo que este estado vino a sacar.
  assert.doesNotMatch(r.porque, /mal leíd|se leyó mal|dígito mal leído/i);
  // Pero deja abierta la otra posibilidad, porque desde los números no se
  // distingue "el papel no lo trae" de "el modelo no lo encontró".
  assert.match(r.porque, /volvé a leerlo/i);
});

test("con total, el mismo papel vuelve al camino de siempre", () => {
  // La suma de las 21 líneas es 3.774.700. Con ese total al pie, cierra.
  const r = pasarPorLaPuerta({
    lectura: lecturaDeMauro({ pie: { neto: 3774700, total: 3774700 } }),
    receta: RECETA_MAURO,
    recetaVersion: 1,
  });
  assert.equal(r.estado, ESTADO.CARGADO, r.porque ?? "");
  assert.equal(r.cierra, true);
  assert.equal(r.proponeCostos, true);
});

test("sin total pero con una línea incoherente, se dice ADEMÁS que hay un dígito mal", () => {
  // Lo único verificable sin pie es cantidad × unitario = subtotal, y se informa.
  const lineas = LINEAS_MAURO.map((l, i) => (i === 0 ? { ...l, netoUnitario: 9999 } : l));
  const r = pasarPorLaPuerta({
    lectura: normalizarLectura({
      identidad: {}, lineas, pie: { neto: 0, total: 0 }, lineasEnElPapel: 21,
      consumo: { tokensEntrada: 1, tokensSalida: 1, costoMicroUsd: 0 }, modelo: "x",
    }),
    receta: RECETA_MAURO,
    recetaVersion: 1,
  });
  assert.equal(r.estado, ESTADO.SIN_TOTAL, "sigue siendo un papel sin total");
  assert.match(r.porque, /no trae total/i);
  assert.match(r.porque, /dígito mal leído/i, "y encima esto, que sí es del lector");
});

// ── EL CONTEO DE RENGLONES, CON EL CRITERIO CORREGIDO ──────────────────────

test("21 con cantidad contra 21 transcriptas: NINGÚN aviso", () => {
  // Es el caso real. Antes el lector contaba las 31 filas de la grilla y avisaba
  // en rojo que faltaban 10, sobre una transcripción completa.
  const r = pasarPorLaPuerta({
    lectura: lecturaDeMauro({ pie: { neto: 0, total: 0 }, lineasEnElPapel: 21 }),
    receta: RECETA_MAURO,
    recetaVersion: 1,
  });
  assert.equal(r.faltanLineas, null, "no falta ninguno");
  assert.equal(r.avisoLineas, null, "y por lo tanto no hay nada que avisar");
});

test("el aviso sigue saliendo cuando de verdad falta un renglón con cantidad", () => {
  // El control no se aflojó: si el lector ve 22 con cantidad y transcribió 21,
  // avisa. Es para lo que existe.
  const r = pasarPorLaPuerta({
    lectura: lecturaDeMauro({ pie: { neto: 0, total: 0 }, lineasEnElPapel: 22 }),
    receta: RECETA_MAURO,
    recetaVersion: 1,
  });
  assert.deepEqual(r.faltanLineas, { declaradas: 22, transcriptas: 21, faltan: 1 });
  assert.match(r.avisoLineas, /falta 1/);
});
