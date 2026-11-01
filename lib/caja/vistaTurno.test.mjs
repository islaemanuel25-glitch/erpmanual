// lib/caja/vistaTurno.test.mjs
//
// El caso de diseño es el turno 175 REAL de Casiano casas (02/08/2026):
// inicial $10.000, efectivo $312.500, digital $150.400, esperado $322.500,
// contado $385.000, sobrante +$62.500, 5 arqueos, 99 ventas, 0 movimientos.
//
// La pista del fondo omitido, el desglose entre arqueos y el resumen de arqueos
// se borraron el 2026-11-01 con la ficha del turno viejo, que era su único
// lector. Queda el resultado del cierre, que lee el resumen de cajas de Azul Chat.
//
//   node --test lib/caja/vistaTurno.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resultadoCierre,
  CAJA_CORRECTA,
  CAJA_SOBRANTE,
  CAJA_FALTANTE,
} from "./vistaTurno.js";

test("turno 175 real: el sobrante se dice en palabras y con una pista, no un veredicto", () => {
  const r = resultadoCierre({ esperado: 322500, contado: 385000 });
  assert.equal(r.estado, CAJA_SOBRANTE);
  assert.equal(r.titulo, "Sobran $62.500,00");
  assert.equal(r.monto, 62500);
  assert.match(r.explicacion, /turnos anteriores|retiros no registrados/);
  // No afirma una causa: enumera posibilidades.
  assert.match(r.explicacion, /puede ser/);
});

test("caja correcta", () => {
  const r = resultadoCierre({ esperado: 67101.7, contado: 67101.7 });
  assert.equal(r.estado, CAJA_CORRECTA);
  assert.equal(r.titulo, "Caja correcta");
  assert.equal(r.monto, 0);
});

test("faltante: el título dice cuánto falta", () => {
  const r = resultadoCierre({ esperado: 19400, contado: 9400 });
  assert.equal(r.estado, CAJA_FALTANTE);
  assert.equal(r.titulo, "Faltan $10.000,00");
  assert.match(r.explicacion, /error de conteo|sin registrarse/);
});

test("turno abierto: no inventa un resultado", () => {
  const r = resultadoCierre({ esperado: 322500, contado: null });
  assert.equal(r.cerrado, false);
  assert.equal(r.estado, null);
  assert.equal(r.titulo, "Turno abierto");
});
