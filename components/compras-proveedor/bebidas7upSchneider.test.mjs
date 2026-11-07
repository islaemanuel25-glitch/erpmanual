// LA RECEPCIÓN LEE CUÁNTAS TRAE CADA RENGLÓN SEGÚN EL PROPIO PAPEL.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/bebidas7upSchneider.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-07, recepción real de bebidas) ──────────────
//
//   "3838299291 - 7UP LATA X 6"              8 × $ 5.900  = $ 47.200
//   "2737378282828 - SCHNEIDER 710 cc x 24"  5 × $ 52.500 = $ 262.500
//   "35567776655 - Brahma 473 cc x 24"       3 × $ 39.800
//
// SEVEN UP LATA 354ML x24 está a $ 1.000 la unidad. El 7UP decía "No se puede
// saber en qué viene", "Factura 8 u", "Papel $5.900,00 / u": el precio deja
// dos packs del bulto de 24 —de 6 y de 8— y el "X 6" del papel, que dice cuál,
// no se leía. Lo correcto: 5.900 ÷ 6 = 983,33 la unidad, −1,7 %; 8 × 6 = 48 =
// 2 bultos de 24.
//
// Schneider quedó atado a "361 LATA X24" ($ 24.500 el pack). Decía el mismo
// cartel y "Papel $52.500,00 / u", un precio de pack rotulado como unidad. Con
// los 24 del papel: 2.187,50 la unidad contra 1.020,83, +114 %. No es la
// cantidad: es otro producto, y el cartel lo dice y manda a "Cambiar".
//
// Las filas salen por el camino de la pantalla: `analizarPrecioDeLinea` y
// `filasDeConciliacion`. El costo del ERP es el pack, como lo guarda la ficha.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea, { precioDeLaUnidad } from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { renglonesDeLaTarjeta } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { UNIDAD } from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";
import { cantidadPorCajaEnNombre } from "@/lib/proveedores/listas/lectura/numeroDeLista";
import { buscarCandidatos } from "@/lib/compras-proveedor/comprobante/vinculo";
import { esCodigoDeBarras } from "@/lib/proveedores/listas/conciliarLista";
// El cartel que frenaba, borrado el 2026-11-07 (Colon tinto dulce: gana la
// lectura que deja menos diferencia). Se sigue afirmando que no aparece.
const AVISO_ESCALA = "No se puede saber en qué viene: revisá la cantidad.";
import {
  ESTADO_LINEA,
  cuantoEntroAlAbrir,
  estadoDeLinea,
  motivoSinComparacion,
  saltoDePrecioAceptable,
  unidadesFisicasEsperadas,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

const pack24 = (costo) => ({ precio_costo: costo, factor_pack: 24, unidad_medida: "pack", modoCompraProveedor: "BULTO" });
const SEVEN_UP = pack24(24000);
const LATA_361 = pack24(24500);
const BRAHMA = pack24(39800);

function fila({ texto, cantidad, unitario, producto, pedidos = cantidad, unidadPedido = "BULTO", precioPedido = producto.precio_costo }) {
  const linea = { orden: 1, textoCrudo: texto, cantidad, netoUnitario: unitario, subtotalImpreso: cantidad * unitario, costoFinalRenglon: cantidad * unitario, enQueViene: null };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Colombres" } });
  const det = { id: 7001, cantidad: pedidos, unidad: unidadPedido, precioCosto: precioPedido, costoMaestroHoy: producto.precio_costo, productoBaseId: 900, factorPack: 24, cantidadRecibida: null };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 80, estado: "CARGADO", lineas: [{ ...linea, id: 800, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, variacionNormalPct: 10 };
}

const SIETE = () => fila({ texto: "3838299291 - 7UP LATA X 6", cantidad: 8, unitario: 5900, producto: SEVEN_UP, pedidos: 2 });
const SCHNEIDER = () => fila({ texto: "2737378282828 - SCHNEIDER 710 cc x 24", cantidad: 5, unitario: 52500, producto: LATA_361 });
const BRAHMA_3 = () => fila({ texto: "35567776655 - Brahma 473 cc x 24", cantidad: 3, unitario: 39800, producto: BRAHMA });

const tarjeta = (f) => renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: f })).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const hoja = (f) =>
  renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {} }))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

test("LO QUE DICE EL NOMBRE: «X 6», «x 24»; «precio x2» no es un pack y «473 x 24» son 24", () => {
  assert.equal(cantidadPorCajaEnNombre("3838299291 - 7UP LATA X 6"), 6);
  assert.equal(cantidadPorCajaEnNombre("2737378282828 - SCHNEIDER 710 cc x 24"), 24);
  assert.equal(cantidadPorCajaEnNombre("2837737282828 - 361 473 x 24"), 24);
  assert.equal(cantidadPorCajaEnNombre("chandon precio x2 15400"), null);
  assert.equal(cantidadPorCajaEnNombre("MORTADELA X 4.5 KG"), null);
  assert.equal(cantidadPorCajaEnNombre("AGUA BAGGIO VIDA MANZANA 6 X 1500"), 6);
});

test("7UP LATA X 6: PACK DE 6, −1,7 % POR UNIDAD, SIN CARTEL, «8 PACK x6»", () => {
  const f = SIETE();
  assert.equal(f.unidad.unidad, UNIDAD.POR_PRESENTACION);
  assert.equal(f.unidad.unidadesPorFacturada, 6, "el papel dice 6 por pack y el precio lo confirma");
  assert.equal(motivoSinComparacion(f), null, "decía «No se puede saber en qué viene»");
  const r = renglonesDeLaTarjeta(f);
  assert.equal(r.cantidad, "8 PACK x6", "decía «8 u»");
  assert.equal(r.papel.unidad, "u");
  assert.equal(Math.round(r.papel.importe * 100) / 100, 983.33, "5.900 ÷ 6");
  assert.equal(r.erp.importe, 1000);
  assert.equal(r.erp.texto, "−1,7 %");
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.COINCIDE);
  const t = tarjeta(f);
  assert.doesNotMatch(t, new RegExp(AVISO_ESCALA));
  assert.doesNotMatch(t, /5\.900,00 \/ u/, "un precio de pack rotulado como unidad");
});

test("7UP: 8 × 6 = 48 UNIDADES, Y «CUÁNTO ENTRÓ» ARRANCA EN 2 BULTOS DE 24 Y 0 SUELTAS", () => {
  const f = SIETE();
  assert.equal(unidadesFisicasEsperadas(f), 48);
  const c = cuantoEntroAlAbrir(f);
  assert.equal(c.completos, 2);
  assert.equal(c.sueltas, 0);
});

test("SCHNEIDER CONTRA 361: EL CARTEL DICE QUE PUEDE SER OTRO PRODUCTO, NO «REVISÁ LA CANTIDAD»", () => {
  const f = SCHNEIDER();
  const motivo = motivoSinComparacion(f);
  assert.notEqual(motivo, AVISO_ESCALA);
  assert.doesNotMatch(motivo, /revisá la cantidad/i);
  assert.match(motivo, /^El precio no se parece al de este producto: el papel cobra \$2\.187,50 la unidad \(vienen de a 24\) y vos la tenés a \$1\.020,83 \(114 % más\)\. Revisá si es el producto correcto; si no, tocá «Cambiar»\.$/);
  const r = renglonesDeLaTarjeta(f);
  assert.equal(r.papel.unidad, "u");
  assert.equal(r.papel.importe, 2187.5, "decía $ 52.500 «/ u»: era el pack");
  // Un aumento real se sigue pudiendo aceptar, como cualquier salto.
  assert.equal(saltoDePrecioAceptable(f), true);
  // En la tarjeta, el cartel a la vista.
  assert.match(tarjeta(f), /El precio no se parece al de este producto/);
  // Y en Corregir: el mismo cartel, el precio de la unidad, y «Cambiar».
  const h = hoja(f);
  assert.match(h, /El precio no se parece al de este producto/);
  assert.match(h, /2\.187,50/);
  assert.doesNotMatch(h, /52\.500,00 \/ u/);
  assert.match(h, / Cambiar /);
});

// ── POR QUÉ SCHNEIDER QUEDÓ ATADO A 361 ───────────────────────────────────
//
// Por la escalera de terminación de código (`buscarCandidatos` con
// `permitirCodigoAproximado`, encendida en la recepción por Arcor el
// 2026-09-22): el vínculo del proveedor con 361 guarda 2837737282828, el papel
// de Schneider trae 2737378282828, y los dos terminan en "282828". Seis de
// trece dígitos, y la escalera vinculaba sola con cuatro. Desde la precisión
// de Emanuel (2026-11-07): la terminación vale para los códigos INTERNOS
// (Arcor: 1999 contra 1001999, sigue vinculando); un código de barras coincide
// entero o es otro producto, y la terminación solo lo sugiere.
const VINCULO_361 = { id: 1, productoBaseId: 361, codigoInterno: "2837737282828", descripcionProveedor: "361 473 x 24", activo: true, nombre: "361 LATA X24" };

test("SCHNEIDER NO SE VINCULA SOLO A 361 POR COMPARTIR LA TERMINACIÓN DEL CÓDIGO: QUEDA COMO SUGERENCIA", () => {
  const r = buscarCandidatos({
    linea: { codigoProveedor: "2737378282828", descripcion: "SCHNEIDER 710 cc x 24" },
    vinculos: [VINCULO_361],
    universoProveedor: [{ productoBaseId: 361, nombre: "361 LATA X24" }],
    permitirCodigoAproximado: true,
  });
  assert.equal(r.vinculoAutomatico, null, "Schneider se ató solo a 361 por «282828»");
  assert.equal(r.candidatos[0]?.productoBaseId, 361, "se sugiere, para que alguien elija");
  assert.equal(esCodigoDeBarras("2737378282828"), true, "13 dígitos: un código de barras coincide entero o es otro producto");
});

test("CONTRAPRUEBA: EL CÓDIGO ENTERO CON UN PREFIJO (ARCOR, 1999 CONTRA 1001999) SIGUE VINCULANDO SOLO", () => {
  const r = buscarCandidatos({
    linea: { codigoProveedor: "1999", descripcion: "TEXTO CUALQUIERA" },
    vinculos: [{ id: 2, productoBaseId: 5, codigoInterno: "1001999", descripcionProveedor: null, activo: true, nombre: "BON O BON" }],
    permitirCodigoAproximado: true,
  });
  assert.equal(r.vinculoAutomatico?.productoBaseId, 5);
});

test("BRAHMA 473 cc x 24 SIGUE «COINCIDE»", () => {
  const f = BRAHMA_3();
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.COINCIDE);
  assert.equal(motivoSinComparacion(f), null);
  assert.equal(renglonesDeLaTarjeta(f).cantidad, "3 PACK x24");
});

// ── COLOMBRES, DESPUÉS DE 8da36311 (Emanuel, 2026-11-07) ──────────────────
//
// El mismo "7UP LATA X 6", 8 × $ 5.900, sobre un pedido cargado por UNIDAD a
// $ 1.000. La cuenta salía bien (2 bultos de 24, "El precio bajó 1,7 %") y
// quedaban tres textos mal en Corregir: el aviso de producto equivocado sobre
// un −1,7 %, "La factura dice 2" y "Precio de la unidad: $5.900,00".
const COLOMBRES = () =>
  fila({ texto: "3838299291 - 7UP LATA X 6", cantidad: 8, unitario: 5900, producto: SEVEN_UP, pedidos: 48, unidadPedido: "UNIDAD", precioPedido: 1000 });
const hojaConPapel = (f) =>
  renderToStaticMarkup(
    React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {}, onCorregirPapel() {} })
  )
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

test("COLOMBRES 7UP (−1,7 %): SIN EL AVISO DE PRODUCTO EQUIVOCADO, NI EN LA TARJETA NI EN CORREGIR", () => {
  const f = COLOMBRES();
  assert.doesNotMatch(motivoSinComparacion(f) ?? "", /no se parece al de este producto/);
  assert.doesNotMatch(tarjeta(f), /no se parece al de este producto/);
  const h = hoja(f);
  assert.doesNotMatch(h, /no se parece al de este producto/, "un −1,7 % es una variación común");
  assert.match(h, /El precio bajó 1,7 %/);
  // Y Schneider, a +114 %, lo sigue teniendo (ver arriba).
  assert.match(motivoSinComparacion(SCHNEIDER()), /^El precio no se parece al de este producto/);
});

test("COLOMBRES 7UP: «LA FACTURA DICE 8 PACKS DE 6 = 2 BULTOS DE 24», NO «LA FACTURA DICE 2»", () => {
  const h = hoja(COLOMBRES());
  assert.match(h, /la factura dice 8 packs de 6 = 2 bultos de 24/i);
  assert.doesNotMatch(h, /la factura dice 2\b/i);
  assert.doesNotMatch(h, /lo trae por pack de 6: 8 packs = 2 bultos de 24/, "la misma cuenta dicha dos veces");
  // Sin pack del papel, como siempre: Brahma dice sus 3.
  assert.match(hoja(BRAHMA_3()), /la factura dice 3\b/i);
});

test("COLOMBRES 7UP: «PRECIO DEL PACK DE 6: $5.900,00 · LA UNIDAD $983,33»; SIN PACK, «PRECIO DE LA UNIDAD»", () => {
  assert.equal(precioDeLaUnidad("8", "47200", 6), "Precio del pack de 6: $5.900,00 · la unidad $983,33");
  assert.equal(precioDeLaUnidad("3", "119400", null), "Precio de la unidad: $39.800,00");
  // En la hoja, el bloque «Lo que dice el papel» del 7UP rotula el pack.
  const h = hojaConPapel(COLOMBRES());
  assert.match(h, /Lo que dice el papel/);
  assert.match(h, /Precio del pack de 6:/);
  assert.doesNotMatch(h, /Precio de la unidad:/);
  // Y en «Tenías… / la factura trae…», la unidad de los dos lados.
  assert.doesNotMatch(h, /5\.900,00 \/ u/);
});
