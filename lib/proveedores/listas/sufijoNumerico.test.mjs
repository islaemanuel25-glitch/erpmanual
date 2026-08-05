// Fallback por sufijo numérico.
//
// Es el camino de macheo más peligroso del módulo: cuantos menos dígitos se
// comparan, más productos distintos terminan igual. Lo que lo hace usable no es
// la coincidencia sino los frenos — la prioridad, el corte por ambigüedad y el
// piso de cuatro dígitos— y eso es lo que se prueba acá.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LONGITUDES_SUFIJO,
  MIN_DIGITOS_SUFIJO,
  esCodigoNumerico,
  sufijoNumerico,
  longitudesAplicables,
  tipoSufijo,
  clavesDeCodigo,
} from "@/lib/proveedores/listas/normalizarCodigo";
import {
  TIPO_COINCIDENCIA,
  esCoincidenciaPorSufijo,
  digitosDeSufijo,
  indexarCodigosProveedor,
  macheePorCodigo,
} from "@/lib/proveedores/listas/conciliarLista";

// ── Helpers ─────────────────────────────────────────────────────────────────

const vinculo = (codigoInterno, productoBaseId, activo = true) => ({
  codigoInterno, productoBaseId, activo,
});

const fila = (codigo) => ({ codigoCrudo: String(codigo), codigoNormalizado: String(codigo) });

const machear = (codigos, codigoFila) =>
  macheePorCodigo(indexarCodigosProveedor(codigos), fila(codigoFila));

// ── Piezas puras ────────────────────────────────────────────────────────────

test("la escalera baja de 8 a 4, en ese orden", () => {
  assert.deepEqual(LONGITUDES_SUFIJO, [8, 7, 6, 5, 4]);
  assert.equal(MIN_DIGITOS_SUFIJO, 4);
});

test("esCodigoNumerico distingue numéricos de alfanuméricos", () => {
  assert.equal(esCodigoNumerico("1003312"), true);
  assert.equal(esCodigoNumerico("100-3312"), true); // los separadores no cuentan
  assert.equal(esCodigoNumerico("A3312"), false);
  assert.equal(esCodigoNumerico("3312A"), false);
  assert.equal(esCodigoNumerico(""), false);
  assert.equal(esCodigoNumerico(null), false);
});

test("sufijoNumerico devuelve los últimos n dígitos", () => {
  assert.equal(sufijoNumerico("1003312", 4), "3312");
  assert.equal(sufijoNumerico("1003312", 7), "1003312");
});

test("sufijoNumerico NO rellena con ceros cuando el código es más corto", () => {
  // Rellenar haría que "3312" machee contra cualquier código de 8 dígitos que
  // termine en 3312 aunque el proveedor nunca haya informado esos dígitos.
  assert.equal(sufijoNumerico("3312", 8), "");
  assert.equal(sufijoNumerico("3312", 5), "");
  assert.equal(sufijoNumerico("3312", 4), "3312");
});

test("sufijoNumerico rechaza alfanuméricos y longitudes por debajo del piso", () => {
  assert.equal(sufijoNumerico("A3312", 4), "");
  assert.equal(sufijoNumerico("1003312", 3), "");
  assert.equal(sufijoNumerico("1003312", 0), "");
});

test("longitudesAplicables solo ofrece las que el código puede cubrir", () => {
  assert.deepEqual(longitudesAplicables("12345678901"), [8, 7, 6, 5, 4]);
  assert.deepEqual(longitudesAplicables("123456"), [6, 5, 4]);
  assert.deepEqual(longitudesAplicables("3312"), [4]);
  assert.deepEqual(longitudesAplicables("331"), []);
  assert.deepEqual(longitudesAplicables("A3312"), []);
});

test("el tipo de coincidencia dice cuántos dígitos se usaron", () => {
  assert.equal(tipoSufijo(6), "SUFIJO_6");
  assert.equal(esCoincidenciaPorSufijo("SUFIJO_6"), true);
  assert.equal(esCoincidenciaPorSufijo("CODIGO_INTERNO"), false);
  assert.equal(digitosDeSufijo("SUFIJO_6"), 6);
  assert.equal(digitosDeSufijo("CODIGO_INTERNO"), null);
});

// ── El caso del enunciado ───────────────────────────────────────────────────

test("Excel 3312 contra ERP 1003312 coincide por sufijo de 4", () => {
  const r = machear([vinculo("1003312", 77)], 3312);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_4);
  assert.equal(r.sufijoDigitos, 4);
  assert.equal(r.candidatos.length, 1);
  assert.equal(r.candidatos[0].productoBaseId, 77);
});

test("y también al revés: Excel 1003312 contra ERP 3312", () => {
  const r = machear([vinculo("3312", 77)], 1003312);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_4);
  assert.equal(r.candidatos[0].productoBaseId, 77);
});

// ── Prioridad ───────────────────────────────────────────────────────────────

test("la coincidencia exacta gana sobre cualquier sufijo", () => {
  // El 3312 exacto y el 1003312 por sufijo compiten: gana el exacto y ni
  // siquiera se evalúa el otro.
  const r = machear([vinculo("3312", 10), vinculo("1003312", 20)], 3312);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.CODIGO_INTERNO);
  assert.equal(r.candidatos[0].productoBaseId, 10);
});

test("el fallback sin ceros también gana sobre el sufijo", () => {
  const r = machear([vinculo("0001234", 10), vinculo("99991234", 20)], 1234);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.CODIGO_INTERNO_SIN_CEROS);
  assert.equal(r.candidatos[0].productoBaseId, 10);
});

test("sufijo 8 gana sobre 7, 6, 5 y 4", () => {
  // Cinco productos que comparten terminaciones cada vez más cortas con el
  // código de la lista. Solo uno comparte los 8 últimos dígitos.
  const codigos = [
    vinculo("99912345678", 8), // últimos 8: 12345678
    vinculo("88872345678", 7), // últimos 7:  2345678
    vinculo("77777345678", 6), // últimos 6:   345678
    vinculo("66666645678", 5), // últimos 5:    45678
    vinculo("55555555678", 4), // últimos 4:     5678
  ];
  const r = machear(codigos, "12345678");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_8);
  assert.equal(r.sufijoDigitos, 8);
  assert.equal(r.candidatos[0].productoBaseId, 8);
});

test("sin candidato de 8 se baja a 7, y así sucesivamente", () => {
  const codigos = [vinculo("88872345678", 7), vinculo("55555555678", 4)];
  const r = machear(codigos, "12345678");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_7);
  assert.equal(r.candidatos[0].productoBaseId, 7);
});

test("se baja hasta 4 si es la única longitud con algo", () => {
  const r = machear([vinculo("55555555678", 4)], "12345678");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_4);
});

// ── Ambigüedad: el freno ────────────────────────────────────────────────────

test("dos candidatos con los mismos últimos 4 dan ambiguo", () => {
  const r = machear([vinculo("1003312", 10), vinculo("2003312", 20)], 3312);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.AMBIGUA);
  assert.equal(r.candidatos.length, 2);
  assert.equal(r.sufijoDigitos, 4);
});

test("la ambigüedad CORTA la escalera: no se sigue bajando", () => {
  // Dos comparten los 6 últimos y uno solo comparte los 5. Si la escalera
  // siguiera bajando encontraría un match único de 5 dígitos y lo aplicaría:
  // sería elegir un producto por descarte, que es justo lo que no se hace.
  // Ninguno de los dos comparte los 7 últimos con "12345678" —serían 2345678—
  // pero los dos comparten los 6: 345678.
  const codigos = [
    vinculo("11345678", 61),
    vinculo("99345678", 62),
    vinculo("9999945678", 5),
  ];
  const r = machear(codigos, "12345678");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.AMBIGUA);
  assert.equal(r.sufijoDigitos, 6, "tiene que cortar en 6, no seguir hasta 5");
  assert.deepEqual(r.candidatos.map((c) => c.productoBaseId).sort(), [61, 62]);
});

test("nunca se elige uno cuando hay empate", () => {
  const r = machear([vinculo("1003312", 10), vinculo("2003312", 20), vinculo("3003312", 30)], 3312);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.AMBIGUA);
  assert.equal(r.candidatos.length, 3);
});

// ── Alfanuméricos ───────────────────────────────────────────────────────────

test("un código alfanumérico NO usa el fallback por sufijo", () => {
  const r = machear([vinculo("1003312", 77)], "A3312");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.NINGUNA);
});

test("un vínculo alfanumérico no entra en el índice de sufijos", () => {
  const r = machear([vinculo("ABC3312", 77)], 3312);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.NINGUNA);
});

test("los alfanuméricos siguen macheando exacto", () => {
  const r = machear([vinculo("ABC3312", 77)], "ABC3312");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.CODIGO_INTERNO);
});

// ── Piso de cuatro dígitos ──────────────────────────────────────────────────

test("menos de 4 dígitos no usa fallback", () => {
  assert.equal(machear([vinculo("100312", 77)], 312).tipo, TIPO_COINCIDENCIA.NINGUNA);
  assert.equal(machear([vinculo("10012", 77)], 12).tipo, TIPO_COINCIDENCIA.NINGUNA);
  assert.equal(machear([vinculo("1001", 77)], 1).tipo, TIPO_COINCIDENCIA.NINGUNA);
});

test("exactamente 4 dígitos sí usa fallback", () => {
  assert.equal(machear([vinculo("1003312", 77)], 3312).tipo, TIPO_COINCIDENCIA.SUFIJO_4);
});

// ── Inactivos ───────────────────────────────────────────────────────────────

test("un vínculo inactivo no participa del fallback por sufijo", () => {
  const r = machear([vinculo("1003312", 77, false)], 3312);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.NINGUNA);
});

test("un inactivo no crea ambigüedad falsa contra un activo", () => {
  // Si el inactivo participara, esta fila quedaría ambigua y nadie podría
  // aplicarla — un vínculo dado de baja bloquearía uno vigente.
  const r = machear([vinculo("1003312", 10), vinculo("2003312", 20, false)], 3312);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_4);
  assert.equal(r.candidatos[0].productoBaseId, 10);
});

test("los inactivos tampoco machean exacto", () => {
  const r = machear([vinculo("3312", 77, false)], 3312);
  assert.equal(r.tipo, TIPO_COINCIDENCIA.NINGUNA);
});

// ── El índice ───────────────────────────────────────────────────────────────

test("el índice arma un mapa por cada longitud", () => {
  const idx = indexarCodigosProveedor([vinculo("1003312", 77)]);
  assert.deepEqual([...idx.sufijos.keys()], [8, 7, 6, 5, 4]);
  assert.equal(idx.sufijos.get(7).get("1003312").length, 1);
  assert.equal(idx.sufijos.get(4).get("3312").length, 1);
  // No tiene 8 dígitos: no entra en ese mapa.
  assert.equal(idx.sufijos.get(8).size, 0);
});

test("el índice conserva los separadores normalizados", () => {
  const r = machear([vinculo("100-3312", 77)], "3312");
  assert.equal(r.tipo, TIPO_COINCIDENCIA.SUFIJO_4);
});

test("una fila sin código no machea por sufijo", () => {
  const idx = indexarCodigosProveedor([vinculo("1003312", 77)]);
  assert.equal(macheePorCodigo(idx, { codigoCrudo: "" }).tipo, TIPO_COINCIDENCIA.NINGUNA);
});

test("clavesDeCodigo sigue devolviendo las tres formas de siempre", () => {
  const c = clavesDeCodigo("00-1234");
  assert.equal(c.normalizado, "001234");
  assert.equal(c.sinCeros, "1234");
});
