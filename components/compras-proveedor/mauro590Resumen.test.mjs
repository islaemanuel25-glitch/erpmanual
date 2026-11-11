// "FACTURA" ES EL TOTAL DEL PAPEL, Y LA GANANCIA DICE SOBRE CUÁNTOS SE CALCULÓ.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/mauro590Resumen.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-11, pedido Mauro #590) ──────────────────────
//
// Papel sin total impreso, 31 renglones que suman $4.844.300. El resumen decía
// "Factura $4.113.800": la suma de los 26 que tienen tu precio. Emanuel lo leyó
// como el total del papel y pensó que los importes no coincidían. Y en el
// recuadro de arriba "Este papel no trae total: revisá que estén todos los
// productos" salía dos veces seguidas.
//
// Regla de Emanuel: "Factura" es el total impreso si lo hay, y si no la suma de
// TODOS los renglones; la ganancia sigue sobre los que tienen precio, dicho
// claro debajo, con la plata de cada parte.
//
// `mauro590Recepcion.fixture.json`: los renglones, las líneas del pedido y las
// fichas del #590 como están en la base. Las filas salen por el camino de la
// pantalla (`analizarLineas`, `filasDeConciliacion`).

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ListaDeLaFactura from "./ListaDeLaFactura.jsx";
import D from "./mauro590Recepcion.fixture.json" with { type: "json" };
import { aplanarDetalles, analizarLineas } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { gananciaDelDeposito, textoDeLaGanancia } from "@/lib/compras-proveedor/gananciaDelDeposito";
import { textoDeLaEscalada } from "@/lib/compras-proveedor/comprobante/lector/escalada";
import { formatearMoneda } from "@/lib/moneda";

// ── COMO LO VIO EMANUEL: CINCO RENGLONES TODAVÍA SIN PRODUCTO ────────────
//
// La base es de después de recibir (12:03). Cuando miró el resumen, cinco
// renglones no tenían producto: sus códigos se vincularon a las 12:01
// (`ProductoCodigoProveedor.createdAt` de las fichas 2876, 2135, 2062, 2129 y
// 2056) y suman exactamente los $730.500 que quedaban afuera. Sin producto no
// hay línea del pedido —la siembra solo ata los vinculados—, así que van sin
// `productoLocalId` ni `pedidoDetalleId`, como estaban.
const SIN_VINCULAR_TODAVIA = [12, 14, 15, 16, 19];

function filasDel590({ comoLoVio = true } = {}) {
  const sinVincular = new Set(comoLoVio ? SIN_VINCULAR_TODAVIA : []);
  const detallesSinVincular = new Set(D.renglones.filter((r) => sinVincular.has(r.orden)).map((r) => r.pedidoDetalleId));
  const renglones = D.renglones.map((r) => (sinVincular.has(r.orden) ? { ...r, productoLocalId: null, pedidoDetalleId: null } : r));
  const fichas = new Map(D.fichas.map((b) => [b.id, b]));
  const contexto = {
    datos: { codigosProveedor: [], productos: D.fichas.map((b) => ({ productoBaseId: b.id, nombre: b.nombre })) },
    catalogo: D.fichas,
    catalogoNormalizado: D.fichas.map((b) => ({ productoBaseId: b.id, nombre: b.nombre })),
    nombrePorBase: new Map(D.fichas.map((b) => [b.id, b.nombre])),
    datosPorBase: fichas,
    decisionPorBase: new Map(),
    variacionNormalPct: 10,
  };
  const vinculados = D.detalles.filter((d) => !detallesSinVincular.has(d.id));
  const detalles = aplanarDetalles(
    vinculados.map((d) => ({ ...d, producto: { id: d.productoLocalId, baseId: d.baseId, base: fichas.get(d.baseId) } }))
  );
  const porProductoLocal = new Map(vinculados.map((d) => [d.productoLocalId, { baseId: d.baseId }]));
  // Sin catálogo para buscar: un renglón sin producto queda sin producto, como estaba.
  contexto.datos.productos = [];
  contexto.catalogo = [];
  contexto.catalogoNormalizado = [];
  const c = { id: 85, estado: "SIN_TOTAL", totalLeido: null, proveedor: { id: 3, nombre: "Mauro", umbralRevisarPct: null, umbralSospechaBajaPct: null }, lineas: renglones };
  const lineas = analizarLineas({ comprobante: c, contexto, detallesPlanos: detalles, porProductoLocal });
  const { grupos } = filasDeConciliacion({ comprobantes: [{ ...c, lineas }], detalles, nacidoDeFactura: true });
  return { comprobante: grupos[0].comprobante, filas: grupos[0].filas.map((f) => ({ ...f, variacionNormalPct: 10 })) };
}

const plano = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

test("LA CUENTA: EL PAPEL SUMA $4.844.300, LA GANANCIA VA SOBRE 26 DE 31 ($4.113.800)", () => {
  const { filas } = filasDel590();
  assert.equal(filas.length, 31);
  const c = gananciaDelDeposito(filas);
  assert.equal(Math.round(c.delPapel * 100), 484430000, "todos los renglones del papel");
  assert.equal(c.productos, 31);
  assert.equal(c.productosEnLaCuenta, 26);
  assert.equal(Math.round(c.facturado * 100), 411380000, "los 26 con tu precio");
  assert.equal(c.sinPrecioInterno, 5);
  assert.equal(Math.round(c.afueraSinPrecioImporte * 100), 73050000, "los otros 5");
  assert.equal(
    textoDeLaGanancia(c),
    `Ganancia calculada sobre 26 de 31 productos (${formatearMoneda(4113800)}). Los otros 5 no tienen tu precio cargado (${formatearMoneda(730500)}).`
  );
});

test("EL RESUMEN DICE «FACTURA $4.844.300» Y DEBAJO SOBRE CUÁNTOS SE CALCULÓ LA GANANCIA", () => {
  const { comprobante, filas } = filasDel590();
  const html = plano(
    renderToStaticMarkup(
      React.createElement(ListaDeLaFactura, { comprobante, filas, totalDelPapel: null, sinPedidoPrevio: true, onCorregir() {}, onCoincide() {} })
    )
  );
  assert.ok(html.includes(`Factura ${formatearMoneda(4844300)}`), html);
  assert.ok(!html.includes(`Factura ${formatearMoneda(4113800)}`), "decía la suma de los 26");
  assert.ok(html.includes(textoDeLaGanancia(gananciaDelDeposito(filas))), html);
  // Una sola vez la frase del papel sin total.
  assert.equal(html.split("Este papel no trae total: revisá que estén todos los productos").length - 1, 1);
});

test("CON LOS 31 VINCULADOS —COMO QUEDÓ AL RECIBIR— LA GANANCIA VA SOBRE LOS 31 Y LA FACTURA NO CAMBIA", () => {
  const { filas } = filasDel590({ comoLoVio: false });
  const c = gananciaDelDeposito(filas);
  assert.equal(Math.round(c.delPapel * 100), 484430000);
  assert.equal(c.productosEnLaCuenta, 31);
  assert.equal(textoDeLaGanancia(c), "Ganancia calculada sobre los 31 productos.");
});

test("EL RECUADRO DE LA LECTURA NO REPITE LA FRASE: EL LECTOR GRANDE DICE SOLO QUE LEYÓ", () => {
  const texto = textoDeLaEscalada({ llamo: true, cerro: true, sinTotal: true });
  assert.equal(texto, "Lo leyó el lector grande.");
  assert.doesNotMatch(texto, /no trae total/);
});
