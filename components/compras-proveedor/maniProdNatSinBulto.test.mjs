// UN PRODUCTO SIN BULTO NO TIENE ESCALA QUE ADIVINAR: SE AVISA LA DIFERENCIA,
// CON LAS DOS OPCIONES.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/maniProdNatSinBulto.test.mjs
//
// ── EL CASO, DE PRODUCCIÓN (Emanuel, 2026-11-05) ─────────────────────────
//
// Boleta de Prod Nat: "MANI C/ CASCARA BOLSA x 400 GRS", 8 UN a $2.312,50,
// importe $18.500. El producto es MANI CASCARA 400G, por unidad y sin pack, a
// $5.000 la bolsa —Emanuel confirma que ése es su costo—. La tarjeta decía "No
// se puede saber en qué viene: revisá la cantidad" y no ofrecía nada.
//
// $5.000 ÷ $2.312,50 = 2,16, cerca de 2, y `loQueNoCuadra` lo tomaba por una
// escala. Pero sin pack hay una sola lectura: bolsa contra bolsa, −54 %. Y la
// regla de bajas (`SOSPECHA_LECTURA`, más del 15 %) además bloqueaba aceptar.
//
// Regla de Emanuel: que avise, pero con opciones. La diferencia real y las dos
// opciones de siempre —usar el precio del papel o dejar el del ERP—, en la
// misma hoja. El cartel queda para productos con bulto donde ninguna lectura
// explica el precio.
//
// La fila sale por el camino de la conciliación —`analizarPrecioDeLinea` y
// `filasDeConciliacion`—, como en `picnicSaltoDePrecio.test.mjs`. De la ficha
// del producto el caso da que va por unidad, sin pack, a $5.000; el resto de
// los campos es ilustrativo.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { ACCION_PRECIO, MOTIVO_NO_ACEPTAR, puedeAceptarse } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";
import { formatearMoneda } from "@/lib/moneda";
// El cartel que frenaba, borrado el 2026-11-07. Se sigue afirmando que no aparece.
const AVISO_ESCALA = "No se puede saber en qué viene: revisá la cantidad.";
import {
  TEXTO_ELEGI_EN_QUE_VIENE,
  loQueNoCuadra,
  productoSinBulto,
  saltoDePrecioAceptable,
  saltoSinBultoConOpciones,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

const aLaVista = (el) => renderToStaticMarkup(el).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const literal = (s) => s.replace(/[$.*+?()[\]{}|\\^]/g, "\\$&");

const MANI = { precio_costo: 5000, factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "BULTO" };
const DETALLE_MANI = { id: 9101, cantidad: 8, precioCosto: 5000, unidad: "UNIDAD", productoBaseId: 601, factorPack: 1 };
const RENGLON_MANI = {
  orden: 1, textoCrudo: "MANI C/ CASCARA BOLSA x 400 GRS", cantidad: 8, netoUnitario: 2312.5,
  subtotalImpreso: 18500, costoFinalRenglon: 18500, enQueViene: "unidad",
};

/** La contraprueba: pack de 12 a $38.400 y un papel que cobra $1.600 lo facturado. */
const PACK12 = { precio_costo: 38400, factor_pack: 12, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
const DETALLE_PACK = { id: 9102, cantidad: 10, precioCosto: 38400, unidad: "BULTO", productoBaseId: 602, factorPack: 12 };
const RENGLON_PACK = {
  orden: 1, textoCrudo: "GASEOSA COLA", cantidad: 10, netoUnitario: 1600, subtotalImpreso: 16000, costoFinalRenglon: 16000, enQueViene: null,
};

function filaDe({ linea, producto, detalle }) {
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Prod Nat" } });
  const det = { ...detalle, costoMaestroHoy: producto.precio_costo };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 71, estado: "CARGADO", lineas: [{ ...linea, id: 801, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, costoMaestroHoy: producto.precio_costo, variacionNormalPct: 10, producto: "MANI CASCARA 400G" };
}
const mani = () => filaDe({ linea: RENGLON_MANI, producto: MANI, detalle: DETALLE_MANI });
const pack = () => filaDe({ linea: RENGLON_PACK, producto: PACK12, detalle: DETALLE_PACK });

const hojaHtml = (fila) =>
  renderToStaticMarkup(
    React.createElement(HojaCorregirLinea, {
      fila, abierta: true, onCerrar() {}, onGuardar() {}, onCorregirPapel() {}, onAceptarPrecio() {}, onDejarMiPrecio() {},
    })
  );
const aLaVistaHtml = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const marcada = (html, titulo) => {
  const boton = html.split("<button").find((b) => b.includes(`>${titulo}<`));
  assert.ok(boton, `no está la opción «${titulo}»`);
  return /aria-pressed="true"/.test(boton.slice(0, boton.indexOf(">")));
};
const tarjeta = (fila) => renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila }));

test("MANÍ DE PROD NAT: sin pack, 8 × $2.312,50 contra $5.000 es una baja de PRECIO, no una escala", () => {
  const f = mani();
  assert.equal(productoSinBulto(f), true);
  assert.equal(f.costoFactura, 2312.5);
  assert.equal(loQueNoCuadra(f).que, "PRECIO", "antes: ESCALA, por el 2,16 cerca de 2");
  assert.match(loQueNoCuadra(f).texto, /\(54 % menos\)\.$/);
  assert.equal(saltoDePrecioAceptable(f), true);
  assert.equal(saltoSinBultoConOpciones(f), true);
  // La regla de bajas lo clasifica para frenar; sin bulto se ofrece igual.
  assert.equal(f.precio.decision.accion, ACCION_PRECIO.FRENA);
});

test("LA HOJA: «El precio bajó 53,8 %» con las dos opciones de siempre, y viene marcado dejar el tuyo", () => {
  const html = hojaHtml(mani());
  const hoja = aLaVistaHtml(html);
  assert.match(hoja, / El precio bajó 53,8 % /);
  assert.doesNotMatch(hoja, new RegExp(literal(AVISO_ESCALA)));
  assert.match(hoja, new RegExp(literal(`Pasa a ser tu costo: ${formatearMoneda(2312.5)}. El margen se recalcula.`)));
  // Lo que entra lo carga un efecto que el render estático no corre: como en
  // el candado de PICNIC, se afirma la parte del costo.
  assert.match(hoja, new RegExp(literal(`y tu costo queda en ${formatearMoneda(5000)}.`)));
  assert.doesNotMatch(hoja, /tu costo no se toca/);
  assert.equal(marcada(html, "Aceptar el precio nuevo"), false);
  assert.equal(marcada(html, "Dejar el que tenía"), true, "el ERP es el más alto");
});

test("LA TARJETA: sin el cartel de escala, con la diferencia en el renglón del ERP", () => {
  const html = tarjeta(mani());
  assert.doesNotMatch(aLaVistaHtml(html), new RegExp(literal(AVISO_ESCALA)));
  // El ERP contra el papel (regla del 2026-10-26, vuelta el 2026-11-10): el
  // ERP está 53,8 % arriba del papel, positivo y verde. Del 06/11 al 09/11
  // decía "−53,8 %".
  assert.match(html, /sunmi-text-success">\+53,8 %</, "el ERP más caro que el papel: positivo y verde");
  assert.match(html, /sunmi-state-warning/);
});

test("EL SERVIDOR acepta el precio del papel con el freno levantado, y sin levantarlo sigue rechazando", () => {
  const f = mani();
  const base = { linea: {}, productoBaseId: 601, lineaDePedidoId: 9101, comprobante: { estado: "CARGADO" }, decision: f.precio.decision, unidad: f.unidad };
  assert.deepEqual(puedeAceptarse({ ...base, frenoLevantado: saltoSinBultoConOpciones(f) }), { ok: true });
  assert.deepEqual(puedeAceptarse(base), { ok: false, motivo: MOTIVO_NO_ACEPTAR.SALTO_BRUSCO });
});

test("CONTRAPRUEBA: un pack de 12 donde ninguna lectura gana clara se pregunta, sin freno y sin opciones de precio", () => {
  // $1.600 lo facturado contra el pack de 12 a $38.400: por unidad −50 %, por
  // el bulto −96 %. La segunda no le saca el triple a la primera: no hay
  // ganadora (Emanuel, 2026-11-07) y se pregunta en qué viene. Hasta ese día
  // frenaba con "No se puede saber en qué viene: revisá la cantidad.".
  const f = pack();
  assert.equal(f.unidad.requiereDecision, true);
  assert.equal(productoSinBulto(f), false);
  assert.equal(loQueNoCuadra(f).que, "ELEGIR");
  assert.equal(saltoDePrecioAceptable(f), false);
  assert.equal(saltoSinBultoConOpciones(f), false);
  assert.match(aLaVistaHtml(tarjeta(f)), new RegExp(literal(TEXTO_ELEGI_EN_QUE_VIENE)));
  assert.doesNotMatch(aLaVistaHtml(tarjeta(f)), /No se puede saber en qué viene/);
  assert.doesNotMatch(aLaVista(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {} })), /Aceptar el precio nuevo/);
});
