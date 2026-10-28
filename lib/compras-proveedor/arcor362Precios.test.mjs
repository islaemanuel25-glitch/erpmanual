// LA FACTURA DE ARCOR #362: UNA BAJA DENTRO DE LA VARIACIÓN COINCIDE, Y UNA BAJA SE PUEDE ACEPTAR.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/arcor362Precios.test.mjs
//
// Emanuel, 2026-10-28, sobre la recepción abierta de Arcor (pedido 362):
//
//   1. Si el papel viene MÁS BARATO que el ERP y la diferencia está dentro de
//      la variación normal del proveedor (Arcor: 10 %), la tarjeta muestra
//      "✓ Coincide", y tocarlo es "dejar el mío". Más caro, o fuera de la
//      variación, sigue como siempre: hay que entrar a Corregir.
//   2. "Aceptar el precio nuevo" en Corregir tiene que poder BAJAR el precio y
//      aplicarse al cerrar. Viene marcado el más alto, como siempre.
//
// Las filas son las de la conciliación real de ese pedido el 2026-10-28
// (`arcor362Filas.fixture.json`, de la ruta GET de producción), las tres que
// todavía no tenían decisión de precio: SANDIA y CONITOS a −7,3 %, FRUTILLA a −5 %.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  estadoDeLinea,
  ESTADO_LINEA,
  bajaQueDejaElTuyo,
  hayQueDecidirElPrecio,
  porcentajeDelPrecio,
} from "./estadoDeLineaFacturada.js";
import { aceptarEstaBloqueado, puedeAceptarse, ACCION_PRECIO } from "./comprobante/aceptarPrecio.js";
import { decisionDeCostoSugerida, MARCA } from "./decisionDeCostoSugerida.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILAS = JSON.parse(fs.readFileSync(new URL("./arcor362Filas.fixture.json", import.meta.url), "utf8"));
const fila = (nombre) => FILAS.find((f) => f.producto.trim() === nombre);
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. LA BAJA DENTRO DE LA VARIACIÓN COINCIDE ──────────────────────────────

test("LAS FILAS REALES: sin decisión, el papel más barato y dentro del 10 % de Arcor", () => {
  for (const nombre of ["MOGUL EXTREME SANDIA", "MOGUL CONITOS", "Furtilla Extreme x500"]) {
    const f = fila(nombre);
    assert.ok(f, nombre);
    assert.equal(f.variacionNormalPct, 10, nombre);
    assert.equal(hayQueDecidirElPrecio(f), true, `${nombre}: nadie decidió`);
    const pct = porcentajeDelPrecio(f);
    assert.ok(pct < 0 && pct >= -10, `${nombre}: ${pct}`);
  }
});

test("1 · SANDIA, CONITOS Y FRUTILLA MUESTRAN «COINCIDE»: su tilde es dejar el tuyo", () => {
  for (const nombre of ["MOGUL EXTREME SANDIA", "MOGUL CONITOS", "Furtilla Extreme x500"]) {
    const f = fila(nombre);
    assert.equal(bajaQueDejaElTuyo(f), true, nombre);
    assert.equal(estadoDeLinea(f), ESTADO_LINEA.COINCIDE, nombre);
  }
});

test("1 · MÁS CARO que el ERP, aunque sea dentro de la variación, sigue pidiendo Corregir", () => {
  const f = fila("MOGUL EXTREME SANDIA");
  const masCaro = { ...f, costoCatalogo: Math.round((f.costoFactura / 1.07) * 100) / 100 };
  assert.ok(porcentajeDelPrecio(masCaro) > 0);
  assert.equal(bajaQueDejaElTuyo(masCaro), false);
  assert.equal(estadoDeLinea(masCaro), ESTADO_LINEA.PRECIO_DISTINTO);
});

test("1 · MÁS BARATO pero FUERA de la variación sigue pidiendo Corregir", () => {
  const f = fila("MOGUL EXTREME SANDIA");
  const muyBarato = { ...f, costoCatalogo: Math.round((f.costoFactura / 0.85) * 100) / 100 };
  assert.ok(porcentajeDelPrecio(muyBarato) < -10);
  assert.equal(bajaQueDejaElTuyo(muyBarato), false);
  assert.equal(estadoDeLinea(muyBarato), ESTADO_LINEA.PRECIO_DISTINTO);
});

test("1 · TOCAR «COINCIDE» EN UNA BAJA GUARDA «DEJAR EL MÍO» antes de marcarla", () => {
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  const tilde = pagina.slice(pagina.indexOf("const aceptarLoQueDiceLaFactura"));
  assert.match(tilde, /if \(bajaQueDejaElTuyo\(fila\)\) \{\s*const r = await dejarMiPrecioDeLinea\(fila\);/);
  assert.ok(
    tilde.indexOf("dejarMiPrecioDeLinea(fila)") < tilde.indexOf("marcarRevisada("),
    "la decisión se guarda antes de dar la fila por revisada"
  );
});

// ── 2. UNA BAJA SE PUEDE ACEPTAR, Y LLEGA AL CIERRE ─────────────────────────

test("2 · LA BAJA REAL DE ARCOR YA NO BLOQUEA «ACEPTAR EL PRECIO NUEVO», ni en la hoja ni en el servidor", () => {
  const f = fila("MOGUL EXTREME SANDIA");
  assert.equal(f.precio.decision.accion, ACCION_PRECIO.SOLO_INFORMAR, "la conciliación la clasifica como baja");
  assert.equal(aceptarEstaBloqueado(f.precio.decision), false);
  const r = puedeAceptarse({
    linea: { id: f.lineaId },
    productoBaseId: f.productoBaseId,
    lineaDePedidoId: f.pedidoDetalleId,
    comprobante: { estado: "CARGADO", confirmadoEn: null },
    decision: f.precio.decision,
    unidad: f.unidad,
  });
  assert.deepEqual(r, { ok: true });
  // El salto brusco sigue sin poder aceptarse.
  assert.equal(aceptarEstaBloqueado({ accion: ACCION_PRECIO.FRENA }), true);
});

test("2 · LO MARCADO POR DEFECTO SIGUE SIENDO EL MÁS ALTO: dejar el tuyo", () => {
  const f = fila("MOGUL EXTREME SANDIA");
  const s = decisionDeCostoSugerida({ papel: f.costoFactura, tuyo: f.costoCatalogo, variacionPct: f.variacionNormalPct });
  assert.equal(s.marcado, MARCA.DEJA);
});

test("2 · DESPUÉS DE ACEPTAR, EL COSTO QUE VIAJA AL CIERRE ES EL ACEPTADO, no el de cuando se abrió el pedido", () => {
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  const aceptar = pagina.slice(
    pagina.indexOf("const aceptarPrecioDeLinea"),
    pagina.indexOf("const dejarMiPrecioDeLinea")
  );
  assert.match(aceptar, /const nuevo = Number\(d\.precioNuevo\);/);
  assert.match(aceptar, /setCostos\(\(prev\) => \(\{ \.\.\.prev, \[fila\.pedidoDetalleId\]: nuevo\.toFixed\(2\) \}\)\)/);
  // Y la ruta devuelve ese número.
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(ruta, /precioNuevo: resultado\.nuevo/);
  // El cierre manda `costos`, y con eso escribe el costo de la línea.
  assert.match(pagina, /costos,\n/);
});
