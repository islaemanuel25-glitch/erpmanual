// "TE QUEDAN PRECIOS SIN APLICAR" CON LOS PRODUCTOS, NO SOLO EL NÚMERO
// (Emanuel, 2026-10-24, Dab en producción d158de62).
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/hojaDePendientes.test.mjs
//
// El caso: "3 listos sin tildar. Si terminás ahora, siguen con el costo
// anterior." con «Terminar sin aplicar» y «Volver». No decía cuáles eran ni
// dejaba hacer nada.
//
// Las tarjetas NO se escriben a mano: salen de `tusProductosDeLaLista` con filas
// que tienen los campos que pide `resultado/route.js` (los de
// `tusProductos.test.mjs`). Se afirma el estado de cada una antes de usarla.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCerrarConPendientes from "@/components/proveedores/listas/HojaCerrarConPendientes";
import { TEXTO_USAR } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
import { ESTADO_TU_PRODUCTO, MOTIVO_DESMARCADA, tusProductosDeLaLista } from "@/lib/proveedores/listas/tusProductos";
import {
  CIERRE,
  TEXTO_TERMINAR_SIN_APLICAR,
  aplicarLosPendientesYTerminar,
  pendientesAlCerrar,
  productosPendientes,
  textoDeLosPendientes,
  textoSinMarcar,
} from "@/lib/proveedores/listas/cerrarConPendientes";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const PANTALLA = "app/modulos/proveedores/listas/[id]/page.jsx";
const RANGO = { minPct: 2, maxPct: 15 };

let proximoId = 1;
function fila(cambios = {}) {
  return {
    id: proximoId++,
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    motivo: null,
    costoAnterior: 1300,
    productoBaseId: 55,
    excluidaManual: false,
    aplicada: false,
    seleccionada: true,
    diferenciaPct: 13.06,
    aumentoEsperadoMinPct: 2,
    aumentoEsperadoMaxPct: 15,
    confirmadoEn: null,
    vinculadoEn: null,
    multiplicadorConfirmado: null,
    fueraDeRangoAceptadaEn: null,
    costoMaestroPropuesto: 1469.75,
    codigoCrudo: "1612",
    descripcionProveedor: "SOLITAS ANIMACION 400G",
    precioConIva: 14697.5,
    unidadesPorBulto: 10,
    ...cambios,
  };
}
const producto = (id, nombre, cambios) => ({ id, nombre, precio_costo: 1300, filas: [fila({ productoBaseId: id, ...cambios })] });

/** Los tres de Dab: listos, en rango, y que nadie marcó. */
const DAB_SIN_MARCAR = () =>
  tusProductosDeLaLista({
    productos: [
      producto(1, "ALFAJOR TRIPLE DAB 70G", { seleccionada: false }),
      producto(2, "GALLETITA DULCE DAB 120G", { seleccionada: false }),
      producto(3, "TURRON DAB 25G", { seleccionada: false }),
    ],
    rango: RANGO,
    proveedor: "Dab",
  }).items;

const html = (props) =>
  renderToStaticMarkup(
    React.createElement(HojaCerrarConPendientes, {
      accion: CIERRE.TERMINAR,
      onUsar() {},
      onVerParaRevisar() {},
      onAplicarYTerminar() {},
      onCerrarSinAplicar() {},
      onVolver() {},
      ...props,
    })
  );
const botones = (h) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

test("la hoja lista cada producto pendiente por nombre, con su «✓ Usar» y el texto en criollo", () => {
  const items = DAB_SIN_MARCAR();
  for (const it of items) {
    assert.equal(it.estado, ESTADO_TU_PRODUCTO.REVISAR, it.nombre);
    assert.equal(it.motivo, MOTIVO_DESMARCADA, it.nombre);
  }
  const productos = productosPendientes(items);
  assert.equal(productos.sinMarcar.length, 3);
  const h = html({ pendientes: pendientesAlCerrar({ listos: 0, listosSinTildar: 3 }), productos });

  for (const it of items) assert.ok(h.includes(it.nombre), `no está ${it.nombre}`);
  assert.ok(h.includes("Estos 3 productos tienen precio nuevo y no los marcaste. Si terminás, siguen con el precio de antes."));
  assert.ok(!/tild/i.test(h), "volvió «tildar»");
  // "$ hoy → $ nuevo" y el % de cada una.
  assert.equal((h.match(/→/g) ?? []).length, 3);
  assert.equal((h.match(/\+13,1 %/g) ?? []).length, 3);
  // Un «✓ Usar» por tarjeta, y los tres botones a lo ancho en el orden pedido.
  const b = botones(h);
  assert.equal(b.filter((x) => x === TEXTO_USAR).length, 3);
  assert.deepEqual(b.slice(-3), ["✓ Aplicar estos 3 y terminar", TEXTO_TERMINAR_SIN_APLICAR, "Volver"]);
  for (const c of [...h.matchAll(/<button[^>]*class="([^"]*)"/g)].slice(-3)) assert.match(c[1], /\bw-full\b/);
  // Sin «Para revisar» aparte, no hay línea gris.
  assert.ok(!h.includes("en Para revisar"));
});

test("con marcados y sin marcar: los dos en tarjetas, el marcado con «✓ Usar» relleno; y la línea de «Para revisar» con «Ver»", () => {
  const items = tusProductosDeLaLista({
    productos: [
      producto(1, "ALFAJOR TRIPLE DAB 70G", { seleccionada: false }),
      producto(2, "GALLETITA DULCE DAB 120G", {}),
      producto(4, "CHUPETIN DAB", { diferenciaPct: 40, costoMaestroPropuesto: 1820 }),
    ],
    rango: RANGO,
    proveedor: "Dab",
  }).items;
  assert.deepEqual(items.map((i) => i.estado), [ESTADO_TU_PRODUCTO.REVISAR, ESTADO_TU_PRODUCTO.CAMBIA, ESTADO_TU_PRODUCTO.REVISAR]);
  const productos = productosPendientes(items);
  assert.deepEqual(productos.todos.map((i) => i.nombre), ["ALFAJOR TRIPLE DAB 70G", "GALLETITA DULCE DAB 120G"]);
  assert.equal(textoDeLosPendientes(productos), "Estos 2 productos tienen precio nuevo y todavía no se aplicaron. Si terminás, siguen con el precio de antes.");

  const h = html({ pendientes: pendientesAlCerrar({ listos: 1, listosSinTildar: 1 }), productos, paraRevisar: 1 });
  assert.ok(!h.includes("CHUPETIN DAB"), "uno para revisar no es un pendiente con precio nuevo");
  assert.equal((h.match(/aria-pressed="true"/g) ?? []).length, 1, "el marcado va relleno");
  assert.ok(h.includes("Queda 1 en Para revisar: sigue con el precio de antes."));
  assert.ok(botones(h).includes("Ver"));
  assert.deepEqual(botones(h).slice(-3), ["✓ Aplicar estos 2 y terminar", TEXTO_TERMINAR_SIN_APLICAR, "Volver"]);
});

test("«✓ Aplicar estos N y terminar» marca los sin marcar, aplica (los escribe) y termina; si marcar falla, nada", async () => {
  const productos = productosPendientes(DAB_SIN_MARCAR());
  const pasos = [];
  const r = await aplicarLosPendientesYTerminar({
    sinMarcar: productos.sinMarcar,
    listos: 0,
    marcar: async (ids) => (pasos.push(["marcar", ids]), true),
    aplicar: async () => (pasos.push("aplicar"), { ok: true, escritos: 3 }),
    terminar: async (op) => (pasos.push(["terminar", op]), true),
  });
  assert.deepEqual(r, { terminada: true });
  assert.deepEqual(pasos, [["marcar", productos.sinMarcar.map((i) => i.filaId)], "aplicar", ["terminar", { conservarAviso: true }]]);
  assert.equal(pasos[0][1].length, 3);

  // Si marcar falla, no se aplica ni se termina.
  const nada = [];
  const falla = await aplicarLosPendientesYTerminar({
    sinMarcar: productos.sinMarcar,
    marcar: async () => false,
    aplicar: async () => (nada.push("aplicar"), { ok: true, escritos: 3 }),
    terminar: async () => (nada.push("terminar"), true),
  });
  assert.deepEqual(falla, { terminada: false, sinMarcar: true });
  assert.deepEqual(nada, []);
  // Y si se marcaron y aplicar no escribió ninguno, tampoco termina: los N cuentan.
  const cero = await aplicarLosPendientesYTerminar({
    sinMarcar: productos.sinMarcar,
    marcar: async () => true,
    aplicar: async () => ({ ok: true, escritos: 0 }),
    terminar: async () => true,
  });
  assert.deepEqual(cero, { terminada: false, sinEscribir: true });
});

test("la pantalla: la hoja con los productos y el «✓ Usar» de la tarjeta; «Ver» abre Para revisar; el cartel con «Ver cuáles»", () => {
  const p = codigoDe(PANTALLA);
  assert.match(p, /const pendientesPorProducto = productosPendientes\(delosDosPaquetes\);/);
  assert.match(p, /const delosDosPaquetes = \[\.\.\.tusProductos\.items, \.\.\.puedenSer\.confirmados\];/);
  assert.match(p, /<HojaCerrarConPendientes[\s\S]*?productos=\{pendientesPorProducto\}[\s\S]*?onUsar=\{\(it\) => usar\(it\)\}[\s\S]*?onVerParaRevisar=\{verParaRevisar\}/);
  // Marcar es la ruta del «✓ Usar»: seleccion con MARCAR.
  assert.match(p, /const marcarFilas = async \(ids\) => \{[\s\S]*?\/seleccion`[\s\S]*?accion: ACCION_USAR\.MARCAR, ids/);
  // «Ver»: cierra la hoja y pone el chip.
  assert.match(p, /const verParaRevisar = \(\) => \{\s*setCerrandoConPendientes\(null\);[\s\S]*?setFiltro\(FILTRO\.REVISAR\);/);
  // El cartel: el texto en criollo y «Ver cuáles», que deja en la lista solo ésos.
  assert.equal(textoSinMarcar(3), "3 productos con precio nuevo que no marcaste");
  assert.equal(textoSinMarcar(1), "1 producto con precio nuevo que no marcaste");
  assert.match(p, /\{viendoSinMarcar \? "Ver todos" : "Ver cuáles"\}/);
  assert.match(p, /const visibles = viendoSinMarcar\s*\? sinMarcarDelPaquete1\s*:/);
});
