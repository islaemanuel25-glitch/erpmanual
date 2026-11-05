// TANDA 15 DE LA REGLA ÚNICA DE UNIDADES: `avisoCambioDeEscala` NO PASA A LA
// PIEZA, Y ESTE CANDADO FIJA LO QUE AVISA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/precios/avisoCambioDeEscalaConLaPieza.test.mjs
//
// ── POR QUÉ NO PASA ────────────────────────────────────────────────────────
//
// Su única cuenta es `precio × factor`, y ese factor no es el del bulto: es la
// proporción entre dos escalas de precio —1/peso al pasar a pieza fija, el peso
// al dejarla, factor nuevo ÷ factor viejo al cambiar el pack—, y puede ser una
// fracción. La pieza no tiene esa operación: sus conversores son de unidad a
// bulto con un factor entero.
//
// ── LA CONTRADICCIÓN QUE QUEDA ─────────────────────────────────────────────
//
// Decide si una ficha "es bulto" por la unidad de medida (pack o cajón), no con
// la lectora. Pasar una ficha "unidad" con factor 12 a "pack" con factor 12 avisa
// multiplicar el precio por 12, y para la pieza las dos fichas son el mismo pack
// de 12. Es la misma diferencia del buscador del POS (tanda 14). Se fija.
//
// La huella es de la grilla corrida antes de la tanda 15
// (`lib/unidades/tanda15Arnes.mjs`): 64 transiciones de escala.

import { test } from "node:test";
import assert from "node:assert/strict";

import { avisos, huella } from "../unidades/tanda15Arnes.mjs";
import { comoViene } from "../unidades/reglaDeUnidades.js";

test("el aviso al cambiar la escala de una ficha es el mismo que antes de la tanda 15 (grilla completa)", () => {
  assert.equal(huella(avisos()), "be5c8c115001d670609215b218a1175616c71515cab8f7a6c122925495a09500");
});

test("los casos de la tanda", () => {
  const a = avisos();
  assert.deepEqual(a["pack12->pack24"].factor, { factor: 2, motivo: "CAMBIA_FACTOR_DE_PACK" });
  assert.equal(a["pack12->pack24"].aviso.ubicaciones[0].precioSugerido, 73800);
  assert.deepEqual(a["kilo->pieza3"].factor, { factor: 1 / 3, motivo: "PASA_A_PIEZA_FIJA" });
  assert.equal(a["kilo->pieza3"].aviso.ubicaciones[0].precioSugerido, 12300, "la Pechuga Sadia: 36.900 ÷ 3");
  assert.equal(a["pieza3->kilo"].aviso.ubicaciones[0].precioSugerido, 110700);
});

test("CONTRADICCIÓN FIJADA COMO ESTÁ: de 'unidad' x12 a 'pack' x12 avisa multiplicar por 12", () => {
  const a = avisos();
  assert.deepEqual(a["unidad12->pack12"].factor, { factor: 12, motivo: "PASA_A_SER_BULTO" });
  assert.equal(comoViene({ unidad_medida: "unidad", factor_pack: 12 }).factor, 12, "para la pieza ya era un pack de 12");
});
