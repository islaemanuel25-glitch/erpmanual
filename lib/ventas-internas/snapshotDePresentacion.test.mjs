// DÓNDE SE CAPTURA LA PRESENTACIÓN, Y QUÉ PASA CUANDO HAY VARIAS FUENTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/ventas-internas/snapshotDePresentacion.test.mjs
//
// La información de cómo se contó lo que salió NO se perdía antes de
// `mapearVentaATransferencia`: se perdía DENTRO, al quedarse solo con el total
// físico consolidado. En `lineasComerciales` —que esa función ya recibía— está
// `modoVentaLinea`, que distingue el pack de la unidad suelta, y `baseStock`, con
// la unidad de medida, el factor y el peso.
//
// Estos candados fijan que se capture de ahí y que la consolidación no invente.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRESENTACION } from "@/lib/productos/presentacionDeProducto";
import { snapshotDeLineas, snapshotsPorProductoLocal } from "./snapshotDePresentacion.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Una línea comercial como la devuelve `planConsumoVenta`. */
const linea = (extra = {}) => ({
  tipo: "NORMAL",
  productoLocalId: 7,
  productoBaseId: 70,
  cantidad: 1,
  consumoFisico: { productoLocalId: 7, cantidadStock: 1 },
  baseStock: { factorPack: 1, unidad_medida: "unidad", modoVentaDeposito: "PESO" },
  ...extra,
});

// ═══════════════════════════════════════════════════════════════════════════
// LAS CINCO PRESENTACIONES, CAPTURADAS DESDE LA LÍNEA COMERCIAL
// ═══════════════════════════════════════════════════════════════════════════

test("un cajón se captura como CAJÓN con su factor", () => {
  const s = snapshotDeLineas([
    linea({ cantidad: 6, baseStock: { factorPack: 8, unidad_medida: "cajon" } }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.CAJON);
  assert.equal(s.cantidadPresentada, 6);
  assert.equal(s.factorPresentacion, 8);
  assert.equal(s.sueltasEnviadas, 0);
});

test("un pack se captura como PACK, no como cajón", () => {
  const s = snapshotDeLineas([
    linea({ cantidad: 6, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.PACK);
  assert.equal(s.factorPresentacion, 6);
});

test("un kilo se captura como KG y sin factor", () => {
  const s = snapshotDeLineas([
    linea({ cantidad: 3.25, baseStock: { unidad_medida: "kg", modoVentaDeposito: "PESO" } }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.KG);
  assert.equal(s.cantidadPresentada, 3.25);
  assert.equal(s.factorPresentacion, null);
  assert.equal(s.pesoPiezaKg, null);
});

test("una pieza fija se captura como PIEZA y CONGELA su peso", () => {
  const s = snapshotDeLineas([
    linea({
      cantidad: 2,
      baseStock: { unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 4.45 },
    }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.PIEZA);
  assert.equal(s.cantidadPresentada, 2);
  // Es el número del que sale cuántos KILOS acredita `confirmar-recepcion`.
  assert.equal(s.pesoPiezaKg, 4.45);
});

test("fuera de un depósito no hay piezas: manda lo que el producto es", () => {
  const s = snapshotDeLineas(
    [linea({ cantidad: 2, baseStock: { unidad_medida: "kg", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 4.45 } })],
    { esDeposito: false }
  );
  assert.equal(s.presentacionEnvio, PRESENTACION.KG);
});

// ═══════════════════════════════════════════════════════════════════════════
// CONSOLIDACIÓN: EL MISMO PRODUCTO CON VARIAS FUENTES
// ═══════════════════════════════════════════════════════════════════════════

test("packs completos y unidades sueltas del MISMO producto no se aplastan", () => {
  // El POS permite vender el mismo producto en dos modos. Consolidado da 29
  // unidades físicas, y de ahí no se puede volver: 29/6 no es entero.
  const s = snapshotDeLineas([
    linea({ cantidad: 4, modoVentaLinea: "NORMAL", baseStock: { factorPack: 6, unidad_medida: "pack" } }),
    linea({ cantidad: 5, modoVentaLinea: "UNIDAD_REMANENTE", baseStock: { factorPack: 6, unidad_medida: "pack" } }),
  ]);
  assert.equal(s.presentacionEnvio, PRESENTACION.PACK);
  assert.equal(s.cantidadPresentada, 4, "cuatro bultos completos");
  assert.equal(s.sueltasEnviadas, 5, "y cinco sueltas");
  assert.equal(s.factorPresentacion, 6);
  // La cuenta cierra y es exacta: 4 × 6 + 5 = 29.
  assert.equal(s.cantidadPresentada * s.factorPresentacion + s.sueltasEnviadas, 29);
});

test("dos líneas de packs del mismo producto se SUMAN", () => {
  const s = snapshotDeLineas([
    linea({ cantidad: 2, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
    linea({ cantidad: 3, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
  ]);
  assert.equal(s.cantidadPresentada, 5);
  assert.equal(s.sueltasEnviadas, 0);
});

test("si dos líneas describen presentaciones INCOMPATIBLES no se inventa ninguna", () => {
  // No debería poder pasar, y si pasa se prefiere no registrar antes que elegir
  // una al azar. Una línea sin snapshot dice "no se registró", que es la verdad.
  const s = snapshotDeLineas([
    linea({ cantidad: 1, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
    linea({ cantidad: 1, baseStock: { factorPack: 8, unidad_medida: "cajon" } }),
  ]);
  assert.equal(s, null);
});

test("agrupa por ProductoLocal y saltea lo que no es mercadería", () => {
  const mapa = snapshotsPorProductoLocal([
    linea({ productoLocalId: 1, cantidad: 6, consumoFisico: { productoLocalId: 1, cantidadStock: 36 }, baseStock: { factorPack: 6, unidad_medida: "pack" } }),
    linea({ productoLocalId: 2, cantidad: 3.25, consumoFisico: { productoLocalId: 2, cantidadStock: 3.25 }, baseStock: { unidad_medida: "kg" } }),
    // Un servicio no es mercadería.
    linea({ productoLocalId: 3, tipo: "SERVICIO" }),
    // Un combo viaja expandido en sus componentes, no como línea.
    linea({ productoLocalId: 4, tipo: "COMBO" }),
    // Una línea sin consumo físico no aporta.
    linea({ productoLocalId: 5, consumoFisico: null }),
  ]);

  assert.deepEqual([...mapa.keys()].sort((a, b) => a - b), [1, 2]);
  assert.equal(mapa.get(1).presentacionEnvio, PRESENTACION.PACK);
  assert.equal(mapa.get(2).presentacionEnvio, PRESENTACION.KG);
});

// ═══════════════════════════════════════════════════════════════════════════
// DÓNDE SE ENGANCHA, Y QUÉ NO SE TOCÓ
// ═══════════════════════════════════════════════════════════════════════════

test("el mapper captura la presentación SIN tocar la cantidad física", () => {
  const src = leer("lib/ventas-internas/mapearVentaATransferencia.js");

  // Se engancha donde la información todavía existe: las líneas comerciales.
  assert.match(src, /snapshotsPorProductoLocal\(lineasComerciales/);
  assert.match(src, /if \(presentacion\) item\.presentacion = presentacion/);

  // Y la regla física NO cambió: sigue mandando UNIDAD y factor 1, que es lo que
  // mantiene la paridad con el descuento de stock que la venta ya hizo.
  assert.match(src, /unidadEnviada: UNIDAD_ENVIADA/);
  assert.match(src, /factorPack: FACTOR_PACK/);
  assert.match(src, /export const UNIDAD_ENVIADA = "UNIDAD"/);
  assert.match(src, /export const FACTOR_PACK = 1/);
});

test("crearTransferencia persiste el snapshot y no lo inventa", () => {
  const src = leer("lib/transferencias/crearTransferencia.js");
  assert.match(src, /presentacionEnvio: p\.presentacionEnvio/);
  assert.match(src, /cantidadPresentada: p\.cantidadPresentada/);
  assert.match(src, /sueltasEnviadas: p\.sueltasEnviadas \?\? 0/);
  assert.match(src, /factorPresentacion: p\.factorPresentacion \?\? null/);
  assert.match(src, /pesoPiezaKg: p\.pesoPiezaKg \?\? null/);
  // Sin snapshot no se escribe nada: la línea queda con los cinco en null, que
  // es lo mismo que les pasa a las anteriores a la migración.
  assert.match(src, /const p = item\.presentacion \|\| null;/);
  assert.match(src, /\.\.\.\(p\s*\?\s*\{/);
});

test("y el camino manual congela lo que ya sabía", () => {
  const src = leer("app/api/pos-transferencias/enviar/route.js");
  assert.match(src, /function snapshotDeEnvioManual/);
  // Usa la unidad REALMENTE preparada, que este flujo sí registra.
  assert.match(src, /contadoEn: item\.unidadEnviada/);
  assert.match(src, /presentacion: snapshotDeEnvioManual\(item\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. NINGÚN BACKFILL, Y NINGUNA MIGRACIÓN DE MÁS
// ═══════════════════════════════════════════════════════════════════════════

test("la migración es ADITIVA y no rellena ningún histórico", () => {
  const sql = leer("prisma/migrations/20260909170000_presentacion_envio_snapshot/migration.sql")
    .replace(/^\s*--.*$/gm, "");

  // Lo que tiene que estar.
  assert.match(sql, /CREATE TYPE "PresentacionEnvio"/);
  for (const col of [
    "presentacionEnvio", "cantidadPresentada", "sueltasEnviadas",
    "factorPresentacion", "pesoPiezaKg",
  ]) {
    assert.ok(
      new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`).test(sql),
      `falta la columna ${col}`
    );
  }

  // Lo que NO puede estar. Un backfill acá sería inventar cómo se despachó.
  for (const prohibido of [/\bDROP\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bINSERT\b/i, /\bALTER COLUMN\b/i]) {
    assert.ok(!prohibido.test(sql), `la migración contiene ${prohibido}`);
  }
  // Ninguna columna nueva es obligatoria: los históricos quedan en null.
  assert.ok(!/NOT NULL/i.test(sql), "una columna nueva quedó obligatoria");
});

test("esta tanda agrega UNA migración y ninguna más", () => {
  const dirs = fs
    .readdirSync(path.join(RAIZ, "prisma/migrations"))
    .filter((d) => /^\d/.test(d))
    .sort();
  assert.equal(dirs.length, 9);
  assert.equal(dirs[dirs.length - 1], "20260909170000_presentacion_envio_snapshot");
});
