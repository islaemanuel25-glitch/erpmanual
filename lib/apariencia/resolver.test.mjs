import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverTemaEfectivo, temaDesdeApariencia } from "./resolver.js";

const VALIDOS = new Set(["temaA", "temaB", "inst", "def"]);
const opts = { esValido: (k) => VALIDOS.has(k), porDefecto: "def" };
const esValido = (k) => VALIDOS.has(k);

test("A) preferencia personal PREVALECE sobre la institucional", () => {
  const r = resolverTemaEfectivo("temaA", "inst", opts);
  assert.equal(r.key, "temaA");
  assert.equal(r.fuente, "personal");
});

test("B) sin personal → usa la institucional del local", () => {
  const r = resolverTemaEfectivo(null, "inst", opts);
  assert.equal(r.key, "inst");
  assert.equal(r.fuente, "institucional");
});

test("C) al BORRAR la preferencia personal vuelve a la institucional", () => {
  const conPersonal = resolverTemaEfectivo("temaB", "inst", opts);
  assert.equal(conPersonal.key, "temaB");
  const trasBorrar = resolverTemaEfectivo(null, "inst", opts);
  assert.equal(trasBorrar.key, "inst");
  assert.equal(trasBorrar.fuente, "institucional");
});

test("D) sin personal ni institucional → tema por defecto", () => {
  const r = resolverTemaEfectivo(null, null, opts);
  assert.equal(r.key, "def");
  assert.equal(r.fuente, "default");
});

test("E) personal inválido se ignora → cae a institucional", () => {
  const r = resolverTemaEfectivo("noExiste", "inst", opts);
  assert.equal(r.key, "inst");
  assert.equal(r.fuente, "institucional");
});

test("F) institucional inválida se ignora → cae a default", () => {
  const r = resolverTemaEfectivo(null, "noExiste", opts);
  assert.equal(r.key, "def");
  assert.equal(r.fuente, "default");
});

test("G) dos dispositivos SIN preferencia personal comparten la institucional", () => {
  const disp1 = resolverTemaEfectivo(null, "inst", opts);
  const disp2 = resolverTemaEfectivo(null, "inst", opts);
  assert.equal(disp1.key, disp2.key);
  assert.equal(disp1.key, "inst");
});

// ---------------------------------------------------------------------------
// temaDesdeApariencia(aparienciaJson, esValido) — extrae el tema institucional
// del ConfiguracionLocal.aparienciaJson para el SSR.
// ---------------------------------------------------------------------------

test("H) aparienciaJson {tema} válido → devuelve el tema", () => {
  assert.equal(temaDesdeApariencia({ tema: "inst" }, esValido), "inst");
  assert.equal(temaDesdeApariencia({ tema: "temaA", otro: 1 }, esValido), "temaA");
});

test("I) tema inválido o ausente → null", () => {
  assert.equal(temaDesdeApariencia({ tema: "noExiste" }, esValido), null);
  assert.equal(temaDesdeApariencia({ otro: "x" }, esValido), null);
  assert.equal(temaDesdeApariencia({}, esValido), null);
});

test("J) json null / no-objeto / array → null (fail-safe)", () => {
  assert.equal(temaDesdeApariencia(null, esValido), null);
  assert.equal(temaDesdeApariencia(undefined, esValido), null);
  assert.equal(temaDesdeApariencia("inst", esValido), null);
  assert.equal(temaDesdeApariencia(["inst"], esValido), null);
  assert.equal(temaDesdeApariencia({ tema: 123 }, esValido), null);
});
