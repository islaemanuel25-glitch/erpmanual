// EL % DEL RENGLÓN ERP DICE CÓMO ESTÁ EL ERP CONTRA EL PAPEL.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/signoDelErpContraElPapel.test.mjs
//
// ── LA REGLA (Emanuel, 2026-10-26; vuelta el 2026-11-10) ──────────────────
//
// El % va al lado del renglón ERP: positivo y en verde cuando el ERP está más
// caro que el papel; negativo y en rojo cuando está más barato. El 2026-11-06
// se cambió a "cuánto varió el precio" sin que lo pidiera, y recibiendo el
// 2026-11-09 a las 21:51 el COLÓN SELECTO TINTO DULCE —papel $7.423,98 la
// unidad, ERP $6.666,67— decía "+11,4 %" en rojo. Con el Cheddar del pedido
// 564 pasaba igual.
//
// El título de Corregir sigue diciendo lo que pasa con el precio: "El precio
// subió 11,4 %". Los dos números salen de los mismos dos precios, en
// `renglonesDeLaTarjeta`, y la tarjeta y la hoja los piden ahí.
//
// Las filas salen por el camino de la pantalla, como en `colonTintoDulce`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { renglonesDeLaTarjeta, tonoDelErpContraElPapel } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { erpContraElPapelPct, gananciaDelRenglonPct } from "@/lib/compras-proveedor/estadoDeLineaFacturada";

// Sin comentarios: un candado que busca texto encuentra la prosa (regla 5).
const leer = (ruta) =>
  readFileSync(new URL(ruta, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const ficha = (costo, factor) => ({ precio_costo: costo, factor_pack: factor, unidad_medida: "pack", modoCompraProveedor: "BULTO" });

function fila({ texto, cantidad, unitario, producto, detalle }) {
  const linea = { orden: 1, textoCrudo: texto, cantidad, netoUnitario: unitario, subtotalImpreso: cantidad * unitario, costoFinalRenglon: cantidad * unitario, enQueViene: null, unidadElegida: null };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Bebidas" }, unidadElegida: undefined, variacionPct: 10 });
  const det = { id: 7101, costoMaestroHoy: producto.precio_costo, productoBaseId: 901, factorPack: producto.factor_pack, cantidadRecibida: null, ...detalle };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 81, estado: "CARGADO", lineas: [{ ...linea, id: 810, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, variacionNormalPct: 10 };
}

// El caso real: 1 pack de 6 a $44.543,90 ($7.423,98 la unidad), pedido 6
// unidades a $6.666,67.
const COLON = () =>
  fila({ texto: "COLON SELECTO TINTO DULCE", cantidad: 1, unitario: 44543.9, producto: ficha(40000, 6), detalle: { cantidad: 6, unidad: "UNIDAD", precioCosto: 6666.67 } });
// El mismo vino con el papel más barato que el ERP: $36.000 el pack, $6.000 la
// unidad. El ERP queda 10 % arriba.
const COLON_MAS_BARATO = () =>
  fila({ texto: "COLON SELECTO TINTO DULCE", cantidad: 1, unitario: 36000, producto: ficha(40000, 6), detalle: { cantidad: 6, unidad: "UNIDAD", precioCosto: 6666.67 } });

const plano = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const tarjetaHtml = (f) => renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: f }));
const hojaHtml = (f) => renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {}, onElegirLectura() {} }));
const pintado = (html, clase, texto) => new RegExp(`class="[^"]*\\b${clase}\\b[^"]*">${texto}<`).test(html);

test("LA CUENTA: (ERP − papel) / ERP, y la de la ganancia es la misma", () => {
  assert.equal(erpContraElPapelPct({ papel: 7423.98, erp: 6666.67 }).toFixed(1), "-11.4");
  assert.equal(erpContraElPapelPct({ papel: 33600, erp: 34603.2 }).toFixed(1), "2.9");
  assert.equal(erpContraElPapelPct({ papel: 1, erp: 0 }), null);
  assert.equal(gananciaDelRenglonPct({ costoFactura: 7423.98, costoCatalogo: 6666.67 }), erpContraElPapelPct({ papel: 7423.98, erp: 6666.67 }));
});

test("EL COLOR SALE DEL TEMA: más caro éxito, más barato peligro, el mismo apagado", () => {
  assert.equal(tonoDelErpContraElPapel(2.9), "sunmi-text-success");
  assert.equal(tonoDelErpContraElPapel(-11.4), "sunmi-text-danger");
  assert.equal(tonoDelErpContraElPapel(0), "sunmi-text-muted");
  assert.equal(tonoDelErpContraElPapel(null), "sunmi-text-muted");
});

test("COLÓN TINTO DULCE, EL ERP MÁS BARATO: −11,4 % EN ROJO EN LA TARJETA Y EN LA HOJA; EL TÍTULO DICE QUE SUBIÓ", () => {
  const f = COLON();
  const erp = renglonesDeLaTarjeta(f).erp;
  assert.equal(erp.texto, "−11,4 %", "decía +11,4 %");
  assert.equal(erp.tono, "sunmi-text-danger");
  assert.ok(erp.variacion > 0, "el precio subió");

  const t = tarjetaHtml(f);
  assert.ok(pintado(t, "sunmi-text-danger", "−11,4 %"), plano(t));
  assert.ok(!t.includes("+11,4 %"), plano(t));

  const h = hojaHtml(f);
  assert.ok(pintado(h, "sunmi-text-danger", "−11,4 %"), plano(h));
  assert.ok(plano(h).includes("El precio subió 11,4 %"), plano(h));
  assert.ok(!h.includes("+11,4 %"), plano(h));
});

test("EL ERP MÁS CARO: +10,0 % EN VERDE EN LA TARJETA Y EN LA HOJA; EL TÍTULO DICE QUE BAJÓ", () => {
  const f = COLON_MAS_BARATO();
  const erp = renglonesDeLaTarjeta(f).erp;
  assert.equal(erp.texto, "+10,0 %");
  assert.equal(erp.tono, "sunmi-text-success");
  assert.ok(erp.variacion < 0, "el precio bajó");

  assert.ok(pintado(tarjetaHtml(f), "sunmi-text-success", "\\+10,0 %"), plano(tarjetaHtml(f)));
  const h = hojaHtml(f);
  assert.ok(pintado(h, "sunmi-text-success", "\\+10,0 %"), plano(h));
  assert.match(plano(h), /El precio bajó \d+,\d %/);
});

test("UN SOLO CÁLCULO: la tarjeta y la hoja piden texto y tono a `renglonesDeLaTarjeta`", () => {
  const tarjeta = leer("./TarjetaLineaFactura.jsx");
  assert.match(tarjeta, /\$\{erp\.tono\}/);
  assert.ok(!/tonoDelPorcentaje/.test(tarjeta), "la tarjeta volvió a elegir el color por su cuenta");
  const hoja = leer("./HojaCorregirLinea.jsx");
  assert.match(hoja, /<PorcentajeDelErp erp=\{erpDeLaTarjeta\} \/>/);
  assert.match(hoja, /erpDeLaTarjeta\?\.variacion/);
  assert.ok(!/tonoDelPorcentaje|erpContraElPapelPct|gananciaDelRenglonPct/.test(hoja), "la hoja hace su propia cuenta");
});
