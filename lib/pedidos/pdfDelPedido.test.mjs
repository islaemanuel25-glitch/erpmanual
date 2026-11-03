// EL PDF DE UN PEDIDO AL DEPÓSITO: que la ruta devuelve un PDF, que respeta los
// permisos de ver el pedido y que no lleva precios.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/pedidos/pdfDelPedido.test.mjs
//
// ── DE DÓNDE SALE EL FIXTURE ─────────────────────────────────────────────
//
// `pdfDelPedido.fixture.json` NO se escribió a mano: lo deja
// `scripts/pruebas-db/pedidoPdf.mjs` con `ESCRIBIR_FIXTURE=1`, llamando a las
// rutas reales contra `erpazul_al` —el local arma y manda el pedido, el depósito
// decide dos líneas— y sacando del PDF los textos que dibuja. Los productos de
// la siembra tienen costo 4321,50 y venta 8765,25 cargados: si alguno llegara al
// papel, se vería.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { lineaDelPdf, nombreDelArchivo } from "@/lib/pedidos/pdfDelPedido";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const medido = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "pdfDelPedido.fixture.json"), "utf8"));
const { siembra } = medido;
const sinComentarios = (ruta) =>
  fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
const RUTA = "app/api/pedidos/pdf/[id]/route.js";

// ── LA RUTA DEVUELVE UN PDF ─────────────────────────────────────────────────

test("al local y al depósito les contesta 200 con un PDF que se descarga como pedido-<número>-<local>.pdf", () => {
  for (const quien of ["local", "deposito"]) {
    const r = medido[quien];
    assert.equal(r.status, 200, quien);
    assert.equal(r.contentType, "application/pdf", quien);
    assert.equal(r.empiezaConPdf, true, `${quien}: el cuerpo no empieza con %PDF-`);
    assert.equal(r.disposicion, `attachment; filename="${nombreDelArchivo(siembra.posId, siembra.local)}"`, quien);
  }
  assert.match(nombreDelArchivo(siembra.posId, siembra.local), new RegExp(`^pedido-${siembra.posId}-mini-centro-a-\\d+\\.pdf$`));
});

test("el PDF lleva el encabezado, los renglones por categoría y alfabéticos, y el total de renglones", () => {
  const t = medido.local.textos;
  for (const dato of [`Pedido #${siembra.posId}`, siembra.local, siembra.deposito, "Enviado", "3 renglones"]) {
    assert.ok(t.includes(dato), `falta «${dato}»`);
  }
  const [bebidas, almacen] = siembra.categorias.map((c) => c.toLocaleUpperCase("es"));
  const orden = [almacen, "Yerba 1kg", bebidas, "Agua x10", "Coca 2L"].map((x) => t.indexOf(x));
  assert.ok(orden.every((i) => i >= 0), `falta alguno: ${orden}`);
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, "el orden no es por categoría y alfabético");
  assert.ok(t.includes("2 PACK x10"), "el pack no se dice como en la recepción");
  assert.ok(!t.includes("Preparado"), "recién enviado no tiene que llevar la columna Preparado");
});

test("con líneas decididas por el depósito, va la columna Preparado con lo preparado y «No hay»", () => {
  const t = medido.deposito.textos;
  assert.ok(t.includes("Preparado"));
  const coca = t.indexOf("Coca 2L");
  assert.deepEqual(t.slice(coca, coca + 3), ["Coca 2L", "3 UNIDAD", "No hay"]);
  const agua = t.indexOf("Agua x10");
  assert.deepEqual(t.slice(agua, agua + 3), ["Agua x10", "2 PACK x10", "2 PACK x10"]);
});

// ── UN RENGLÓN CAMBIADO POR OTRO PRODUCTO (2026-11-03) ─────────────────────

test("REEMPLAZO EN EL PDF: el renglón cambiado dice el que va, con su código y «Pidió: <original>» debajo; el normal sigue igual", () => {
  const t = medido.reemplazo.textos;
  const i = t.indexOf("Yerba 500g");
  assert.ok(i > 0, "el renglón no dice el producto que va");
  assert.deepEqual(t.slice(i - 1, i + 4), [siembra.codigos.yerbaMedio, "Yerba 500g", "Pidió: Yerba 1kg", "4 UNIDAD", "4 UNIDAD"]);
  assert.ok(!t.includes("Yerba 1kg"), "el pedido quedó como nombre de un renglón");
  assert.ok(!t.includes(siembra.codigos.yerba), "quedó el código del pedido");
  // El normal, como antes, y sin "Pidió:".
  const coca = t.indexOf("Coca 2L");
  assert.deepEqual(t.slice(coca, coca + 3), ["Coca 2L", "3 UNIDAD", "No hay"]);
  assert.equal(t.filter((x) => x.startsWith("Pidió:")).length, 1);
  assert.ok(t.includes("3 renglones"));
});

test("REEMPLAZO EN EL PDF: «Pidió» va con la letra de la fila, en el gris de los datos secundarios, y el renglón se agranda para que entre", () => {
  const src = sinComentarios("lib/pdf/pedidoAlDepositoPdf.js");
  assert.match(src, /if \(f\.pidio\) \{\s*escribir\(\s*page,\s*recortar\(texto\(f\.pidio\), normal, L\.fila, [^)]*\),\s*x\.producto \+ m\.relleno, yf - L\.fila \* 1\.2, L\.fila, normal, GRIS\s*\);/);
  assert.match(src, /y -= m\.altoFila\(f\);/);
  // El reparto en páginas usa el mismo alto: si no, el renglón alto se saldría de la hoja.
  assert.match(sinComentarios("lib/pdf/listaDePreciosPdf.js"), /const altoDe = \(fila\) => m\.altoFila\?\.\(fila\) \?\? m\.fila;/);
});

// ── RESPETA LOS PERMISOS DE VER EL PEDIDO ───────────────────────────────────

test("otro grupo no lo ve (404), un cajero sin permiso de pedidos tampoco (403), sin sesión 401", () => {
  assert.equal(medido.otroGrupo.status, 404);
  assert.equal(medido.otroGrupo.cuerpo.ok, false);
  assert.equal(medido.cajero.status, 403);
  assert.equal(medido.sinSesion.status, 401);
  for (const r of [medido.otroGrupo, medido.cajero, medido.sinSesion]) {
    assert.notEqual(r.contentType, "application/pdf");
  }
});

test("la ruta pregunta con las reglas que ya existen: la del detalle del depósito y la del historial del local", () => {
  const src = sinComentarios(RUTA);
  assert.match(src, /checkPerm\(session, "pos_transferencias\.ver"\)/);
  assert.match(src, /esDepositoDelPedido\(prisma, session\.localId, pos\)/);
  assert.match(src, /sinCancelados\(\{ id: posId \}\)/);
  assert.match(src, /alcanceDelHistorial\(req\)/);
  assert.match(src, /\.\.\.pedidosDelHistorial\(alcance\), id: posId, estado: \{ in: ESTADOS_DEL_HISTORIAL \}/);
});

// ── NO INCLUYE PRECIOS ──────────────────────────────────────────────────────

test("ningún texto del PDF es un precio, un costo o un importe", () => {
  for (const quien of ["local", "deposito"]) {
    const todo = medido[quien].textos.join("\n");
    assert.ok(!todo.includes("$"), `${quien}: hay un signo $`);
    assert.ok(!todo.includes(siembra.costo), `${quien}: aparece el costo`);
    assert.ok(!todo.includes(siembra.venta), `${quien}: aparece la venta`);
    assert.ok(!/precio|costo|importe|total\s*:/i.test(todo), `${quien}: hay un rótulo de dinero`);
  }
});

test("la línea del papel es una lista cerrada: el costo de la consulta no pasa", () => {
  const linea = lineaDelPdf({
    id: 1,
    sugerido: 2,
    unidadSugerida: "BULTO",
    precioCosto: 999,
    producto: { nombre: "X", precio_costo: 999, precio_venta: 1999, base: { nombre: "X", precio_costo: 999, precio_venta: 1999, factor_pack: 6, unidad_medida: "pack" } },
  });
  // `modoVentaDeposito` es cómo vende el depósito (por peso o por pieza), no un precio.
  assert.ok(!Object.keys(linea).some((k) => /precio|costo|importe|subtotal/i.test(k)), Object.keys(linea).join(", "));
  assert.ok(!Object.values(linea).some((v) => v === 999 || v === 1999));
});
