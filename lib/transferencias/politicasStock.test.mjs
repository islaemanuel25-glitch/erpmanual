// Candados de la POLÍTICA DE STOCK del origen y de su inversa.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE, Y POR QUÉ NO EXISTÍA ANTES ─────────────────
//
// Estos candados nacieron dentro de `lib/ventas-internas/desvincularVenta.test.mjs`,
// que fue donde se escribió la inversa. Eso estaba mal desde el principio: son
// candados de `politicasStock.js`, no de la operación que la estrenó.
//
// El error se cobró el 2026-08-20, cuando la operación de desvincular se
// descartó y hubo que sacarla del despliegue: al borrar su archivo se habrían
// ido con ella seis candados que prueban una pieza que se queda y que usa la
// anulación de ventas. Se movieron acá tal cual, sin reescribirlos.
//
// La lección, que es la de siempre dada vuelta: un candado vive con la pieza que
// prueba, no con la pantalla que la usó primero.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  movimientoStockOrigen,
  reversionStockOrigen,
  politicaDeLaTransferencia,
  esPoliticaValida,
  SOLO_TRANSITO,
  DESCONTAR_Y_TRANSITO,
  POLITICAS_STOCK_ORIGEN,
} from "./politicasStock.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

// ── EL MOVIMIENTO ───────────────────────────────────────────────────────────

test("1. SOLO_TRANSITO solo marca el viaje: no descuenta la cantidad", () => {
  // El descuento ya lo hizo la venta al crearse. Descontar de nuevo sacaría la
  // mercadería dos veces del depósito.
  const { update, create } = movimientoStockOrigen(SOLO_TRANSITO, 24);
  assert.deepEqual(update, { enTransito: { increment: 24 } });
  assert.deepEqual(create, { cantidad: 0, enTransito: 24 });
});

test("1b. DESCONTAR_Y_TRANSITO saca del stock y marca el viaje", () => {
  const { update, create } = movimientoStockOrigen(DESCONTAR_Y_TRANSITO, 24);
  assert.deepEqual(update, { cantidad: { decrement: 24 }, enTransito: { increment: 24 } });
  assert.deepEqual(create, { cantidad: -24, enTransito: 24 });
});

// ── LA INVERSA ──────────────────────────────────────────────────────────────

test("2. SOLO_TRANSITO revierte el tránsito y NO devuelve la cantidad", () => {
  // Lo que hacía mal el cancelar original, y el motivo por el que cancelar
  // estaba prohibido para las transferencias nacidas de una venta: devolvía
  // mercadería que la venta sigue cobrando.
  const { update } = reversionStockOrigen(SOLO_TRANSITO, 24);
  assert.deepEqual(update, { enTransito: { decrement: 24 } });
  assert.ok(!("cantidad" in update), "devolver la cantidad inventa mercadería que la venta ya cobró");
});

test("2b. DESCONTAR_Y_TRANSITO sí devuelve la cantidad", () => {
  const { update } = reversionStockOrigen(DESCONTAR_Y_TRANSITO, 24);
  assert.deepEqual(update, { cantidad: { increment: 24 }, enTransito: { decrement: 24 } });
});

test("2c. la reversión es la INVERSA EXACTA del movimiento, no algo parecido", () => {
  // El candado que importa de las dos funciones juntas: aplicar el movimiento y
  // después la reversión tiene que dejar el stock donde estaba. Se simula el
  // álgebra de los fragmentos de Prisma sobre un saldo.
  const aplicar = (saldo, frag) => ({
    cantidad: saldo.cantidad + (frag.cantidad?.increment ?? 0) - (frag.cantidad?.decrement ?? 0),
    enTransito: saldo.enTransito + (frag.enTransito?.increment ?? 0) - (frag.enTransito?.decrement ?? 0),
  });

  for (const politica of POLITICAS_STOCK_ORIGEN) {
    const inicial = { cantidad: 100, enTransito: 7 };
    const despuesDeEnviar = aplicar(inicial, movimientoStockOrigen(politica, 24).update);
    const despuesDeCancelar = aplicar(despuesDeEnviar, reversionStockOrigen(politica, 24).update);
    assert.deepEqual(despuesDeCancelar, inicial, `${politica} no vuelve al punto de partida`);
  }
});

test("2d. una política desconocida no mueve ni revierte nada: lanza", () => {
  for (const mala of ["INVENTADA", undefined, null, ""]) {
    assert.throws(() => movimientoStockOrigen(mala, 10), (e) => e.code === "POLITICA_STOCK_INVALIDA");
    assert.throws(() => reversionStockOrigen(mala, 10), (e) => e.code === "POLITICA_STOCK_INVALIDA");
  }
  assert.equal(esPoliticaValida(SOLO_TRANSITO), true);
  assert.equal(esPoliticaValida("INVENTADA"), false);
});

// ── LA DERIVACIÓN ───────────────────────────────────────────────────────────

test("3. la política se deriva de ventaId", () => {
  assert.equal(politicaDeLaTransferencia({ ventaId: 7726, posTransferenciaId: null }), SOLO_TRANSITO);
  assert.equal(politicaDeLaTransferencia({ ventaId: null, posTransferenciaId: 12 }), DESCONTAR_Y_TRANSITO);
  assert.equal(politicaDeLaTransferencia({}), DESCONTAR_Y_TRANSITO);
  assert.equal(politicaDeLaTransferencia(null), DESCONTAR_Y_TRANSITO);
});

test("3b. y cada llamador real sigue mandando la política que la derivación supone", () => {
  // No hay columna que guarde la política: se deriva. Eso es sólido mientras los
  // dos llamadores de `crearTransferencia` sigan como están —medido sobre las 101
  // transferencias de producción el 2026-08-20: 99 con venta y sin pedido, 2 con
  // pedido y sin venta, cero con ambos y cero sin ninguno—. Si mañana alguien
  // cambia uno, la derivación empieza a mentir y el stock se revierte al revés.
  // Es la única forma de enterarse sin agregar la columna.
  const leer = (rel) =>
    fs
      .readFileSync(path.join(RAIZ, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  const venta = leer("app/api/pos-ventas/crear/route.js");
  assert.match(venta, /politicaStockOrigen:\s*SOLO_TRANSITO/,
    "la venta dejó de usar SOLO_TRANSITO: politicaDeLaTransferencia quedó mintiendo");
  assert.match(venta, /ventaId:\s*nuevaVenta\.id/,
    "la venta dejó de pasar ventaId: la derivación no puede reconocerla");

  const pos = leer("app/api/pos-transferencias/enviar/route.js");
  assert.match(pos, /politicaStockOrigen:\s*DESCONTAR_Y_TRANSITO/,
    "el flujo manual dejó de usar DESCONTAR_Y_TRANSITO");
  assert.doesNotMatch(pos, /ventaId:\s*[a-zA-Z]/,
    "el flujo manual empezó a pasar ventaId: la derivación lo confundiría con una venta");
});
