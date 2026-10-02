// LA COLA OFFLINE SE SINCRONIZA CONTRA LA CAJA DONDE SE COBRÓ.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/replayOffline.test.mjs
//
// El servidor es la última defensa —voucher de A, solo caja de A; sin voucher,
// el PIN activo— y eso lo ejerce scripts/pruebas-db/cajaPorOperador.mjs. Acá se
// afirma la otra mitad: que la pantalla manda la venta a SU turno y no al de
// quien sincroniza, que guarda ese turno al encolar, y que lo que no se puede
// atribuir se frena sin mandarse ni borrarse.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { turnoDeReplay, MOTIVO_SIN_CAJA_DEMOSTRABLE } from "@/lib/pos-ventas/replayOffline";

const CAJA_DE_A = { id: 10, operadorId: 1 };
const CAJA_DE_B = { id: 20, operadorId: 2 };
const CAJA_DE_CUENTA = { id: 30, operadorId: null };

test("la venta va al turno donde se cobró, no al de quien sincroniza", () => {
  // A la cobró en su turno 10; sincroniza B, que está en su turno 20.
  assert.deepEqual(turnoDeReplay({ turnoId: 10, operadorVoucher: "v" }, CAJA_DE_B), { turnoId: 10 });
  assert.deepEqual(turnoDeReplay({ turnoId: 10, operadorVoucher: null }, CAJA_DE_B), { turnoId: 10 });
  // Aunque no haya turno abierto en esta pantalla: la venta ya sabe su caja.
  assert.deepEqual(turnoDeReplay({ turnoId: 10 }, null), { turnoId: 10 });
});

test("venta anterior sin turno, con voucher: el turno actual, y decide el servidor", () => {
  // El servidor solo la acepta si el turno es del operador del voucher.
  assert.deepEqual(turnoDeReplay({ operadorVoucher: "v" }, CAJA_DE_A), { turnoId: 10 });
});

test("venta anterior sin turno ni voucher: solo en una caja de cuenta, como siempre", () => {
  assert.deepEqual(turnoDeReplay({}, CAJA_DE_CUENTA), { turnoId: 30 });
});

test("venta anterior sin turno ni voucher, con la caja de un operador: se FRENA", () => {
  const r = turnoDeReplay({}, CAJA_DE_B);
  assert.equal(r.frenada, true, "no se le inventa una caja");
  assert.equal(r.motivo, MOTIVO_SIN_CAJA_DEMOSTRABLE);
});

test("sin turno guardado y sin turno abierto, se frena con el aviso de siempre", () => {
  const r = turnoDeReplay({ operadorVoucher: "v" }, null);
  assert.equal(r.frenada, true);
  assert.match(r.motivo, /Abrí turno/);
});

// ── La pantalla, leída SIN comentarios ──────────────────────────────────────
const pantalla = readFileSync("app/modulos/pos-ventas/page.jsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

function cuerpoDe(nombre) {
  const inicio = pantalla.indexOf(`const ${nombre} = `);
  assert.ok(inicio >= 0, `no está ${nombre}`);
  const fin = pantalla.indexOf("\n  const ", inicio + 1);
  return pantalla.slice(inicio, fin < 0 ? undefined : fin);
}

test("al encolar, la venta guarda el turno donde se cobró", () => {
  const cuerpo = cuerpoDe("guardarVentaPendiente");
  const venta = cuerpo.slice(cuerpo.indexOf("const ventaPendiente = {"), cuerpo.indexOf("enqueue(ventaPendiente)"));
  assert.match(venta, /turnoId: turnoActual\?\.id \?\? null/);
});

test("al sincronizar, el turno sale de turnoDeReplay y nunca del turno actual a secas", () => {
  const cuerpo = cuerpoDe("procesarCola");
  assert.match(cuerpo, /turnoDeReplay\(ventaPendiente, turnoActual\)/);
  assert.match(cuerpo, /turnoId: destino\.turnoId/);
  assert.doesNotMatch(cuerpo, /turnoId: turnoActual/, "volvió a mandar el turno de quien sincroniza");
  // La frenada no se manda ni se borra.
  const frenada = cuerpo.slice(cuerpo.indexOf("if (destino.frenada)"), cuerpo.indexOf("try {"));
  assert.match(frenada, /continue;/);
  assert.doesNotMatch(frenada, /dequeueById/);
});
