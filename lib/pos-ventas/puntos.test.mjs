// Candados de lib/pos-ventas/puntos.js.
//
// El caso que importa es el MANIPULADO: un cliente que manda más plata de
// descuento que la que valen los puntos que dice gastar. Era lo único del cobro
// que el servidor aceptaba sin recalcular.
//
// Correr con: node --test lib/pos-ventas/puntos.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  descuentoPorPuntos,
  verificarDescuentoPuntos,
  textoDescuentoPuntosInvalido,
  TOLERANCIA_CENTAVOS,
} from "./puntos.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// La fórmula
// ---------------------------------------------------------------------------

test("100 puntos a $0,50 el punto descuentan $50", () => {
  assert.equal(descuentoPorPuntos(100, 0.5), 50);
});

test("1 punto a $1 descuenta $1", () => {
  assert.equal(descuentoPorPuntos(1, 1), 1);
});

test("sin puntos o sin equivalencia no hay descuento", () => {
  assert.equal(descuentoPorPuntos(0, 0.5), 0);
  assert.equal(descuentoPorPuntos(100, 0), 0);
  assert.equal(descuentoPorPuntos(0, 0), 0);
});

test("entradas inválidas dan 0 y NUNCA NaN", () => {
  // Un NaN propagado al total lo vuelve NaN entero y la venta se guarda rota.
  for (const [p, w] of [
    [null, 0.5], [undefined, 0.5], ["abc", 0.5], [NaN, 0.5],
    [100, null], [100, undefined], [100, "abc"], [100, NaN],
    [-100, 0.5], [100, -0.5], [Infinity, 0.5], [100, Infinity],
  ]) {
    const r = descuentoPorPuntos(p, w);
    assert.equal(Number.isFinite(r), true, `descuentoPorPuntos(${p}, ${w}) dio ${r}`);
    assert.equal(r, 0, `descuentoPorPuntos(${p}, ${w}) tendría que dar 0`);
  }
});

test("el resultado se redondea a centavos", () => {
  // Nunca sale un importe con más de dos decimales, que es lo que se le cobra a
  // una persona.
  //
  // Los dos casos son de coma flotante y van para el lado contrario, a propósito:
  // 3 × 0.335 da 1.0050000000000001 —apenas ARRIBA de 1.005— y redondea a 1.01;
  // 7 × 0.07 da 0.49000000000000005 y redondea a 0.49. El resultado depende del
  // error binario, no del decimal que uno escribiría a mano, y por eso la
  // verificación del servidor lleva tolerancia en vez de comparar por igualdad.
  assert.equal(descuentoPorPuntos(3, 0.335), 1.01);
  assert.equal(descuentoPorPuntos(7, 0.07), 0.49);

  for (const [p, w] of [[3, 0.335], [7, 0.07], [13, 1.13], [999, 0.37]]) {
    const r = descuentoPorPuntos(p, w);
    assert.equal(Math.round(r * 100), r * 100, `${p}×${w} dio ${r}, con más de dos decimales`);
  }
});

// ---------------------------------------------------------------------------
// EL CASO MANIPULADO — es el motivo de todo este archivo
// ---------------------------------------------------------------------------

test("un descuento inflado se rechaza", () => {
  // 1 punto que dice valer $5000: era exactamente lo que el servidor aceptaba.
  const r = verificarDescuentoPuntos({
    puntosCanje: 1,
    pesoPorPunto: 0.5,
    descuentoRecibido: 5000,
  });
  assert.equal(r.ok, false);
  assert.equal(r.esperado, 0.5);
  assert.equal(r.recibido, 5000);
});

test("un descuento inflado por poco también se rechaza", () => {
  // No hace falta que sea escandaloso para ser plata.
  const r = verificarDescuentoPuntos({
    puntosCanje: 100,
    pesoPorPunto: 0.5,
    descuentoRecibido: 55,
  });
  assert.equal(r.ok, false);
});

test("mandar puntos en 0 con descuento no cuela", () => {
  const r = verificarDescuentoPuntos({
    puntosCanje: 0,
    pesoPorPunto: 0.5,
    descuentoRecibido: 300,
  });
  assert.equal(r.ok, false);
  assert.equal(r.esperado, 0);
});

test("sin configuración de canje, cualquier descuento se rechaza", () => {
  // El local no tiene fidelidad activa: los puntos no valen plata.
  const r = verificarDescuentoPuntos({
    puntosCanje: 100,
    pesoPorPunto: 0,
    descuentoRecibido: 50,
  });
  assert.equal(r.ok, false);
});

test("un descuento negativo se rechaza", () => {
  // Sumaría al total en vez de restar.
  const r = verificarDescuentoPuntos({
    puntosCanje: 100,
    pesoPorPunto: 0.5,
    descuentoRecibido: -50,
  });
  assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// El caso legítimo no se rompe
// ---------------------------------------------------------------------------

test("el descuento correcto pasa", () => {
  const r = verificarDescuentoPuntos({
    puntosCanje: 100,
    pesoPorPunto: 0.5,
    descuentoRecibido: 50,
  });
  assert.equal(r.ok, true);
  assert.equal(r.esperado, 50);
});

test("el ruido de coma flotante NO rechaza una venta legítima", () => {
  // Es la razón de que exista la tolerancia. 0.1 + 0.2 y sus parientes.
  const r = verificarDescuentoPuntos({
    puntosCanje: 3,
    pesoPorPunto: 0.1,
    descuentoRecibido: 0.30000000000000004,
  });
  assert.equal(r.ok, true);
});

test("la tolerancia es de UN centavo, no más", () => {
  const dentro = verificarDescuentoPuntos({
    puntosCanje: 100, pesoPorPunto: 0.5, descuentoRecibido: 50.01,
  });
  const fuera = verificarDescuentoPuntos({
    puntosCanje: 100, pesoPorPunto: 0.5, descuentoRecibido: 50.03,
  });
  assert.equal(TOLERANCIA_CENTAVOS, 1);
  assert.equal(dentro.ok, true);
  assert.equal(fuera.ok, false, "2 centavos de más ya no son ruido, son plata");
});

test("sin canje no se verifica nada", () => {
  const r = verificarDescuentoPuntos({
    puntosCanje: 0, pesoPorPunto: 0.5, descuentoRecibido: 0,
  });
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// El mensaje: el cajero tiene a alguien esperando enfrente
// ---------------------------------------------------------------------------

test("el mensaje dice los dos importes y qué hacer", () => {
  const t = textoDescuentoPuntosInvalido({ esperado: 50, recibido: 5000 });
  assert.match(t, /50\.00/);
  assert.match(t, /5000\.00/);
  assert.match(t, /volvé a aplicarlo/i);
});

// ---------------------------------------------------------------------------
// Estructural: que el importe no vuelva a entrar crudo, y que haya UNA fórmula
// ---------------------------------------------------------------------------

test("la venta NO toma el descuento por puntos crudo del body", () => {
  const src = leer("app/api/pos-ventas/crear/route.js");
  assert.doesNotMatch(
    src,
    /descuentoPorPuntosVal\s*=\s*Number\(descuentoPorPuntosBody\)/,
    "el descuento por puntos volvió a entrar sin recalcular desde el servidor"
  );
  assert.match(src, /verificarDescuentoPuntos\(/);
});

test("el POS y el servidor comparten la fórmula", () => {
  // Si el front calculara distinto, el servidor rechazaría cada canje y el canje
  // quedaría inutilizable sin que nadie entienda por qué.
  const src = leer("app/modulos/pos-ventas/page.jsx");
  assert.match(src, /from "@\/lib\/pos-ventas\/puntos"/);
  assert.doesNotMatch(
    src,
    /const descuentoCalc = pts \* pesoPorPunto/,
    "el POS volvió a escribir la fórmula a mano"
  );
});
