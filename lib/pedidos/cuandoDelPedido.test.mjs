// "hoy 14:05", "ayer 18:30" o "21/10 09:15", con el día de ARGENTINA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/cuandoDelPedido.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { cuandoDelPedido } from "./cuandoDelPedido.js";

// Las 10:00 del 22/10 en Argentina son las 13:00 UTC.
const AHORA = new Date("2026-10-22T13:00:00Z");

test("hoy, ayer y otro día", () => {
  assert.equal(cuandoDelPedido("2026-10-22T12:05:00Z", AHORA), "hoy 09:05");
  assert.equal(cuandoDelPedido("2026-10-21T21:30:00Z", AHORA), "ayer 18:30");
  assert.equal(cuandoDelPedido("2026-10-20T12:15:00Z", AHORA), "20/10 09:15");
  assert.equal(cuandoDelPedido(null, AHORA), null);
});

test("el día es el de Argentina, no el de UTC", () => {
  // 01:30 UTC del 22 son las 22:30 del 21 en Argentina: ayer, no hoy.
  assert.equal(cuandoDelPedido("2026-10-22T01:30:00Z", AHORA), "ayer 22:30");
  // 02:59 UTC del 22 son las 23:59 del 21; 03:00 UTC ya es el 22.
  assert.equal(cuandoDelPedido("2026-10-22T03:00:00Z", AHORA), "hoy 00:00");
});
