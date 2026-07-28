// Tests del ranking de búsqueda compartido (POS + combos).
// Runner: `node --test lib/pos-ventas/rankearProductos.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankearProductos } from "./rankearProductos.js";

const P = (nombre, codigoBarra = "", codigoBarraSecundario = "", codigoBarraPropio = "") => ({ nombre, codigoBarra, codigoBarraSecundario, codigoBarraPropio });

test("código exacto (primario) gana", () => {
  const r = rankearProductos([P("Otro"), P("Coca", "779")], "779");
  assert.equal(r[0].nombre, "Coca");
});

test("código PROPIO exacto también gana (score 0)", () => {
  const r = rankearProductos([P("Otro"), P("Coca", "111", "222", "LOCALX")], "localx");
  assert.equal(r[0].nombre, "Coca");
});

test("código secundario exacto también gana", () => {
  const r = rankearProductos([P("Otro"), P("Coca", "111", "779")], "779");
  assert.equal(r[0].nombre, "Coca");
});

test("nombre exacto > empieza-con > contiene", () => {
  const r = rankearProductos([P("Coca Cola"), P("Coca"), P("Gran Coca Zero")], "coca");
  assert.deepEqual(r.map((x) => x.nombre), ["Coca", "Coca Cola", "Gran Coca Zero"]);
});

test("palabra que empieza-con rankea antes que 'contiene'", () => {
  const r = rankearProductos([P("Supercoca"), P("Agua coca mineral")], "coca");
  // "Agua coca mineral" tiene una palabra que empieza con 'coca' (score 3);
  // "Supercoca" solo contiene (score 4).
  assert.equal(r[0].nombre, "Agua coca mineral");
});

test("sin query devuelve la lista igual", () => {
  const items = [P("B"), P("A")];
  assert.deepEqual(rankearProductos(items, ""), items);
});

test("no muta el array original", () => {
  const items = [P("Z"), P("A", "1")];
  const copia = [...items];
  rankearProductos(items, "1");
  assert.deepEqual(items, copia);
});
