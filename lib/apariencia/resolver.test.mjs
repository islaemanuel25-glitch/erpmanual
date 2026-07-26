import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverTemaEfectivo } from "./resolver.js";

const VALIDOS = new Set(["temaA", "temaB", "inst", "def"]);
const opts = { esValido: (k) => VALIDOS.has(k), porDefecto: "def" };

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
