// CANDADOS DEL CRITERIO DE PRECIO POR UBICACIÓN.
//
// Dos mitades. La primera prueba que la función decida bien. La segunda prueba
// que LAS DOS PANTALLAS la usen — porque el defecto que originó esto no fue una
// función equivocada: fue que había DOS criterios, uno en cada pantalla, y se
// contradecían sin que nada avisara.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { precioDeLaUbicacion } from "./precioDeLaUbicacion.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// ── LA FUNCIÓN ────────────────────────────────────────────────────────────

test("EL CERO NO ES UN PRECIO: cae al del depósito", () => {
  // Es la decisión entera de esta tanda. Un cero guardado en la fila del local
  // no dice "vale cero", dice "no le pusieron uno".
  assert.equal(precioDeLaUbicacion(500, 0), 500);
  assert.equal(precioDeLaUbicacion(500, "0"), 500);
});

test("un precio del local de verdad gana sobre el del depósito", () => {
  assert.equal(precioDeLaUbicacion(500, 700), 700);
  assert.equal(precioDeLaUbicacion(500, 0.5), 0.5);
  // Y un negativo también gana: no es lo que esta tanda decide, y convertirlo en
  // "sin precio" sería esconder un dato roto en vez de mostrarlo.
  assert.equal(precioDeLaUbicacion(500, -3), -3);
});

test("lo que no es un valor cae al del depósito", () => {
  for (const v of [null, undefined, "", "no es un número", NaN]) {
    assert.equal(precioDeLaUbicacion(500, v), 500, String(v));
  }
});

test("si el depósito tampoco tiene, devuelve lo que haya", () => {
  // Medido: las 17 filas activas con precio en cero tienen el depósito TAMBIÉN
  // en cero, así que este es el caso real de hoy y no un borde teórico.
  assert.equal(precioDeLaUbicacion(0, 0), 0);
  assert.equal(precioDeLaUbicacion(null, 0), null);
});

// ── QUE LAS DOS PANTALLAS LA USEN ─────────────────────────────────────────

test("EL CATÁLOGO Y EL STOCK PREGUNTAN EN EL MISMO LUGAR", () => {
  const mapper = leer("lib/mappers/producto.js");
  const stock = leer("lib/stock/mapItem.js");

  assert.match(mapper, /precioDeLaUbicacion\(base\.precio_costo/, "el catálogo no lo usa para el costo");
  assert.match(mapper, /precioDeLaUbicacion\(base\.precio_venta/, "el catálogo no lo usa para la venta");
  assert.match(stock, /precioDeLaUbicacion\(base\.precio_costo/, "stock no lo usa para el costo");
  assert.match(stock, /precioDeLaUbicacion\(base\.precio_venta/, "stock no lo usa para la venta");

  // Y NO PUEDEN VOLVER LOS CRITERIOS VIEJOS. Cada uno tenía su forma:
  // el catálogo un `pick` que solo mira nulo, stock un `||`.
  assert.doesNotMatch(stock, /precio_costo \|\| /, "volvió el `||` del stock");
  assert.doesNotMatch(stock, /precio_venta \|\| /, "volvió el `||` del stock");
  assert.doesNotMatch(
    mapper,
    /pick\(base\.precio_(costo|venta)/,
    "el catálogo volvió a resolver el precio con `pick`, que deja pasar el cero"
  );
});

test("el MARGEN sigue con `pick`, y eso está decidido", () => {
  // Un margen de CERO sí es un valor cargado —"vendé esto al costo"— y no una
  // ausencia. Son 1.691 filas sin porcentaje asignado y es una decisión distinta.
  // Este candado se pone rojo si alguien "unifica" también el margen de paso.
  const mapper = leer("lib/mappers/producto.js");
  assert.match(mapper, /margen:\s*toNum\(pick\(base\.margen/);
});
