// CANDADO: el conteo de líneas con diferencia es UNO y no cambió al mudarse.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/lineasConDiferencia.test.mjs
//
// Las filas de abajo tienen la forma de lo que trae
// `SELECT_TRANSFERENCIA_DE_LA_CUENTA` —la fila de Prisma, con `cantidad` y
// `recibido`—, que es lo que reciben los dos lectores: el tablero y la capacidad
// `transferencias_eventos`. No la forma del DTO de la pantalla.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { contarLineasConDiferencia } from "./lineasConDiferencia.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Una línea como la trae el select compartido: snapshot de presentación UNIDAD. */
const fila = (extra = {}) => ({
  cantidad: 10,
  recibido: null,
  recibidoUnidadesSueltas: null,
  precioCosto: 100,
  unidadEnviada: "UNIDAD",
  presentacionEnvio: "UNIDAD",
  cantidadPresentada: 10,
  factorPresentacion: 1,
  sueltasEnviadas: 0,
  pesoPiezaKg: null,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: true,
  productoId: 1,
  producto: { precio_costo: 100, nombre: "Producto", base: { unidad_medida: "unidad", factor_pack: 1, nombre: "Producto" } },
  ...extra,
});

/** Una línea en PACK x6: 4 packs + 2 sueltas = 26 unidades físicas. */
const filaPack = (extra = {}) =>
  fila({ cantidad: 26, presentacionEnvio: "PACK", cantidadPresentada: 4, factorPresentacion: 6, sueltasEnviadas: 2, ...extra });

test("cuenta LÍNEAS que difieren, no unidades: dos líneas con faltante y una igual son 2", () => {
  const detalle = [fila({ recibido: 7 }), fila({ recibido: 12 }), fila({ recibido: 10 })];
  assert.equal(contarLineasConDiferencia(detalle), 2);
});

test("una línea sin contar (recibido null) no es una diferencia", () => {
  assert.equal(contarLineasConDiferencia([fila({ recibido: null }), fila({ recibido: null })]), 0);
});

test("se compara en unidades FÍSICAS: 4 packs + 2 sueltas contra 26 enviadas es igual", () => {
  assert.equal(contarLineasConDiferencia([filaPack({ recibido: 4, recibidoUnidadesSueltas: 2 })]), 0);
  assert.equal(contarLineasConDiferencia([filaPack({ recibido: 4, recibidoUnidadesSueltas: 1 })]), 1);
});

test("una línea agregada en recepción (enviada 0, recibida > 0) cuenta como diferencia", () => {
  const agregada = fila({ cantidad: 0, cantidadPresentada: 0, recibido: 3, agregadoEnRecepcion: true });
  assert.equal(contarLineasConDiferencia([agregada, fila({ recibido: 10 })]), 1);
});

test("dos líneas del MISMO producto con diferencia son 2: se cuentan líneas, no productos", () => {
  assert.equal(contarLineasConDiferencia([fila({ productoId: 5, recibido: 8 }), fila({ productoId: 5, recibido: 9 })]), 2);
});

test("el umbral es media milésima: un residuo binario no es diferencia, una milésima sí", () => {
  assert.equal(contarLineasConDiferencia([fila({ cantidad: 0.3, cantidadPresentada: 0.3, recibido: 0.1 + 0.2 })]), 0);
  assert.equal(contarLineasConDiferencia([fila({ cantidad: 1, cantidadPresentada: 1, recibido: 1.001 })]), 1);
});

test("una fila que la puerta no puede leer se saltea en vez de suponer", () => {
  // Sin `recibido` ni `cantidadRecibida`: `recibidoDeLinea` tira, y el conteo la saltea.
  const ilegible = fila();
  delete ilegible.recibido;
  assert.equal(contarLineasConDiferencia([ilegible, fila({ recibido: 1 })]), 1);
  assert.equal(contarLineasConDiferencia([]), 0);
  assert.equal(contarLineasConDiferencia(), 0);
});

test("hay UNA definición en todo el repo, y los dos lectores la importan", () => {
  // Enumerado con git, incluyendo lo no commiteado (CLAUDE.md, regla 10).
  const archivos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.js", "*.mjs", "*.jsx"], {
    cwd: RAIZ,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f && !f.endsWith(".test.mjs") && fs.existsSync(path.join(RAIZ, f)));
  const sinComentarios = (f) =>
    fs
      .readFileSync(path.join(RAIZ, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
  const definen = archivos.filter((f) => /function contarLineasConDiferencia\b/.test(sinComentarios(f)));
  assert.deepEqual(definen, ["lib/transferencias/lineasConDiferencia.js"]);

  const lectores = archivos.filter((f) => /contarLineasConDiferencia\(/.test(sinComentarios(f))).sort();
  assert.deepEqual(lectores, [
    "app/api/transferencias/tablero/route.js",
    "lib/integraciones/azul-chat/transferenciasEventos.js",
    "lib/transferencias/lineasConDiferencia.js",
  ]);
});
