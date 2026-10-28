// EL PEDIDO #19: "Error interno al enviar POS" CON TODO RESUELTO.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/pos-transferencias/enviarPedido19.test.mjs
//
// Incidente del 2026-10-28. Sale de la sección 17 REAL de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs` contra Postgres: un pedido con
// renglones resueltos sin dueño, de dos depósitos, "No hay", uno pesado con
// tres decimales, uno agregado por el depósito, y una GASEOSA "solo por bulto"
// de factor 1 que el local pidió —y el depósito preparó— por unidad.
//
// La causa no eran los renglones sin dueño (salían del origen ya en ese
// código): era la gaseosa. `validarEnvio` la rechazaba con un error suelto y el
// `catch` de la ruta contestaba 500 "Error interno al enviar POS", sin nombre.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const real = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));

// Regla de Emanuel (2026-10-28, después del incidente): "solo por bulto" con
// bulto de 1 sale aunque se haya preparado por unidad —bulto y unidad son lo
// mismo—. Con bulto de más de 1 sigue el rechazo con el nombre: en la corrida,
// la LECHE (bulto de 12) preparada por unidad.

test("bulto de 12 preparado por unidad: el producto se nombra, 409, sin «POS» ni «interno»", () => {
  assert.deepEqual(real.depositoEnviarProductoNoSeEnvia, { status: 409, cuerpo: { ok: false, error: "LECHE: solo se puede enviar por bulto." } });
});

test("el #19 sale entero: la gaseosa de bulto 1 por unidad, lo sin dueño del origen, cada depósito lo suyo", () => {
  assert.equal(real.depositoEnviarPedido19.cuerpo.ok, true);
  const { transferencias, bajaDelStock } = real.depositoViajePedido19;
  assert.deepEqual(transferencias, [
    { origen: "merca", lineas: [["ACEITE", 2, "UNIDAD"], ["AZUCAR", 1, "UNIDAD"], ["GASEOSA", 4, "UNIDAD"], ["LECHE", 2, "BULTO"], ["QUESO", 1.853, "UNIDAD"], ["YOGURT", 2, "UNIDAD"]] },
    { origen: "frio", lineas: [["HELADO", 3, "UNIDAD"]] },
  ]);
  const movidos = Object.entries(bajaDelStock).filter(([, v]) => v !== 0).sort();
  // La gaseosa baja 4: bulto de 1 = 1 unidad.
  assert.deepEqual(movidos, [["frio:HELADO", 3], ["merca:ACEITE", 2], ["merca:AZUCAR", 1], ["merca:GASEOSA", 4], ["merca:LECHE", 24], ["merca:QUESO", 1.853], ["merca:YOGURT", 2]]);
  assert.equal(bajaDelStock["merca:YERBA"], 0, "«No hay» descontó stock");
});

test("la excepción es solo «solo por bulto» + bulto de 1 + preparado por unidad", () => {
  const ruta = readFileSync("app/api/pos-transferencias/enviar/route.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(ruta, /const bultoDeUno = modoEnvio === "SOLO_BULTO" && unidadPreparada === "UNIDAD" && factorPack <= 1;/);
  assert.match(ruta, /if \(!validacion\.ok && !bultoDeUno\) \{\s*throw new ProductoQueNoSeEnvia\(/);
});

test("la ruta: el rechazo de un producto es suyo y va ANTES de la transacción (no escribe nada)", () => {
  const ruta = readFileSync("app/api/pos-transferencias/enviar/route.js", "utf8").replace(/\/\/[^\n]*/g, "");
  const lanza = ruta.indexOf("throw new ProductoQueNoSeEnvia(");
  const tx = ruta.indexOf("prisma.$transaction(");
  assert.ok(lanza > 0 && tx > lanza, "el rechazo de un producto quedó adentro de la transacción");
  assert.match(ruta, /if \(err instanceof ProductoQueNoSeEnvia\) \{\s*return NextResponse\.json\(\{ ok: false, error: err\.message \}, \{ status: 409 \}\);/);
});
