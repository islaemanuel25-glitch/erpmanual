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

// Desde PR B la sincronización vive en UN motor (sincronizacionOffline.js) y la
// pantalla ya no arma el pedido de la venta. Lo que se afirmaba sobre
// `procesarCola` se afirma ahora sobre el motor, leído sin comentarios; el
// comportamiento lo ejercen sincronizacionOffline.test.mjs y la prueba de base.
const motor = readFileSync("lib/pos-ventas/sincronizacionOffline.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

test("al sincronizar, el turno sale de turnoDeReplay y nunca del turno actual", () => {
  assert.match(motor, /const destino = turnoDeReplay\(item\);/);
  assert.match(motor, /api\.crear\(cuerpoDeReplay\(item, destino\.turnoId\)\)/);
  assert.doesNotMatch(motor, /turnoActual/, "el motor no conoce el turno de quien sincroniza");
  // La frenada no se manda ni se borra.
  const frenada = motor.slice(motor.indexOf("if (destino.frenada)"), motor.indexOf("const duenoId"));
  assert.match(frenada, /continue;/);
  assert.doesNotMatch(frenada, /quitar|api\.crear/);
});

test("la pantalla no manda ventas por su cuenta: solo el motor llama a crear con la cola", () => {
  assert.doesNotMatch(pantalla, /origenOffline/, "volvió un replay escrito en la pantalla");
  assert.doesNotMatch(pantalla, /dequeueById|clearQueue|saveQueue/);
});

test("solo el servidor diciendo SINCRONIZADA o DESCARTADA saca la venta de la cola", () => {
  const borrados = motor.split("cola.quitar(").length - 1;
  assert.equal(borrados, 1, "la cola se borra en un solo lugar");
  const antes = motor.slice(0, motor.indexOf("cola.quitar("));
  assert.match(
    antes.slice(antes.lastIndexOf("if (")),
    /^if \(fila\.estado === SERVIDOR\.SINCRONIZADA \|\| fila\.estado === SERVIDOR\.DESCARTADA\)/
  );
  // Y no se mira la respuesta de crear para borrar: ni ok ni isDuplicate.
  assert.doesNotMatch(motor, /isDuplicate/);
});
