// RECIBIR PEDIDO: LOS TRES DEFECTOS DEL PEDIDO DE MAURO #298.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/recibirPedidoMauro298.test.mjs
//
// 1. Con una factura cargada no había forma de subir otra: el botón del panel
//    se callaba cuando la pantalla ponía su bloque de la foto, y el bloque solo
//    se dibuja sin ningún comprobante.
// 2. "Está señalado abajo" y abajo nada: la conciliación se pedía por la
//    CANTIDAD de comprobantes, y leer no la cambia. Y "0 de 24 llegaron" con
//    15 renglones atados, porque se contaban solo los vínculos guardados.
// 3. Un papel sin total marcado como "la cuenta no cierra" (ver
//    `lector/sinTotal.test.mjs`, que tiene el lado de la puerta).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chipDeFactura, comoSeDice } from "@/lib/compras-proveedor/comprobante/pantalla";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Sin comentarios: un candado que busca texto los encuentra (CLAUDE.md, regla 5).
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PANEL = "components/comprobantes/PanelComprobantes.jsx";
const PAGINA = "app/modulos/compras-proveedor/[id]/page.jsx";
const LISTAR = "app/api/compras-proveedor/comprobantes/listar/route.js";
const CONCILIACION = "app/api/compras-proveedor/conciliacion/[pedidoId]/route.js";

test("1 · «+ Agregar comprobante» va debajo de la lista desde el primer papel, y con cero no está", () => {
  // Emanuel, 2026-10-26: con cero papeles el recuadro de la foto ya es la forma
  // de subir, y el botón sobraba. Con uno o más, el botón es la única forma de
  // subir el siguiente: ese era el defecto 1.
  const c = codigoDe(PANEL);
  // Uno solo, con la condición de recibir y de que haya al menos un papel: no depende de `vacio`.
  assert.match(c, /const botonAgregar = puedeRecibir && items\.length > 0 \? \(/);
  const boton = c.slice(c.indexOf("const botonAgregar"), c.indexOf(") : null;", c.indexOf("const botonAgregar")));
  assert.match(boton, /onClick=\{\(\) => inputRef\.current\?\.click\(\)\}/, "la misma subida que el primero");
  assert.match(boton, /\+ Agregar comprobante/);
  // Un solo lugar, debajo de la lista; el bloque vacío no lo lleva.
  assert.equal(c.match(/\{botonAgregar\}/g)?.length, 1);
  const vacio = c.slice(c.indexOf("vacio({"), c.indexOf(") : (", c.indexOf("vacio({")));
  assert.doesNotMatch(vacio, /botonAgregar/, "con cero comprobantes el recuadro de la foto alcanza");
  // CONTRAPRUEBA del defecto: ningún botón de subir queda atado a `!vacio`.
  assert.doesNotMatch(c, /!vacio/);
  assert.doesNotMatch(c, /\+ Agregar factura/);
});

test("1 · recargar no cambia la lista por la ruedita: lo de abajo no salta", () => {
  const c = codigoDe(PANEL);
  const recargar = c.slice(c.indexOf("async function recargar()"), c.indexOf("useEffect(", c.indexOf("async function recargar()")));
  assert.doesNotMatch(recargar, /setCargando\(true\)/);
});

test("2 · leer una factura vuelve a pedir la conciliación: la firma de los papeles está en sus dependencias", () => {
  const panel = codigoDe(PANEL);
  assert.match(panel, /onPapeles\?\.\(\(d\.items \|\| \[\]\)\.map\(\(c\) => `\$\{c\.id\}:\$\{c\.estado\}:\$\{c\.leidoEn \?\? ""\}`\)/);
  const p = codigoDe(PAGINA);
  assert.match(p, /onPapeles=\{setFirmaDeLosPapeles\}/);
  const efecto = p.slice(p.indexOf("/api/compras-proveedor/conciliacion/"));
  assert.match(efecto.slice(0, efecto.indexOf("]);") + 3), /firmaDeLosPapeles/);
});

test("2 · «N de M llegaron» sale de la conciliación, la misma cuenta que la lista", () => {
  const p = codigoDe(PAGINA);
  assert.match(p, /coberturaDelPedido=\{conciliacion\?\.cobertura \?\? null\}/);
  const panel = codigoDe(PANEL);
  assert.match(panel, /\{ \.\.\.coberturaListada, \.\.\.coberturaDelPedido \}/);
  // La lista de comprobantes ya no cuenta llegados con los vínculos guardados.
  const listar = codigoDe(LISTAR);
  assert.doesNotMatch(listar, /coberturaDelPedido/);
  assert.doesNotMatch(listar, /productoLocalId: \{ not: null \}/);
  // Y la conciliación cuenta con el producto que resolvió el análisis.
  const conc = codigoDe(CONCILIACION);
  assert.match(conc, /productoBaseId: l\.pedidoDetalle\?\.productoBaseId \?\? l\.productoBaseId \?\? null/);
  assert.doesNotMatch(conc, /l\.pedidoDetalleId != null \|\| l\.productoLocalId != null/);
});

test("3 · un papel sin total no se ve como «no cierra»: tilde y tono de verificado", () => {
  const chip = chipDeFactura("SIN_TOTAL");
  assert.match(chip.texto, /✓/);
  assert.equal(chip.tono, "ok");
  assert.doesNotMatch(comoSeDice("SIN_TOTAL").titulo, /no cierra/i);
  // CONTRAPRUEBA: el que no se pudo leer sigue diciendo que no cierra.
  assert.equal(chipDeFactura("MAL_LEIDO").texto, "no cierra");
});
