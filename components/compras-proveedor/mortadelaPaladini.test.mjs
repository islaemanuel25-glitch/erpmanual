// LA MORTADELA PALADINI: "REVISADO Y SEGUIR" NO GUARDABA, EL SIGNO DABA VUELTA
// Y LA HOJA CONTABA UNA DECISIÓN DE OTROS PRECIOS.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/mortadelaPaladini.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-06, roto en producción) ─────────────────────
//
// Compras → Recibir pedido. La factura trae 3 u de Mortadela Paladini a
// $41.330,09 la unidad; el ERP la tiene a $40.000,01 la pieza —$8.888,89 el kilo
// por 4,5 kg—. "Cuánto entró": 3. Se elige "Aceptar el precio nuevo", se toca
// "✓ Revisado y seguir", y no guarda: "No se puede saber en qué viene: revisá la
// cantidad."
//
// ── LA CAUSA ──────────────────────────────────────────────────────────────
//
// La ruta `aceptar-precio` armaba la fila con un select propio que decía ser
// "el mismo de la pantalla" y no lo era: sin `unidad_medida` ni
// `pesoReferenciaKg`, `aplanarDetalles` dejaba el costo del fiambre POR KILO.
// $41.330,09 la pieza contra $8.888,89 el kilo es un 365 % que ninguna escala
// explica, y sin cantidad en la comparación `loQueNoCuadra` contestaba "escala".
// No vino de dfaa59b (que solo agregó con qué arranca "Cuánto entró"): el select
// incompleto es anterior.
//
// Y un segundo agujero del mismo motivo: `loQueNoCuadra` tomaba k = 1 como
// escala dudosa, así que dos precios por unidad a pocos puntos frenaban igual.
// La ambigüedad de escala existe solo si la relación cae cerca de un entero
// k ≥ 2.
//
// La fila sale de las funciones de la pantalla: `aplanarDetalles` sobre la base
// con los campos de `DETALLE_SELECT`, `analizarPrecioDeLinea` y
// `filasDeConciliacion`. La ficha de la base es la de un fiambre de pieza fija
// del depósito, como la describe `esFiambreFijo`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { aplanarDetalles } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { DETALLE_SELECT } from "@/lib/compras-proveedor/comprobante/conciliacionDelPedido";
import { renglonesDeLaTarjeta } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { estados } from "@/lib/unidades/tanda13Arnes.mjs";
import {
  TEXTO_ELEGI_EN_QUE_VIENE,
  escalaSinDeducir,
  hayDiferenciaDePrecio,
  loQueNoCuadra,
  motivoSinComparacion,
  variacionDelPrecioPct,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

const MORTADELA = {
  id: 1500, nombre: "MORTADELA PALADINI", modoCompraProveedor: "UNIDAD", factor_pack: 1, unidad_medida: "kg",
  modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: 4.5, precio_costo: 8888.89,
};

/** Lo que el select de la ruta deja pasar de la base: solo las claves que pide. */
const recortar = (base, select) => Object.fromEntries(Object.keys(select).filter((k) => k in base).map((k) => [k, base[k]]));
const CAMPOS_DE_LA_BASE = DETALLE_SELECT.producto.select.base.select;
// El select que tenía la ruta hasta el 2026-11-06.
const SELECT_VIEJO = { id: true, nombre: true, factor_pack: true };

function fila({ neto = 41330.09, base = recortar(MORTADELA, CAMPOS_DE_LA_BASE), decisionPrecio = null } = {}) {
  const [det] = aplanarDetalles([
    { id: 5001, cantidad: 3, precioCosto: MORTADELA.precio_costo, unidad: "UNIDAD", cantidadRecibida: 3, producto: { id: 9, baseId: 1500, base } },
  ]);
  const linea = { orden: 1, textoCrudo: "MORTADELA PALADINI", cantidad: 3, netoUnitario: neto, subtotalImpreso: 3 * neto, costoFinalRenglon: 3 * neto, enQueViene: "unidad" };
  const precio = analizarPrecioDeLinea({ linea, producto: MORTADELA, proveedor: { nombre: "Paladini" } });
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 80, estado: "CARGADO", lineas: [{ ...linea, id: 900, pedidoDetalleId: 5001, productoLocalId: 9, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio, costoMaestroCatalogo: MORTADELA.precio_costo }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, variacionNormalPct: 10 };
}

const tarjeta = (f) => renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: f }));
const hojaHtml = (f) => renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {} }));
const hoja = (f) =>
  hojaHtml(f)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

// ── PUNTO 1: EL BLOQUEO ─────────────────────────────────────────────────

/** Lo que la ruta arma como `comparacion` antes de cargar la hoja: sin cantidad ni importe. */
const comparacionDeLaRuta = (f) => ({ costoFactura: f.costoFactura, costoCatalogo: f.costoCatalogo, pedidoDetalleId: f.pedidoDetalleId, unidad: f.unidad });

test("LA MORTADELA, COMO LA ARMA LA RUTA AHORA: se compara por pieza y no frena", () => {
  const f = fila();
  assert.ok(Math.abs(f.costoCatalogo - 40000.01) < 0.01, "el costo del ERP, en piezas de 4,5 kg");
  assert.equal(escalaSinDeducir(f), false);
  assert.equal(motivoSinComparacion(f), null, "la hoja: sin «No se puede saber en qué viene»");
  assert.equal(motivoSinComparacion(comparacionDeLaRuta(f)), null, "la guarda de la ruta tampoco frena");
  assert.equal(hayDiferenciaDePrecio(f), true, "se ofrece Aceptar / Dejar");
  assert.equal(renglonesDeLaTarjeta(f).erp.texto, "−3,3 %", "el ERP 3,3 % abajo del papel (2026-11-10)");
});

test("CONTRAPRUEBA: CON EL SELECT VIEJO DE LA RUTA, LA GUARDA FRENA CON EL CARTEL DE PRODUCCIÓN", () => {
  const f = fila({ base: recortar(MORTADELA, SELECT_VIEJO) });
  assert.equal(f.costoCatalogo, 8888.89, "el kilo, comparado contra la pieza");
  assert.equal(escalaSinDeducir(f), true);
  // Sin cantidad ni importe, la guarda de la ruta no puede elegir en qué viene:
  // decía "No se puede saber en qué viene"; desde el 2026-11-07 pide elegir.
  assert.equal(motivoSinComparacion(comparacionDeLaRuta(f)), TEXTO_ELEGI_EN_QUE_VIENE, "la guarda vieja frenaba");
  // Y aun preguntando sobre la fila entera, frena: el arreglo es el select.
  assert.match(motivoSinComparacion(f), /\$8\.888,89 \(365 % más\)/);
});

test("EL SELECT DE LA PANTALLA TRAE LO QUE HACE FALTA PARA PASAR EL KILO A LA PIEZA", () => {
  for (const campo of ["modoCompraProveedor", "unidad_medida", "pesoReferenciaKg", "pesoEsFijo", "modoVentaDeposito", "factor_pack", "precio_costo"]) {
    assert.equal(CAMPOS_DE_LA_BASE[campo], true, `falta ${campo}`);
  }
});

test("LA RUTA DE ACEPTAR PRECIO USA ESE SELECT Y PREGUNTA SOBRE LA FILA DE LA HOJA", () => {
  const fuente = fs
    .readFileSync(new URL("../../app/api/compras-proveedor/comprobantes/aceptar-precio/route.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /pedidoProveedorDetalle\.findMany\(\{\s*where: \{ pedidoId: linea\.comprobante\.pedidoId \},\s*select: DETALLE_SELECT,/);
  assert.match(fuente, /const motivoQueFrena = filaComoLaVeLaHoja != null \? motivoSinComparacion\(filaComoLaVeLaHoja\) : sinComparacion;/);
  assert.match(fuente, /if \(motivoQueFrena && !dejaElMioBajoFreno && !aceptaUnSalto\) \{/);
});

test("DOS PRECIOS POR UNIDAD A POCOS PUNTOS SON UN PRECIO, NO OTRA ESCALA (k = 1)", () => {
  // La fila de la grilla de la tanda 13 (forma real, Arcor #362): pack de 12
  // pedido por unidad, el papel a $3.273,60 contra $3.200,00 la unidad.
  const f = estados()["0|pack12|UNIDAD|3|3|0|null"];
  assert.equal(f.loQueNoCuadra.que, "PRECIO");
  assert.match(f.motivoSinComparacion, /^El papel cobra \$3\.273,60 la unidad y vos la tenés a \$3\.200,00 \(2 % más\)\.$/);
});

// Hasta el 2026-11-07 este renglón frenaba con "No se puede saber en qué
// viene": 10,2 veces la unidad era "otra escala". Con la regla de Emanuel de
// ese día —gana la lectura que deja menos diferencia contra tu costo—, el pack
// de 10 de la ficha deja +2 % y la unidad +920 %: gana el pack, sin cartel.
test("LIVERPOOL, ≈10 VECES LA UNIDAD CON BULTO DE 10: GANA EL PACK DE 10 (+2 %), SIN CARTEL", () => {
  // Liverpool, pack de 10 a $13.200: se pidieron 160 por unidad y el papel
  // factura 16 a $13.464 "por unidad".
  const producto = { precio_costo: 13200, factor_pack: 10, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
  const linea = { orden: 1, textoCrudo: "LIVERPOOL ROJO", cantidad: 16, netoUnitario: 13464, subtotalImpreso: 215424, costoFinalRenglon: 215424, enQueViene: "unidad" };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Proveedor" } });
  const det = { id: 9302, cantidad: 160, precioCosto: 1320, costoMaestroHoy: 13200, unidad: "UNIDAD", productoBaseId: 802, factorPack: 10, cantidadRecibida: null };
  const [f0] = filasDeConciliacion({
    comprobantes: [{ id: 73, estado: "CARGADO", lineas: [{ ...linea, id: 803, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: 13200 }] }],
    detalles: [det],
    nacidoDeFactura: true,
  }).grupos[0].filas;
  const f = { ...f0, variacionNormalPct: 10 };
  assert.equal(f.unidad.unidad, "POR_BULTO", "16 packs de 10");
  assert.equal(loQueNoCuadra(f)?.que, "PRECIO");
  assert.match(motivoSinComparacion(f), /^El papel cobra \$1\.346,40 la unidad y vos la tenés a \$1\.320,00 \(2 % más\)\.$/);
  assert.equal(renglonesDeLaTarjeta(f).erp.texto, "−2,0 %", "el ERP 2 % abajo del papel (2026-11-10)");
});

// ── PUNTO 2: EL SIGNO ───────────────────────────────────────────────────

// La regla de Emanuel del 26/10, vuelta el 2026-11-10: el % del renglón ERP
// es el ERP contra el papel —más barato, "−" y rojo; más caro, "+" y verde—.
// El título de Corregir sigue diciendo cuánto varió el precio. Del 06/11 al
// 09/11 la tarjeta y el «Tenías…» decían el número del título ("+3,3 %").
test("SUBIÓ: −3,3 % EN ROJO EN LA TARJETA Y EN EL «TENÍAS…», Y EL TÍTULO DICE SUBIÓ 3,3 %", () => {
  const f = fila();
  assert.equal(Math.round(variacionDelPrecioPct({ papel: 41330.09, erp: 40000.01 }) * 10) / 10, 3.3);
  assert.match(tarjeta(f), /sunmi-text-danger">−3,3 %</);
  assert.match(hojaHtml(f), /Tenías[\s\S]*?sunmi-text-danger">−3,3 %</, "el «Tenías…» con el mismo número y color");
  const h = hoja(f);
  assert.match(h, / El precio subió 3,3 % /);
  assert.match(h, /Tenías [^%]*−3,3 %/);
  assert.ok(!/\+3,3 %/.test(h), "ningún «+3,3 %» en la hoja");
});

test("BAJÓ: EL ERP QUEDA ARRIBA, «+» Y VERDE; EL TÍTULO DICE BAJÓ", () => {
  const f = fila({ neto: 38000 });
  assert.equal(renglonesDeLaTarjeta(f).erp.texto, "+5,0 %");
  assert.match(tarjeta(f), /sunmi-text-success">\+5,0 %</);
  assert.match(hojaHtml(f), /Tenías[\s\S]*?sunmi-text-success">\+5,0 %</);
  const h = hoja(f);
  assert.match(h, / El precio bajó 5,0 % /);
  assert.match(h, /Tenías [^%]*\+5,0 %/);
  assert.ok(!/−5,0 %/.test(h));
});

// ── PUNTO 3: "ANTES DECIDISTE…" ─────────────────────────────────────────

test("UNA DECISIÓN TOMADA CON OTROS PRECIOS NO SE CUENTA: se pregunta de nuevo, sin los números viejos", () => {
  // La que quedó guardada en producción: con el costo por kilo.
  const vieja = { decision: "DEJA_EL_MIO", precioFacturado: 39741.57, precioPropio: 8888.89, costoMaestroObservado: 8888.89, decididaEn: "2026-11-06T10:00:00.000Z" };
  const h = hoja(fila({ decisionPrecio: vieja }));
  assert.ok(!/Antes decidiste/.test(h));
  assert.ok(!/39\.741,57/.test(h), "el precio facturado de entonces no aparece");
  assert.ok(!/Cambiaron/.test(h));
  assert.match(h, / El precio subió 3,3 % /, "se pregunta de nuevo");
});

test("UNA DECISIÓN QUE SIGUE VALIENDO SE DICE: «Ya decidiste este precio»", () => {
  const vigente = { decision: "DEJA_EL_MIO", precioFacturado: 41330.09, precioPropio: 40000.01, costoMaestroObservado: 8888.89, decididaEn: "2026-11-06T10:00:00.000Z" };
  const h = hoja(fila({ decisionPrecio: vigente }));
  assert.match(h, /Ya decidiste este precio/);
  assert.ok(!/Antes decidiste/.test(h));
});
