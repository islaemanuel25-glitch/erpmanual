// Normalización y coincidencia de códigos de proveedor.
//
// El riesgo que persiguen estas pruebas no es el no-match: es el MATCH
// EQUIVOCADO. Un código que no machea se ve en la pantalla y se arregla a mano;
// un código que machea contra el producto que no era le cambia el costo a un
// producto sano y nadie se entera hasta que sale mal un precio.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  codigoCrudo,
  normalizarCodigo,
  codigoSinCerosIniciales,
  clavesDeCodigo,
  codigoUtilizable,
  indexarCodigos,
  buscarPorCodigo,
  MATCH,
} from "./normalizarCodigo.js";

// ── Normalización ───────────────────────────────────────────────────────────

test('1. "001234" conserva sus ceros', () => {
  assert.equal(normalizarCodigo("001234"), "001234");
});

test("2. el número 1234 de Excel se vuelve string sin decimales fantasma", () => {
  assert.equal(codigoCrudo(1234), "1234");
  assert.equal(normalizarCodigo(1234), "1234");
});

test('3. " 001-234 " se limpia a "001234"', () => {
  assert.equal(normalizarCodigo(" 001-234 "), "001234");
});

test("4. las tres formas del mismo código coinciden entre sí", () => {
  assert.equal(normalizarCodigo(" 001-234 "), normalizarCodigo("001234"));
  assert.equal(normalizarCodigo("001.234"), "001234");
  assert.equal(normalizarCodigo("001 234"), "001234");
  assert.equal(normalizarCodigo("001_234"), "001234");
  assert.equal(normalizarCodigo("001/234"), "001234");
});

test("5. alfanumérico: las letras se conservan y se normaliza a mayúsculas", () => {
  assert.equal(normalizarCodigo("ab-12c"), "AB12C");
  assert.equal(normalizarCodigo("AB12C"), "AB12C");
  assert.equal(normalizarCodigo("ab 12 c"), "AB12C");
});

test("6. vacío y solo espacios dan cadena vacía", () => {
  assert.equal(normalizarCodigo(""), "");
  assert.equal(normalizarCodigo("   "), "");
  assert.equal(codigoUtilizable(""), false);
  assert.equal(codigoUtilizable("   "), false);
});

test("7. null y undefined no rompen: dan cadena vacía", () => {
  assert.equal(normalizarCodigo(null), "");
  assert.equal(normalizarCodigo(undefined), "");
  assert.equal(codigoCrudo(null), "");
  assert.equal(codigoUtilizable(null), false);
});

test("8. el punto es separador, no parte del código", () => {
  assert.equal(normalizarCodigo("1.234"), "1234");
  assert.equal(normalizarCodigo("12.34.56"), "123456");
  // Una celda que solo tenía separadores no es un código.
  assert.equal(normalizarCodigo("---"), "");
  assert.equal(normalizarCodigo("..."), "");
});

test("9. un decimal real de Excel conserva sus dígitos", () => {
  // 1234.5 llega como número; perder el ",5" cambiaría el código.
  assert.equal(codigoCrudo(1234.5), "1234.5");
  // Ya normalizado el punto se va, pero los dígitos quedan: 12345 ≠ 1234.
  assert.equal(normalizarCodigo(1234.5), "12345");
});

test("10. valores que no son código: booleanos y no finitos", () => {
  assert.equal(codigoCrudo(true), "");
  assert.equal(codigoCrudo(NaN), "");
  assert.equal(codigoCrudo(Infinity), "");
});

test("11. el crudo se conserva SIEMPRE, junto al normalizado", () => {
  const c = clavesDeCodigo(" 001-234 ");
  assert.equal(c.crudo, " 001-234 ");
  assert.equal(c.normalizado, "001234");
  assert.equal(c.sinCeros, "1234");
});

// ── Fallback sin ceros ──────────────────────────────────────────────────────

test("12. la variante sin ceros existe para los códigos numéricos", () => {
  assert.equal(codigoSinCerosIniciales("001234"), "1234");
  assert.equal(codigoSinCerosIniciales(" 001-234 "), "1234");
});

test("13. sin ceros a la izquierda no hay variante: sería la misma", () => {
  assert.equal(codigoSinCerosIniciales("1234"), "");
});

test('14. "000" no habilita ningún fallback', () => {
  assert.equal(codigoSinCerosIniciales("000"), "");
});

test("15. un alfanumérico NO pierde su cero inicial", () => {
  // Sacárselo lo convertiría en "A1" y podría chocar contra otro producto.
  assert.equal(codigoSinCerosIniciales("0A1"), "");
  assert.equal(codigoSinCerosIniciales("00AB12"), "");
  assert.equal(normalizarCodigo("0A1"), "0A1");
});

// ── Coincidencia exacta ─────────────────────────────────────────────────────

const ERP = [
  { id: 1, codigo: "001234", nombre: "Galletitas" },
  { id: 2, codigo: "5678", nombre: "Alfajor" },
  { id: 3, codigo: "AB-12C", nombre: "Turrón" },
  { id: 4, codigo: "0A1", nombre: "Caramelo" },
  { id: 5, codigo: "A1", nombre: "Chupetín" },
];
const indice = indexarCodigos(ERP, (x) => x.codigo);

test("16. coincidencia exacta normalizada: el criterio principal", () => {
  const r = buscarPorCodigo(indice, "001234");
  assert.equal(r.tipo, MATCH.EXACTO);
  assert.equal(r.item.id, 1);
});

test("17. coincidencia exacta con el código escrito distinto", () => {
  const r = buscarPorCodigo(indice, " 001-234 ");
  assert.equal(r.tipo, MATCH.EXACTO);
  assert.equal(r.item.id, 1);
});

test("18. coincidencia exacta de un alfanumérico", () => {
  const r = buscarPorCodigo(indice, "ab 12 c");
  assert.equal(r.tipo, MATCH.EXACTO);
  assert.equal(r.item.id, 3);
});

test("19. el fallback sin ceros: la lista trae 1234 y el ERP tiene 001234", () => {
  const r = buscarPorCodigo(indice, 1234);
  assert.equal(r.tipo, MATCH.SIN_CEROS);
  assert.equal(r.item.id, 1);
  // El crudo se conserva para poder mostrar qué decía la celda.
  assert.equal(r.claves.crudo, "1234");
});

test("20. el fallback no pisa a la coincidencia exacta", () => {
  // 5678 machea exacto; nunca tendría que resolverse por el camino del fallback.
  const r = buscarPorCodigo(indice, "5678");
  assert.equal(r.tipo, MATCH.EXACTO);
  assert.equal(r.item.id, 2);
});

test("21. código que no está: NINGUNO, sin adivinar", () => {
  const r = buscarPorCodigo(indice, "999999");
  assert.equal(r.tipo, MATCH.NINGUNO);
  assert.equal(r.item, null);
  assert.equal(r.candidatos.length, 0);
});

test("22. código vacío o nulo no busca nada", () => {
  for (const v of ["", "   ", null, undefined, "---"]) {
    const r = buscarPorCodigo(indice, v);
    assert.equal(r.tipo, MATCH.NINGUNO, `valor ${JSON.stringify(v)}`);
    assert.equal(r.item, null);
  }
});

// ── Duplicados ──────────────────────────────────────────────────────────────

test("23. dos productos con el mismo código normalizado: DUPLICADO, no se elige", () => {
  const conDup = indexarCodigos(
    [
      { id: 10, codigo: "77-88" },
      { id: 11, codigo: "7788" },
    ],
    (x) => x.codigo
  );
  const r = buscarPorCodigo(conDup, "7788");
  assert.equal(r.tipo, MATCH.DUPLICADO);
  assert.equal(r.item, null);
  assert.deepEqual(r.candidatos.map((x) => x.id).sort(), [10, 11]);
});

test("24. el fallback ambiguo también es DUPLICADO", () => {
  const conDup = indexarCodigos(
    [
      { id: 20, codigo: "0055" },
      { id: 21, codigo: "00055" },
    ],
    (x) => x.codigo
  );
  const r = buscarPorCodigo(conDup, 55);
  assert.equal(r.tipo, MATCH.DUPLICADO);
  assert.equal(r.candidatos.length, 2);
});

// ── Sin colisiones accidentales ─────────────────────────────────────────────

test("25. dos alfanuméricos distintos no colisionan", () => {
  // Reducir a dígitos habría dejado los dos en "01".
  const a = buscarPorCodigo(indice, "A01");
  assert.equal(a.tipo, MATCH.NINGUNO);
  const b = buscarPorCodigo(indice, "01A");
  assert.equal(b.tipo, MATCH.NINGUNO);
  assert.notEqual(normalizarCodigo("A01"), normalizarCodigo("01A"));
});

test('26. "0A1" y "A1" siguen siendo dos productos distintos', () => {
  const r0 = buscarPorCodigo(indice, "0A1");
  const r1 = buscarPorCodigo(indice, "A1");
  assert.equal(r0.tipo, MATCH.EXACTO);
  assert.equal(r1.tipo, MATCH.EXACTO);
  assert.equal(r0.item.id, 4);
  assert.equal(r1.item.id, 5);
  assert.notEqual(r0.item.id, r1.item.id);
});

test("27. un alfanumérico no machea contra el numérico que comparte dígitos", () => {
  const idx = indexarCodigos([{ id: 30, codigo: "1234" }], (x) => x.codigo);
  assert.equal(buscarPorCodigo(idx, "AB1234").tipo, MATCH.NINGUNO);
  assert.equal(buscarPorCodigo(idx, "1234AB").tipo, MATCH.NINGUNO);
});

test("28. no hay coincidencia por sufijo", () => {
  const idx = indexarCodigos([{ id: 40, codigo: "9001234" }], (x) => x.codigo);
  // "1234" es sufijo de "9001234" y NO tiene que machear.
  assert.equal(buscarPorCodigo(idx, "1234").tipo, MATCH.NINGUNO);
});

test("29. no hay coincidencia por nombre", () => {
  const idx = indexarCodigos([{ id: 50, codigo: "111", nombre: "Galletitas" }], (x) => x.codigo);
  assert.equal(buscarPorCodigo(idx, "Galletitas").tipo, MATCH.NINGUNO);
});

// ── Índice ──────────────────────────────────────────────────────────────────

test("30. las filas sin código se ignoran al indexar, sin romper", () => {
  const idx = indexarCodigos(
    [{ id: 60, codigo: null }, { id: 61, codigo: "" }, { id: 62, codigo: "abc" }],
    (x) => x.codigo
  );
  assert.equal(idx.exacto.size, 1);
  assert.equal(buscarPorCodigo(idx, "ABC").item.id, 62);
});

test("31. indexar una lista vacía no rompe", () => {
  const idx = indexarCodigos([], (x) => x.codigo);
  assert.equal(idx.exacto.size, 0);
  assert.equal(buscarPorCodigo(idx, "1").tipo, MATCH.NINGUNO);
});
