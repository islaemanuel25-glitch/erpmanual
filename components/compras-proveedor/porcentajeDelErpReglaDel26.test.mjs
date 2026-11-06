// EL PORCENTAJE DE LA TARJETA DICE CUÁNTO VARIÓ EL PRECIO, CON EL MISMO
// NÚMERO Y SIGNO QUE EL TÍTULO DE CORREGIR.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/porcentajeDelErpReglaDel26.test.mjs
//
// ── LA REGLA VIGENTE, DESDE EL 2026-11-06 ────────────────────────────────
//
// (papel − ERP) ÷ ERP, `variacionDelPrecioPct`: si el precio sube, "+"; si
// baja, "−". Un solo cálculo para la tarjeta, el "Tenías…" de la hoja y su
// título. La pidió Emanuel con la Mortadela Paladini: subió 3,3 % y la tarjeta
// decía "−3,3 %" en rojo debajo de "El precio subió 3,3 %".
//
// ── EL COLOR DICE SI ES BUENO O MALO PARA EMANUEL ─────────────────────────
//
// El signo es de la variación; el color, de lo que le conviene. Precio que
// SUBE (pagás más): "+" con el color de peligro del tema. Precio que BAJA
// (pagás menos): "−" con el color de éxito. Sin cambio: el tono neutro. Lo
// decide un solo lugar, `tonoDelPorcentaje`, para la tarjeta, el "Tenías…" de
// Corregir y las pantallas de listas.
//
// ── LA HISTORIA, PARA QUE NO SE DÉ VUELTA POR ACCIDENTE ───────────────────
//
// Del 2026-10-26 al 2026-11-05 el porcentaje era el ERP contra el papel,
// (ERP − papel) ÷ ERP: una factura más barata —Philips, $33.600 contra
// $34.603,20— decía "+2,9 %" en verde. Se dio vuelta tres veces sin querer
// (7a50f0e5, el Liverpool del 2026-11-04, el maní de Prod Nat con 10c5695d), y
// las tres se deshizo porque Emanuel la quería así.
//
// El 2026-11-06, en bf6f9dfd, Emanuel pidió el signo del título de Corregir
// —(papel − ERP) ÷ ERP—, y el color se dio vuelta con él: la factura más
// barata pasó a "−2,9 %" en ROJO. Ese mismo día Emanuel mantuvo su regla del
// 26/10 sobre el color —verde lo que le conviene—, así que el signo quedó el
// de bf6f9dfd y el color volvió a ser el de antes: "−2,9 %" en verde,
// "+3,3 %" de la Mortadela en rojo.
//
// Las filas salen por el camino de la conciliación —`analizarPrecioDeLinea` y
// `filasDeConciliacion`—, con los renglones de `maniProdNatSinBulto`,
// `liverpoolRojo` y `pedido491Durazno`.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { renglonesDeLaTarjeta } from "@/lib/compras-proveedor/tarjetaDeRecepcion";

function filaDe({ linea, producto, detalle, nacidoDeFactura = false }) {
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Proveedor" } });
  const det = { ...detalle, costoMaestroHoy: producto.precio_costo };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 73, estado: "CARGADO", lineas: [{ ...linea, id: 803, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
    nacidoDeFactura,
  }).grupos[0].filas;
  return { ...f, costoMaestroHoy: producto.precio_costo, variacionNormalPct: 10 };
}

/** Prod Nat: 8 bolsas de maní a $2.312,50 contra $5.000, sin pack. */
const MANI = filaDe({
  linea: { orden: 1, textoCrudo: "MANI C/ CASCARA BOLSA x 400 GRS", cantidad: 8, netoUnitario: 2312.5, subtotalImpreso: 18500, costoFinalRenglon: 18500, enQueViene: "unidad" },
  producto: { precio_costo: 5000, factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "BULTO" },
  detalle: { id: 9301, cantidad: 8, precioCosto: 5000, unidad: "UNIDAD", productoBaseId: 801, factorPack: 1 },
});

/** Pedido 25: 16 packs de Liverpool a $11.600 contra $13.200. */
const LIVERPOOL = filaDe({
  linea: { orden: 1, textoCrudo: "LIVERPOOL ROJO PACK X10", cantidad: 16, netoUnitario: 11600, subtotalImpreso: 16 * 11600, costoFinalRenglon: 16 * 11600, enQueViene: "bulto" },
  producto: { precio_costo: 13200, factor_pack: 10, unidad_medida: "pack", modoCompraProveedor: "BULTO" },
  detalle: { id: 9302, cantidad: 25, precioCosto: 13200, unidad: "BULTO", productoBaseId: 802, factorPack: 10 },
});

/** Pedido 491, la línea 3481 rehecha: 1 bulto de duraznos a $39.271,16 contra $38.400. */
const DURAZNO = filaDe({
  linea: {
    orden: 19, textoCrudo: "DURAZNOS EN MITADES ALCO X 12 UN 820G", codigoProveedor: "1194", cantidad: 12, netoUnitario: 2640.637,
    subtotalImpreso: 31687.63, costoFinalRenglon: 39271.16, enQueViene: "unidad", tipoRenglon: "MERCADERIA",
  },
  producto: { precio_costo: 38400, factor_pack: 12, unidad_medida: "pack", modoCompraProveedor: "BULTO" },
  detalle: { id: 3481, cantidad: 1, unidad: "BULTO", precioCosto: 38400, cantidadRecibida: null, unidadesFisicas: null, kgRecibidos: null, productoBaseId: 922, factorPack: 12 },
  nacidoDeFactura: true,
});

const tarjeta = (fila) => renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila }));
const hoja = (fila) =>
  renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila, abierta: true, onCerrar() {}, onGuardar() {} }))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

for (const [nombre, fila, texto, tono, porque] of [
  ["EL MANÍ DE PROD NAT", MANI, "−53,8 %", "sunmi-text-success", "el precio bajó: el papel ($2.312,50) cobra menos que el ERP ($5.000)"],
  ["EL LIVERPOOL DEL PEDIDO 25", LIVERPOOL, "−12,1 %", "sunmi-text-success", "el precio bajó: el papel ($11.600) cobra menos que el ERP ($13.200)"],
  ["EL DURAZNO DEL PEDIDO 491", DURAZNO, "+2,3 %", "sunmi-text-danger", "el precio subió: el papel ($39.271,16) cobra más que el ERP ($38.400)"],
]) {
  test(`${nombre}: la tarjeta dice ${texto}, ${tono === "sunmi-text-success" ? "en verde: pagás menos" : "en rojo: pagás más"}`, () => {
    const r = renglonesDeLaTarjeta(fila);
    assert.equal(r.erp.texto, texto, porque);
    const html = tarjeta(fila);
    assert.match(html, new RegExp(`${tono}">${texto.replace("+", "\\+")}<`), porque);
  });
}

test("LA HOJA DICE LO MISMO QUE LA TARJETA: el título y el «Tenías…», con el mismo número y signo", () => {
  assert.match(hoja(MANI), / El precio bajó 53,8 % /);
  assert.match(hoja(MANI), /−53,8 %/);
  assert.match(hoja(DURAZNO), / El precio subió 2,3 % /);
  assert.match(hoja(DURAZNO), /\+2,3 %/);
});
