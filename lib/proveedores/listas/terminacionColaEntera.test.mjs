// LA TERMINACIÓN EXIGE EL CÓDIGO CORTO ENTERO AL FINAL DEL LARGO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/terminacionColaEntera.test.mjs
//
// Emanuel, 2026-11-18: "14266 coincide con 1014266, no con 1004266". Antes la
// escalera recortaba los dos códigos a los mismos últimos dígitos, y HEL.
// PALITO MOGUL (14266) caía en el Rocklets mini (1004266) por compartir
// "4266". Sigue acotada al mismo proveedor, a códigos internos y a una
// coincidencia única.
//
// Todos los casos son de producción, leídos el 2026-11-18 de las listas
// guardadas de Arcor (importación 6) y Dyssa (28) y de sus vínculos de código.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esColaEntera,
  esTerminacionConPrefijo,
  indexarCodigosProveedor,
  macheePorCodigo,
  TIPO_COINCIDENCIA,
} from "./conciliarLista.js";

const v = (codigoInterno, productoBaseId) => ({ codigoInterno, productoBaseId, activo: true });
const machear = (vinculos, codigo) =>
  macheePorCodigo(indexarCodigosProveedor(vinculos), { codigoCrudo: codigo, codigoNormalizado: codigo });

// Los vínculos reales de los productos en juego.
const ARCOR = [
  v("1004266", 515), // Rocklets mini 10g
  v("1004013", 709), // Turrón Arcor
  v("1002631", 217), // MOGUL DIENTES 500G
  v("2631", 217),
  v("1015404", 618), // TOPLINE7 BUBBLE FUN ROSA 14G
  v("5279", 1794), // TRAVIATA CRACK PORTEÑITA 96g
];
const DYSSA = [
  v("1000010071", 903), // GELATINA EXQUISITA FRUTILLA X15
  v("5000014674", 602), // TRES TORRES BLANCO 1.5L
  v("3110000911", 1105), // SUEROX ARANDANO-POMELO
  v("3110001028", 1490), // DURACELL PILAS AA x12
  v("3110001030", 1347), // PILAS DURACELL AAA X12
];

test("las cinco que compartían solo la cola dejan de vincular", () => {
  for (const [vinculos, codigo, texto] of [
    [ARCOR, "14266", "HEL. PALITO MOGUL 18u X51g → Rocklets mini"],
    [ARCOR, "14013", "HVO BLOCK MIMI-MITI x 170g → Turrón"],
    [DYSSA, "6008460071", "BIC ENCENDEDOR J5 MINI → Gelatina"],
    [DYSSA, "1200074674", "GAONA SINFONIA GALLETA → Tres Torres"],
    [DYSSA, "1000050911", "NOBLEZA GAUCHA SUAVE → Suerox"],
  ]) {
    const r = machear(vinculos, codigo);
    assert.equal(r.tipo, TIPO_COINCIDENCIA.NINGUNA, texto);
    assert.equal(r.candidatos.length, 0, texto);
  }
});

test("las colas enteras de Arcor siguen vinculando: 4266 con 1004266, 15404 con 1015404", () => {
  assert.equal(machear(ARCOR, "4266").candidatos[0]?.productoBaseId, 515, "ROCKLETS MINI 44X10G");
  assert.equal(machear(ARCOR, "15404").candidatos[0]?.productoBaseId, 618, "TABL. TOP LINE 7 BUBLE FUN");
});

// ── Y DELANTE, SOLO "10" O "100" (Emanuel, 2026-11-18, segunda decisión) ──
//
// La cola entera sola dejaba pasar siete con apenas un "1" delante. Los
// vínculos reales de esos casos:
const ARCOR_PREFIJO = [
  ...ARCOR,
  v("14230", 826), // TOPLINE MENTA VERDE 6.7gr
  v("3113", 199), // MOGUL CONITOS
  v("13313", 1914), // ARCOR SALSA LISTA 340G POMAROLA
];
const DAB = [v("0044", 2122)]; // Salchicha Super Pancho Paladini

test("con solo un 1 delante no coincide: caen las siete que se midieron", () => {
  for (const [vinculos, codigo, texto] of [
    [ARCOR_PREFIJO, "12631", "PRESTO. ESPINA/CREMA → Mogul Dientes (2631)"],
    [ARCOR_PREFIJO, "4230", "NV MANI ROCKLETS NAVIDAD → Top Line Menta (14230)"],
    [ARCOR_PREFIJO, "13113", "NV AGUILA TENTA. MOUSSE → Mogul Conitos (3113)"],
    [ARCOR_PREFIJO, "3313", "NUEVO TATIN / ALFAJOR BYN → Pomarola (13313)"],
    [ARCOR_PREFIJO, "15279", "TRAVIATA CRACK PORTEÑITAS → el 5279 de su mismo producto"],
    [DAB, "10044", "COMBO LIPO → salchicha (0044)"],
  ]) {
    const r = machear(vinculos, codigo);
    assert.equal(r.tipo, TIPO_COINCIDENCIA.NINGUNA, texto);
  }
});

test("con 10 o 100 delante sigue coincidiendo, y Traviata Crack vuelve por su código nuevo, a mano", () => {
  assert.equal(machear(ARCOR_PREFIJO, "4266").candidatos[0]?.productoBaseId, 515, "100 delante: 1004266");
  assert.equal(machear(ARCOR_PREFIJO, "15404").candidatos[0]?.productoBaseId, 618, "10 delante: 1015404");
  const conElNuevo = [...ARCOR_PREFIJO, v("15279", 1794)];
  assert.equal(machear(conElNuevo, "15279").tipo, TIPO_COINCIDENCIA.CODIGO_INTERNO);
  assert.equal(machear(conElNuevo, "15279").candidatos[0].productoBaseId, 1794);
});

test("esTerminacionConPrefijo: cola entera y delante 10 o 100", () => {
  assert.equal(esTerminacionConPrefijo("4266", "1004266"), true);
  assert.equal(esTerminacionConPrefijo("15404", "1015404"), true);
  assert.equal(esTerminacionConPrefijo("12631", "2631"), false, "delante solo hay un 1");
  assert.equal(esTerminacionConPrefijo("14266", "1004266"), false, "no es cola entera");
  assert.equal(esTerminacionConPrefijo("4266", "1104266"), false, "delante 110");
  assert.equal(esTerminacionConPrefijo("4266", "10004266"), false, "delante 1000");
});

test("las pilas Duracell con código nuevo dejan de vincular por la cola, y vinculan por su código exacto", () => {
  assert.equal(machear(DYSSA, "31100001028").tipo, TIPO_COINCIDENCIA.NINGUNA);
  assert.equal(machear(DYSSA, "31100001030").tipo, TIPO_COINCIDENCIA.NINGUNA);
  // El vínculo a mano del 2026-11-18, por su código de hoy.
  const conLosNuevos = [...DYSSA, v("31100001028", 1490), v("31100001030", 1347)];
  assert.equal(machear(conLosNuevos, "31100001028").tipo, TIPO_COINCIDENCIA.CODIGO_INTERNO);
  assert.equal(machear(conLosNuevos, "31100001028").candidatos[0].productoBaseId, 1490);
  assert.equal(machear(conLosNuevos, "31100001030").candidatos[0].productoBaseId, 1347);
});

test("esColaEntera: el corto entero al final del largo, en cualquier orden", () => {
  assert.equal(esColaEntera("4266", "1004266"), true);
  assert.equal(esColaEntera("1004266", "4266"), true);
  assert.equal(esColaEntera("14266", "1014266"), true);
  assert.equal(esColaEntera("14266", "1004266"), false);
  assert.equal(esColaEntera("", "1004266"), false);
});
