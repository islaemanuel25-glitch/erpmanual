// GANA LA LECTURA QUE DEJA MENOS DIFERENCIA CONTRA SU COSTO.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/colonTintoDulce.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-07) ─────────────────────────────────────────
//
//   "COLON SELECTO TINTO DULCE"   1 × $ 44.543,90
//
// La ficha tiene pack de 6 a $ 40.000 ($ 6.666,67 la unidad). La tarjeta decía
// "No se puede saber en qué viene: revisá la cantidad.", "Factura 1 PACK x6",
// "Papel $44.543,90 / u" y "ERP $6.666,67 / u". El freno salía de
// `vecesEntero`: 44.543,90 ÷ 6.666,67 = 6,68, que se redondeaba a 7 y no daba
// el bulto.
//
// La regla: se calculan las lecturas candidatas —por unidad, el bulto de la
// ficha y el pack que dice el papel—, cada una con su diferencia contra el
// costo por unidad. Gana la de menor diferencia si es la única dentro de la
// variación del proveedor, o si la siguiente le saca el triple. Si no hay
// ganadora clara, se pregunta en Corregir con las lecturas y sus cuentas.
//
// Colon: pack de 6 da $ 7.423,98 la unidad, +11,4 %; por unidad, +568 %. Gana
// el pack de 6 (568 ≥ 3 × 11,4), fuera de la variación: salto de precio con
// "Aceptar el precio nuevo" / "Dejar el que tenía", sin pregunta y sin cartel.
//
// Las filas salen por el camino de la pantalla: `analizarPrecioDeLinea` y
// `filasDeConciliacion`. Mortadela, Schneider, Crema Verona y Marlboro Fuxi
// tienen sus candados propios y siguen como estaban.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { renglonesDeLaTarjeta } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { UNIDAD, deducirUnidad, elegirLectura } from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";
import {
  TITULO_PREGUNTA_LECTURA,
  lecturaRecordadaDeLaEleccion,
  preguntaDeLectura,
  unidadElegidaDeLaLectura,
  unidadesDeLaLecturaRecordada,
} from "@/lib/compras-proveedor/comprobante/preguntaDeLectura";
import {
  ESTADO_LINEA,
  TEXTO_ELEGI_EN_QUE_VIENE,
  estadoDeLinea,
  hayDiferenciaDePrecio,
  loQueNoCuadra,
  saltoDePrecioAceptable,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

// Sin comentarios: un candado que busca texto encuentra la prosa (regla 5).
const leer = (ruta) =>
  readFileSync(new URL(ruta, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const AVISO_BORRADO = "No se puede saber en qué viene";
const PACK_COLON = "$44.543,90 el pack de 6 · $7.423,98 la unidad";

const ficha = (costo, factor) => ({ precio_costo: costo, factor_pack: factor, unidad_medida: "pack", modoCompraProveedor: "BULTO" });
const COLON = ficha(40000, 6);
const SEVEN_UP = ficha(24000, 24);
const PARECIDAS = ficha(3000, 2);

function fila({ texto, cantidad, unitario, producto, detalle, unidadElegida = null }) {
  const linea = { orden: 1, textoCrudo: texto, cantidad, netoUnitario: unitario, subtotalImpreso: cantidad * unitario, costoFinalRenglon: cantidad * unitario, enQueViene: null, unidadElegida };
  // Como lo pasa `analisisDeComprobante`: `unidadElegida: l.unidadElegida ?? undefined`.
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Bebidas" }, unidadElegida: unidadElegida ?? undefined, variacionPct: 10 });
  const det = { id: 7101, costoMaestroHoy: producto.precio_costo, productoBaseId: 901, factorPack: producto.factor_pack, cantidadRecibida: null, ...detalle };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 81, estado: "CARGADO", lineas: [{ ...linea, id: 810, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, variacionNormalPct: 10 };
}

const COLON_BULTO = () => fila({ texto: "COLON SELECTO TINTO DULCE", cantidad: 1, unitario: 44543.9, producto: COLON, detalle: { cantidad: 1, unidad: "BULTO", precioCosto: 40000 } });
const COLON_UNIDAD = () => fila({ texto: "COLON SELECTO TINTO DULCE", cantidad: 1, unitario: 44543.9, producto: COLON, detalle: { cantidad: 6, unidad: "UNIDAD", precioCosto: 6666.67 } });
const SIETE = () => fila({ texto: "3838299291 - 7UP LATA X 6", cantidad: 8, unitario: 5900, producto: SEVEN_UP, detalle: { cantidad: 2, unidad: "BULTO", precioCosto: 24000 } });
// $ 1.000 contra $ 1.500 la unidad: por unidad −33,3 %, por el bulto de 2
// −66,7 %. Ninguna dentro del 10 % y la segunda a menos del triple.
const DOS_PARECIDAS = (unidadElegida = null) =>
  fila({ texto: "VINO TINTO", cantidad: 1, unitario: 1000, producto: PARECIDAS, detalle: { cantidad: 1, unidad: "BULTO", precioCosto: 3000 }, unidadElegida });

const plano = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const tarjeta = (f) => plano(renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: f })));
const hojaHtml = (f) => renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {}, onElegirLectura() {} }));

// ── LA REGLA ────────────────────────────────────────────────────────────────

test("elegirLectura: GANA LA MENOR SI LA SEGUNDA LE SACA EL TRIPLE", () => {
  const r = elegirLectura({ precioPorFacturado: 44543.9, costoPorUnidad: 40000 / 6, candidatos: [1, 6], variacionPct: 10 });
  assert.equal(r.ganadora?.unidadesPorFacturada, 6);
  assert.deepEqual(r.lecturas.map((l) => l.unidadesPorFacturada), [6, 1]);
  assert.equal(r.lecturas[0].diferenciaPct.toFixed(1), "11.4");
});

test("elegirLectura: GANA LA ÚNICA DENTRO DE LA VARIACIÓN AUNQUE LA SEGUNDA NO LLEGUE AL TRIPLE", () => {
  // Por unidad +8 % (dentro del 10 %), por el bulto de 2 −46 %: 46 < 3 × 8 no,
  // pero es la única dentro.
  const r = elegirLectura({ precioPorFacturado: 1080, costoPorUnidad: 1000, candidatos: [1, 2], variacionPct: 10 });
  assert.equal(r.ganadora?.unidadesPorFacturada, 1);
  // Las dos dentro de la variación y a menos del triple: no hay ganadora.
  const dos = elegirLectura({ precioPorFacturado: 1000, costoPorUnidad: 1000, candidatos: [1], variacionPct: 10 });
  assert.equal(dos.ganadora?.unidadesPorFacturada, 1);
  const empate = elegirLectura({ precioPorFacturado: 1000, costoPorUnidad: 1500, candidatos: [1, 2], variacionPct: 10 });
  assert.equal(empate.ganadora, null);
});

test("elegirLectura: SIN DUPLICADOS NI ENTEROS INVENTADOS", () => {
  const r = elegirLectura({ precioPorFacturado: 44543.9, costoPorUnidad: 40000 / 6, candidatos: [1, 6, 6, null, 1], variacionPct: 10 });
  assert.deepEqual(r.lecturas.map((l) => l.unidadesPorFacturada).sort((a, b) => a - b), [1, 6]);
});

// ── COLON ──────────────────────────────────────────────────────────────────

test("COLON (pedido por BULTO): GANA EL PACK DE 6, +11,4 %, SIN PREGUNTA Y SIN CARTEL", () => {
  const f = COLON_BULTO();
  assert.equal(f.unidad.unidad, UNIDAD.POR_BULTO);
  assert.equal(f.unidad.unidadesPorFacturada, 6);
  assert.notEqual(f.unidad.requiereDecision, true);
  assert.equal(preguntaDeLectura(f), null);
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.PRECIO_DISTINTO);
  assert.equal(hayDiferenciaDePrecio(f), true);
  assert.equal(renglonesDeLaTarjeta(f).erp.texto, "+11,4 %");
  const t = tarjeta(f);
  assert.ok(!t.includes(AVISO_BORRADO), t);
  assert.ok(!t.includes(TEXTO_ELEGI_EN_QUE_VIENE), t);
  assert.ok(t.includes(PACK_COLON), t);
  assert.ok(!t.includes("44.543,90 / u"), t);
});

test("COLON (pedido por UNIDAD): SALTO DE PRECIO +11,4 % CON «ACEPTAR» / «DEJAR EL QUE TENÍA», SIN PREGUNTA", () => {
  const f = COLON_UNIDAD();
  assert.equal(f.unidad.unidadesPorFacturada, 6);
  assert.notEqual(f.unidad.requiereDecision, true);
  assert.equal(loQueNoCuadra(f)?.que, "PRECIO");
  assert.equal(saltoDePrecioAceptable(f), true);
  assert.equal(renglonesDeLaTarjeta(f).erp.texto, "+11,4 %");
  const t = tarjeta(f);
  assert.ok(!t.includes(AVISO_BORRADO), t);
  assert.ok(t.includes(PACK_COLON), t);
  assert.ok(!t.includes("44.543,90 / u"), t);
  const h = plano(hojaHtml(f));
  assert.ok(h.includes("Aceptar el precio nuevo"), h);
  assert.ok(h.includes("Dejar el que tenía"), h);
  assert.ok(!h.includes(TITULO_PREGUNTA_LECTURA), h);
  assert.ok(!h.includes(AVISO_BORRADO), h);
  assert.ok(h.includes(PACK_COLON), h);
  assert.ok(!h.includes("44.543,90 / u"), h);
});

// ── 7UP X 6 CONTRA LA FICHA x24 ─────────────────────────────────────────────

test("7UP LATA X 6 CONTRA FICHA x24: GANA EL PACK DE 6 DEL PAPEL, −1,7 %, «COINCIDE»", () => {
  const f = SIETE();
  assert.equal(f.unidad.unidad, UNIDAD.POR_PRESENTACION);
  assert.equal(f.unidad.unidadesPorFacturada, 6);
  assert.deepEqual(f.unidad.lecturasCandidatas.map((l) => l.unidadesPorFacturada), [6, 24, 1]);
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.COINCIDE);
  assert.equal(renglonesDeLaTarjeta(f).erp.texto, "−1,7 %");
  assert.equal(renglonesDeLaTarjeta(f).papel.pack.texto, "$5.900,00 el pack de 6 · $983,33 la unidad");
});

// ── DOS LECTURAS PARECIDAS: SE PREGUNTA ─────────────────────────────────────

test("DOS LECTURAS PARECIDAS (LA SEGUNDA A MENOS DEL TRIPLE): PREGUNTA, NO FRENA", () => {
  const f = DOS_PARECIDAS();
  assert.equal(f.unidad.requiereDecision, true);
  assert.equal(loQueNoCuadra(f)?.que, "ELEGIR");
  const t = tarjeta(f);
  assert.ok(t.includes(TEXTO_ELEGI_EN_QUE_VIENE), t);
  assert.ok(!t.includes(AVISO_BORRADO), t);

  const p = preguntaDeLectura(f);
  assert.equal(p.titulo, TITULO_PREGUNTA_LECTURA);
  assert.deepEqual(
    p.opciones.map((o) => [o.valor, o.texto, o.cuenta]),
    [
      ["POR_UNIDAD", "Por unidad", "$1.000,00 la unidad · −33,3 % contra tu costo"],
      ["POR_BULTO", "Por el pack de 2", "$500,00 la unidad · −66,7 % contra tu costo"],
    ],
  );

  const html = hojaHtml(f);
  const h = plano(html);
  assert.ok(h.includes(TITULO_PREGUNTA_LECTURA), h);
  assert.ok(h.includes("$1.000,00 la unidad · −33,3 % contra tu costo"), h);
  assert.ok(h.includes("$500,00 la unidad · −66,7 % contra tu costo"), h);
  // La pieza del kit, con ninguna elegida.
  const radios = html.match(/role="radio"[^>]*aria-checked="(true|false)"/g) ?? [];
  assert.ok(radios.length >= 2, html);
  assert.ok(!/role="radio"[^>]*aria-checked="true"/.test(html), "ninguna lectura arranca elegida");
});

test("LO ELEGIDO EN LA PREGUNTA SE APLICA AL RENGLÓN: POR_UNIDAD, POR_BULTO Y PACK_k", () => {
  assert.equal(DOS_PARECIDAS("POR_UNIDAD").unidad.unidadesPorFacturada, 1);
  assert.equal(DOS_PARECIDAS("POR_BULTO").unidad.unidadesPorFacturada, 2);
  const f = fila({ texto: "COLON SELECTO TINTO DULCE", cantidad: 1, unitario: 44543.9, producto: ficha(80000, 12), detalle: { cantidad: 1, unidad: "BULTO", precioCosto: 80000 }, unidadElegida: "PACK_6" });
  assert.equal(f.unidad.unidad, UNIDAD.POR_PRESENTACION);
  assert.equal(f.unidad.unidadesPorFacturada, 6);
  assert.equal(unidadElegidaDeLaLectura(6, 12), "PACK_6");
  assert.equal(unidadElegidaDeLaLectura(1, 12), "POR_UNIDAD");
  assert.equal(unidadElegidaDeLaLectura(12, 12), "POR_BULTO");
});

test("LO ELEGIDO SE RECUERDA POR PRODUCTO Y PROVEEDOR, CON EL MECANISMO DEL ALTA", () => {
  const caja = lecturaRecordadaDeLaEleccion({ k: 6, factor: 6 });
  const unidad = lecturaRecordadaDeLaEleccion({ k: 1, factor: 6 });
  assert.equal(unidadesDeLaLecturaRecordada(caja, 6), 6);
  assert.equal(unidadesDeLaLecturaRecordada(unidad, 6), 1);
  const ruta = leer("../../app/api/compras-proveedor/recepcion/correccion/route.js");
  assert.match(ruta, /lecturaRecordadaDeLaEleccion\(/);
  assert.match(ruta, /lecturaProductoProveedor\.upsert\(/);
  const analisis = leer("../../lib/compras-proveedor/comprobante/analisisDeComprobante.js");
  assert.match(analisis, /unidadesDeLaLecturaRecordada\(/);
});

// ── LO QUE NO CAMBIA ───────────────────────────────────────────────────────

test("EL CIERRE SIGUE CON LA REGLA DE ANTES: SIN `menorDiferencia` NO ELIGE POR CERCANÍA", () => {
  const caso = { costoAnteriorFinal: 40000, precioFacturaFinal: 44543.9, factorPack: 6, descripcion: "COLON SELECTO TINTO DULCE" };
  const sinBandera = deducirUnidad(caso);
  assert.equal(sinBandera.lecturasCandidatas, undefined);
  const conBandera = deducirUnidad({ ...caso, menorDiferencia: true, variacionPct: 10 });
  assert.equal(conBandera.unidadesPorFacturada, 6);
  assert.ok(Array.isArray(conBandera.lecturasCandidatas));
});

test("ACEPTAR EL PRECIO ESCRIBE LA LÍNEA DEL PEDIDO EN LA UNIDAD DE LA LÍNEA", () => {
  const ruta = leer("../../app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(ruta, /costoParaUnidad\(\{ costoMaestro: precioAEscribir, unidad: detalle\.unidad/);
  assert.match(ruta, /variacionPct: variacionDelProveedor/);
});

test("EL CARTEL «NO SE PUEDE SABER EN QUÉ VIENE» NO QUEDA EN NINGÚN LADO DEL CÓDIGO", () => {
  for (const r of ["../../lib/compras-proveedor/estadoDeLineaFacturada.js", "./TarjetaLineaFactura.jsx", "./HojaCorregirLinea.jsx"]) {
    assert.ok(!leer(r).includes(AVISO_BORRADO), r);
  }
});
