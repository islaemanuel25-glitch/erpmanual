// CANDADO: LA MEDIANOCHE ES "00", NUNCA "24".
//
//   node --import ./scripts/alias-loader.mjs --test lib/fechas/medianoche.test.mjs
//
// Con `hour12: false` el ICU de Node 20 —el de producción y el del CI— elige el
// ciclo h24 y escribe 00:06 como "24:06". En Node 22 no pasa, así que en la
// máquina de desarrollo nunca se vio. Lo encontró el CI con la tarjeta del turno
// Noche de "Turnos y cierres" (2026-10-12). Este candado solo afirma algo cuando
// corre en un Node que tiene el defecto: por eso el CI lo corre en Node 20.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fechaHoraAR, horaAR } from "./formatearFechaHora.js";

// 00:06 en Argentina.
const MEDIANOCHE = new Date("2026-10-12T03:06:40.000Z");

test("la hora de la medianoche se escribe 00, no 24", () => {
  assert.equal(horaAR(MEDIANOCHE), "00:06");
  assert.equal(horaAR(MEDIANOCHE, { segundos: true }), "00:06:40");
  assert.equal(fechaHoraAR(MEDIANOCHE), "12/10/2026 00:06");
});

test("y el mediodía sigue en 24 horas, sin a. m. ni p. m.", () => {
  assert.equal(horaAR(new Date("2026-10-12T17:16:00.000Z")), "14:16");
});
