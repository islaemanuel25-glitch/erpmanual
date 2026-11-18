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

import { esColaEntera, indexarCodigosProveedor, macheePorCodigo, TIPO_COINCIDENCIA } from "./conciliarLista.js";

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
  // El código nuevo de Traviata Crack termina entero en el viejo: sigue.
  assert.equal(machear(ARCOR, "15279").candidatos[0]?.productoBaseId, 1794, "TRAVIATA CRACK PORTEÑITAS x96G");
});

test("Presto 12631 sigue cayendo en Mogul Dientes: su vínculo 2631 SÍ es la cola entera", () => {
  // La regla no lo resuelve y se dice: 1002631 queda afuera, pero el 2631 del
  // mismo producto termina entero en 12631. El renglón guardado se desvinculó
  // a mano (2026-11-18); la próxima lista lo vuelve a proponer.
  const r = machear(ARCOR, "12631");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_4);
  assert.equal(r.candidatos[0].productoBaseId, 217);
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
