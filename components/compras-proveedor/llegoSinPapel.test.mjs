// LA MERCADERÍA QUE LLEGA SIN NINGÚN PAPEL (Mauro, 2026-10-26).
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/llegoSinPapel.test.mjs
//
// Productos del pedido que no están en ninguna boleta leída y llegaron igual.
// Hasta acá contaban como no llegados y no había cómo ingresarlos. Ahora van en
// su grupo con «Llegó sin papel» / «No llegó», la elección se guarda en
// `llegoSinPapel`, entran al costo del ERP sin escribir costo maestro, cuentan
// como llegados y suman al total a pagar.
//
// LOS DATOS SALEN DE LA FUNCIÓN QUE LOS ARMA DE VERDAD: `filasDeConciliacion`
// con detalles como los devuelve `aplanarDetalles`. Un fixture escrito a mano
// con campos que el endpoint no manda es el defecto que más se repite.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { aplanarDetalles } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import {
  LLEGADA,
  llegada,
  llegaronSinPapel,
  recibidosDelCierre,
  resumenDelCierre,
} from "@/lib/compras-proveedor/cierreDeRecepcion";
import {
  importeSinPapelCentavos,
  pagoDelCierreEnPantalla,
  resolverTotalDelCierre,
  totalAPagarDelComprobante,
} from "@/lib/compras-proveedor/pagoDelCierre";
import ProductosSinBoleta, { TITULO_SIN_BOLETA } from "@/components/compras-proveedor/ProductosSinBoleta.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Sin comentarios: un candado que busca texto los encuentra (CLAUDE.md, regla 5).
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// Las líneas del pedido como las trae Prisma en la conciliación: el producto
// con su base, el costo de la línea y la columna nueva.
const DETALLES_DE_LA_BASE = [
  { id: 2565, cantidad: 4, precioCosto: 40500, unidad: "BULTO", cantidadRecibida: null, llegoSinPapel: null,
    producto: { baseId: 2019, base: { id: 2019, nombre: "Marlboro 20 Crafted Box", factor_pack: 10 } } },
  { id: 2578, cantidad: 25, precioCosto: 13200, unidad: "BULTO", cantidadRecibida: 25, llegoSinPapel: true,
    producto: { baseId: 2044, base: { id: 2044, nombre: "Liverpool rojo", factor_pack: 10 } } },
  { id: 2573, cantidad: 10, precioCosto: 18300, unidad: "BULTO", cantidadRecibida: null, llegoSinPapel: false,
    producto: { baseId: 2040, base: { id: 2040, nombre: "Milenio uva", factor_pack: 10 } } },
  { id: 2560, cantidad: 3, precioCosto: 35035.2, unidad: "BULTO", cantidadRecibida: null, llegoSinPapel: null,
    producto: { baseId: 2030, base: { id: 2030, nombre: "Lucky 10 mentolado", factor_pack: 10 } } },
];
const detalles = aplanarDetalles(DETALLES_DE_LA_BASE);
// Un papel que trae solo el Marlboro: los otros tres no están en ninguna boleta.
const { sinComprobante } = filasDeConciliacion({
  comprobantes: [
    {
      id: 5, estado: "SIN_TOTAL", tipo: null, puntoVenta: null, numero: null,
      lineas: [{ id: 120, textoCrudo: "M.CRAFTED 20 BOX", cantidad: 4, pedidoDetalleId: 2565, pedidoDetalle: detalles[0] }],
    },
  ],
  detalles,
});

test("LA ELECCIÓN VIAJA DE LA BASE A LA PANTALLA: llegoSinPapel y el costo en la escala del pedido", () => {
  assert.deepEqual(sinComprobante.map((d) => d.pedidoDetalleId), [2578, 2573, 2560]);
  assert.deepEqual(sinComprobante.map((d) => d.llegoSinPapel), [true, false, null]);
  assert.equal(sinComprobante[0].precioCostoDelPedido, 13200);
  assert.deepEqual(sinComprobante.map((d) => llegada(d)), [LLEGADA.LLEGO, LLEGADA.NO_LLEGO, LLEGADA.NO_LLEGO]);
  // Lo tocado en pantalla y todavía no vuelto de la base manda.
  assert.equal(llegada(sinComprobante[2], { 2560: LLEGADA.LLEGO }), LLEGADA.LLEGO);
});

test("«LLEGÓ SIN PAPEL» ENTRA CON LO PEDIDO O CON LO ESCRITO; «NO LLEGÓ» Y SIN CONTESTAR, EN CERO", () => {
  const r = recibidosDelCierre({ filas: [], sinComprobante, contados: { 2578: 20, 2573: 10 } });
  assert.equal(r[2578], 20, "la cantidad se puede cambiar");
  assert.equal(r[2573], 0, "no llegó: aunque haya un número en el campo");
  assert.equal(r[2560], 0, "nadie contestó: no inventa mercadería");
  assert.equal(recibidosDelCierre({ filas: [], sinComprobante })[2578], 25, "sin escribir nada, lo pedido");
  const resumen = resumenDelCierre({ sinComprobante, contados: { 2578: 20 } });
  assert.equal(resumen.llegaron, 1);
  assert.equal(resumen.unidadesQueEntran, 20);
});

test("SUMA AL TOTAL A PAGAR, A COSTO DEL ERP, CON LO QUE ENTRA", () => {
  const productos = llegaronSinPapel({ sinComprobante, contados: { 2578: 20 } });
  assert.deepEqual(productos, [{ pedidoDetalleId: 2578, cantidad: 20, costo: 13200 }]);
  assert.equal(importeSinPapelCentavos(productos), 26400000);
  // Con las facturas conocidas, la deuda es lo facturado más lo que llegó sin papel.
  const d = resolverTotalDelCierre({ totales: [100000], sinPapelCentavos: 26400000 });
  assert.equal(d.centavos, 10000000 + 26400000);
  // CONTRAPRUEBA: sin lo de sin papel, la deuda era solo lo facturado.
  assert.equal(resolverTotalDelCierre({ totales: [100000] }).centavos, 10000000);
});

test("UN PAPEL SIN TOTAL SE PAGA POR LA SUMA DE SUS PRODUCTOS: no se escribe a mano", () => {
  const lineas = [{ costoFinalRenglon: "134400.00" }, { costoFinalRenglon: "292500.50" }];
  assert.equal(totalAPagarDelComprobante({ estado: "SIN_TOTAL", totalLeido: null, lineas }), 426900.5);
  // El total impreso manda cuando está.
  assert.equal(totalAPagarDelComprobante({ estado: "CARGADO", totalLeido: "500.00", lineas }), 500);
  // Un papel mal leído sin total no se suma: sus importes no están verificados.
  assert.equal(totalAPagarDelComprobante({ estado: "MAL_LEIDO", totalLeido: null, lineas }), null);
  // Ni un sin total con un producto sin importe.
  assert.equal(totalAPagarDelComprobante({ estado: "SIN_TOTAL", lineas: [...lineas, { costoFinalRenglon: null }] }), null);
  // Y la hoja de cierre deja de pedirlo.
  const total = totalAPagarDelComprobante({ estado: "SIN_TOTAL", totalLeido: null, lineas });
  assert.equal(pagoDelCierreEnPantalla({ totales: [total], estado: "PENDIENTE" }).pideTotal, false);
  assert.equal(pagoDelCierreEnPantalla({ totales: [null], estado: "PENDIENTE" }).pideTotal, true, "contraprueba");
});

const dibujar = (props) =>
  renderToStaticMarkup(React.createElement(ProductosSinBoleta, { productos: sinComprobante, ...props }));
const soloTexto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("EL GRUPO: su título, dos botones por producto, el renglón «Sin papel» y nada si no hay ninguno", () => {
  const html = dibujar({ contados: { 2578: 20 } });
  const texto = soloTexto(html);
  assert.ok(texto.includes(TITULO_SIN_BOLETA));
  assert.equal(TITULO_SIN_BOLETA, "No están en ninguna boleta");
  assert.equal((texto.match(/Llegó sin papel/g) || []).length, 3);
  assert.equal((texto.match(/No llegó/g) || []).length, 3);
  assert.match(texto, /Sin papel: \$\s?264\.000,00/);
  // En pantalla se dice "productos".
  assert.doesNotMatch(texto, /líneas?|ítems?|renglon(es)?/i);
  // Las acciones son botones.
  assert.equal((html.match(/<button/g) || []).length >= 6, true);
  assert.equal(dibujar({ productos: [] }), "");
});

test("ELEGIR NO MUEVE NADA: la tarjeta tiene la misma forma con «Llegó sin papel» y con «No llegó»", () => {
  // Se compara el esqueleto —etiquetas, sin atributos ni texto—: lo único que
  // puede cambiar al tocar es el color del botón elegido y el campo apagado.
  const esqueleto = (html) => html.replace(/<(\/?[a-z]+)[^>]*>/g, "<$1>").replace(/>[^<]*</g, "><");
  const llego = dibujar({ llegadas: { 2560: LLEGADA.LLEGO } });
  const noLlego = dibujar({ llegadas: { 2560: LLEGADA.NO_LLEGO } });
  assert.equal(esqueleto(llego), esqueleto(noLlego));
  // Y el campo de cantidad está siempre, apagado si no llegó.
  assert.equal((noLlego.match(/<input/g) || []).length, 3);
});

test("EL SERVIDOR: solo vale lo guardado, no escribe costo, suma a la deuda y deja el registro exacto", () => {
  const ruta = codigoDe("app/api/compras-proveedor/recibir/[id]/route.js");
  assert.match(ruta, /\(d\) => d\.llegoSinPapel === true && pedidosSinPapel\.has\(d\.id\)/);
  assert.match(ruta, /for \(const d of llegaronSinPapel\) \{\s*costosExcluidos\.add\(d\.id\);\s*costosAceptados\.delete\(d\.id\);/);
  assert.match(ruta, /totales: facturasDelPedido\.map\(totalAPagarDelComprobante\)/);
  assert.match(ruta, /sinPapelCentavos: importeSinPapelCentavos\(/);
  assert.match(ruta, /where: \{ pedidoId, llegoSinPapel: true, id: \{ notIn: llegaronSinPapel\.map\(\(d\) => d\.id\) \} \}/);
  const correccion = codigoDe("app/api/compras-proveedor/recepcion/correccion/route.js");
  assert.match(correccion, /typeof body\.llegoSinPapel === "boolean" \? body\.llegoSinPapel : null/);
  // Cuenta como llegado en «N de M llegaron».
  // La carga de la conciliación vive en `conciliacionDelPedido.js` desde Mauro #298.
  assert.match(codigoDe("lib/compras-proveedor/comprobante/conciliacionDelPedido.js"), /llegoSinPapel: true,/);
  const conc = codigoDe("app/api/compras-proveedor/conciliacion/[pedidoId]/route.js");
  assert.match(conc, /\.filter\(\(d\) => llegada\(d\) === LLEGADA\.LLEGO && d\.productoBaseId != null\)/);
  assert.match(conc, /totalAPagar: totalAPagarDelComprobante\(porId\.get\(g\.comprobante\.id\)\)/);
});

test("LA PANTALLA: el grupo va debajo de los comprobantes y el cierre manda lo elegido", () => {
  const p = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.match(p, /<ProductosSinBoleta\s+productos=\{huerfanas\}/);
  assert.match(p, /llegaronSinPapel: llegaronSinPapel\(\{/);
  assert.match(p, /bodyData\.llegaronSinPapel = extra\.llegaronSinPapel/);
  assert.match(p, /\(g\) => g\?\.comprobante\?\.totalAPagar \?\? null/);
  // La hoja ya no pregunta: CONTRAPRUEBA de que la pregunta se fue de ahí.
  const hoja = codigoDe("components/compras-proveedor/HojaCerrarRecepcion.jsx");
  assert.doesNotMatch(hoja, /setLlegadas/);
  assert.match(hoja, /sinPapelCentavos,/);
});
