// LA COLA OFFLINE SE SINCRONIZA CONTRA LA CAJA DONDE SE COBRÓ.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/replayOffline.test.mjs
//
// El servidor es la última defensa —PIN activo del dueño de la caja, caja
// operativa y del día; el voucher solo puede negar— y eso lo ejerce
// scripts/pruebas-db/cajaPorOperador.mjs. Acá se afirma la otra mitad: que la
// pantalla manda la venta a SU turno y no al de quien sincroniza, que guarda
// ese turno al encolar, que lo que no se puede atribuir se frena sin mandarse
// ni borrarse, y que un rechazo del servidor deja la venta en la cola.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { turnoDeReplay, MOTIVO_SIN_CAJA_DEMOSTRABLE } from "@/lib/pos-ventas/replayOffline";

test("la venta va al turno donde se cobró, sin importar quién sincroniza", () => {
  assert.deepEqual(turnoDeReplay({ turnoId: 10, operadorVoucher: "v" }), { turnoId: 10 });
  assert.deepEqual(turnoDeReplay({ turnoId: 10, operadorVoucher: null }), { turnoId: 10 });
  assert.deepEqual(turnoDeReplay({ turnoId: "10" }), { turnoId: 10 });
});

test("venta anterior sin turno: se FRENA, tenga voucher o no", () => {
  // Con el voucher se sabe quién la cobró, no en qué caja.
  for (const venta of [{}, { operadorVoucher: "v" }, { turnoId: null }, { turnoId: 0 }, { turnoId: "x" }]) {
    const r = turnoDeReplay(venta);
    assert.equal(r.frenada, true, `no se le inventa una caja: ${JSON.stringify(venta)}`);
    assert.equal(r.motivo, MOTIVO_SIN_CAJA_DEMOSTRABLE);
  }
});

test("turnoDeReplay no conoce el turno actual: no tiene cómo mudar una venta", () => {
  assert.equal(turnoDeReplay.length, 1);
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

test("al sincronizar, el turno sale de turnoDeReplay y nunca del turno actual", () => {
  const cuerpo = cuerpoDe("procesarCola");
  assert.match(cuerpo, /turnoDeReplay\(ventaPendiente\)/);
  assert.match(cuerpo, /turnoId: destino\.turnoId/);
  assert.doesNotMatch(cuerpo, /turnoId: turnoActual/, "volvió a mandar el turno de quien sincroniza");
  // La frenada no se manda ni se borra.
  const frenada = cuerpo.slice(cuerpo.indexOf("if (destino.frenada)"), cuerpo.indexOf("try {"));
  assert.match(frenada, /continue;/);
  assert.doesNotMatch(frenada, /dequeueById/);
});

test("solo un éxito o un duplicado sacan la venta de la cola", () => {
  const cuerpo = cuerpoDe("procesarCola");
  const borrados = cuerpo.split("dequeueById(").length - 1;
  assert.equal(borrados, 1, "la cola se borra en un solo lugar");
  const antes = cuerpo.slice(0, cuerpo.indexOf("dequeueById("));
  assert.match(antes.slice(antes.lastIndexOf("if (")), /^if \(data\.ok \|\| data\.isDuplicate\)/);
});
