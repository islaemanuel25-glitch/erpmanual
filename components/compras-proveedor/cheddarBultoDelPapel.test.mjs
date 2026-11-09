// "ACEPTAR EL PRECIO NUEVO" SE CAÍA CON "FALLA DEL SISTEMA", Y EL CHEDDAR
// DECÍA "54 u, EL PAPEL DICE 3 u".
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/cheddarBultoDelPapel.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-09 08:48, pedido 564) ───────────────────────
//
// Cheddar Feta Tonadita X8uni: la ficha lo tiene POR UNIDAD a $2.020,00 (sin
// bulto: factor 1). La factura de Tonadita, comprobante 77 renglón 884,
// "CHEDDAR 18 X 8 FETAS TONADITA": 3 bultos de 18 = 54 unidades, $109.831,84
// con todo, o sea $36.610,61 el bulto y $2.033,92 la unidad, +0,7 %. La cuenta
// estaba bien. "Aceptar el precio nuevo" contestaba "No se pudo aceptar el
// precio. Fue una falla del sistema".
//
// ── LA CAUSA, DE LOS LOGS ─────────────────────────────────────────────────
//
// "TypeError: Cannot read properties of undefined (reading 'clase')", seis
// veces esa mañana. No era el freno del cierre de la Mortadela: era la ruta de
// aceptar. Desde 298011f8 (2026-11-07) toma el precio de la conciliación, y el
// resumen de precio que la conciliación arma para la pantalla no traía la
// clasificación —ni "en qué viene", que va aparte en el renglón—. Se caía al
// guardarla, adentro de la transacción: no quedó nada escrito (comprobado en la
// base: la línea del pedido en $2.020, el renglón sin costo aceptado, ninguna
// decisión guardada). Se caía con CUALQUIER precio, no solo con éste.
//
// Las filas salen del camino de la pantalla: `aplanarDetalles`,
// `analizarLineas` y `filasDeConciliacion`, con las fichas reales.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { aplanarDetalles, analizarLineas } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { costoMaestroDeLaLectura } from "@/lib/compras-proveedor/lecturaDelCierre";
import { textoDeLaCantidad, textoDelCostoQueQueda } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { costoParaUnidad } from "@/lib/compras-proveedor/importacion/merge";
import { costoDelDepositoEnLaUnidadDelCatalogo } from "@/lib/conversiones/stock";
import {
  bultoDelPapelSinBultoEnLaFicha,
  cuantoEntroAlAbrir,
  hayDiferenciaDePrecio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

const CHEDDAR = {
  id: 164, nombre: "Cheddar Feta Tonadita X8uni", unidad_medida: "unidad", factor_pack: 1,
  modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoEsFijo: false, pesoReferenciaKg: null, precio_costo: 2020,
};
const MORTADELA = {
  id: 2099, nombre: "Mortadela Paladini", unidad_medida: "kg", factor_pack: null,
  modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: 4.5, precio_costo: 8888.89,
};

/** El renglón y la línea del pedido, como están en la base. */
const R_CHEDDAR = {
  id: 884, orden: 1, textoCrudo: "CHEDDAR 18 X 8 FETAS TONADITA", codigoProveedor: null, cantidad: 3,
  netoUnitario: 2392.85, subtotalImpreso: 109831.84, costoFinalRenglon: 109831.84, enQueViene: "bulto de 18",
  tipoRenglon: "MERCADERIA", productoLocalId: 501, pedidoDetalleId: 3659, unidadElegida: null,
};
const D_CHEDDAR = { id: 3659, cantidad: 54, precioCosto: 2020, unidad: "BULTO", cantidadRecibida: null, producto: { id: 501, baseId: 164, base: CHEDDAR } };
const R_530 = {
  id: 814, orden: 3, textoCrudo: "MORTADELA X 4.5 KG", codigoProveedor: null, cantidad: 3,
  netoUnitario: 33330.71, subtotalImpreso: 99992.14, costoFinalRenglon: 123990.26, enQueViene: null,
  tipoRenglon: "MERCADERIA", productoLocalId: 502, pedidoDetalleId: 3594, unidadElegida: null,
};
const D_530 = { id: 3594, cantidad: 3, precioCosto: 8888.89, unidad: "BULTO", cantidadRecibida: null, producto: { id: 502, baseId: 2099, base: MORTADELA } };

/** El renglón analizado y la fila, por el camino de la pantalla (y de la ruta de aceptar). */
function porLaConciliacion({ producto, renglon, detalle }) {
  const contexto = {
    datos: [],
    catalogo: [producto],
    catalogoNormalizado: [{ productoBaseId: producto.id, nombre: producto.nombre }],
    nombrePorBase: new Map([[producto.id, producto.nombre]]),
    datosPorBase: new Map([[producto.id, producto]]),
    decisionPorBase: new Map(),
    variacionNormalPct: 10,
  };
  const c = { id: 77, estado: "CARGADO", proveedor: { id: 40, nombre: "Proveedor", umbralRevisarPct: null, umbralSospechaBajaPct: null }, lineas: [renglon] };
  const detalles = aplanarDetalles([detalle]);
  const lineas = analizarLineas({
    comprobante: c,
    contexto,
    detallesPlanos: detalles,
    porProductoLocal: new Map([[renglon.productoLocalId, { baseId: producto.id }]]),
  });
  const { grupos } = filasDeConciliacion({ comprobantes: [{ ...c, lineas }], detalles });
  return { renglonDeLaHoja: lineas[0], fila: { ...grupos[0].filas[0], variacionNormalPct: 10 } };
}

/** Lo que la ruta de aceptar arma para decidir, igual que en el fuente. */
const analisisDeLaRuta = (renglonDeLaHoja) => ({ ...renglonDeLaHoja.precio, unidad: renglonDeLaHoja.unidad ?? null });

const sinComentarios = (ruta) =>
  fs.readFileSync(new URL(ruta, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const texto = (el) => renderToStaticMarkup(el).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

// ── 1. ACEPTAR YA NO SE CAE ───────────────────────────────────────────────

test("CHEDDAR: LA RUTA DE ACEPTAR TIENE LA CLASIFICACIÓN Y EN QUÉ VIENE, +0,7 %", () => {
  const { renglonDeLaHoja } = porLaConciliacion({ producto: CHEDDAR, renglon: R_CHEDDAR, detalle: D_CHEDDAR });
  const a = analisisDeLaRuta(renglonDeLaHoja);
  assert.ok(a.clasificacion, "la que faltaba: sin ella la ruta se caía con «falla del sistema»");
  assert.equal(typeof a.clasificacion.clase, "string");
  assert.equal(a.unidad?.unidad, "POR_PRESENTACION");
  assert.equal(a.unidad?.unidadesPorFacturada, 18);
  assert.equal(a.precioAEscribir, 2033.92, "la unidad: $109.831,84 ÷ 54");
  assert.equal(Math.round((a.precioAEscribir / 2020 - 1) * 1000) / 10, 0.7);
});

test("CHEDDAR: SE GUARDA LO QUE MOSTRÓ LA HOJA — $2.033,92 EN LA LÍNEA Y EN EL COSTO, Y EL FRENO COMPARA EN LA MISMA UNIDAD", () => {
  const { renglonDeLaHoja, fila } = porLaConciliacion({ producto: CHEDDAR, renglon: R_CHEDDAR, detalle: D_CHEDDAR });
  const precio = analisisDeLaRuta(renglonDeLaHoja).precioAEscribir;
  // La línea del pedido: la ficha va por unidad, así que queda la unidad.
  const enElCatalogo = costoDelDepositoEnLaUnidadDelCatalogo({ base: CHEDDAR, costo: precio });
  assert.equal(costoParaUnidad({ costoMaestro: enElCatalogo, unidad: D_CHEDDAR.unidad, producto: CHEDDAR }) ?? enElCatalogo, 2033.92);
  // El costo que escribe el cierre, y la guarda: lo escrito se mueve igual que lo visto.
  const r = costoMaestroDeLaLectura({ filas: [fila], base: CHEDDAR, aceptado: (p) => p === 2033.92 });
  assert.equal(r.costoMaestro, 2033.92);
  const visto = fila.costoFactura / fila.costoMaestroHoy;
  const escrito = r.costoMaestro / CHEDDAR.precio_costo;
  assert.ok(Math.abs(escrito / visto - 1) <= 0.01, `visto ${visto}, escrito ${escrito}`);
  assert.equal(textoDelCostoQueQueda(fila), "Queda $2.033,92 / u. El margen se recalcula.");
});

test("MORTADELA #530 POR LA MISMA RUTA: CLASIFICACIÓN PRESENTE, PIEZA CONTRA PIEZA Y SE ESCRIBE EL KILO", () => {
  const { renglonDeLaHoja, fila } = porLaConciliacion({ producto: MORTADELA, renglon: R_530, detalle: D_530 });
  const a = analisisDeLaRuta(renglonDeLaHoja);
  assert.ok(a.clasificacion?.clase);
  assert.equal(a.unidad?.fiambrePorPieza, true);
  assert.equal(a.precioAEscribir, 41330.09);
  const r = costoMaestroDeLaLectura({ filas: [fila], base: MORTADELA, aceptado: (p) => p === 41330.09 });
  assert.equal(r.costoMaestro, 9184.46);
  const visto = fila.costoFactura / fila.costoMaestroHoy;
  assert.ok(Math.abs(r.costoMaestro / MORTADELA.precio_costo / visto - 1) <= 0.01);
});

test("LA RUTA ARMA EL ANÁLISIS CON EL RENGLÓN ENTERO, Y SIN COMPARACIÓN LO DICE CON LOS DOS NÚMEROS", () => {
  const ruta = sinComentarios("../../app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(ruta, /const renglonDeLaHoja = analizadaDeLaHoja \?\? analizada \?\? null;/);
  assert.match(ruta, /\{ \.\.\.renglonDeLaHoja\.precio, unidad: renglonDeLaHoja\.unidad \?\? null \}/);
  assert.doesNotMatch(ruta, /const analisis = analizadaDeLaHoja\?\.precio/, "el resumen solo, sin la unidad");
  assert.match(ruta, /if \(!clasificacion\) \{/);
  assert.match(ruta, /No se pudo comparar el precio de la factura \(\$\{formatearMoneda\(precioAEscribir\)\}\) contra tu costo/);
  const analisis = sinComentarios("../../lib/compras-proveedor/comprobante/analisisDeComprobante.js");
  assert.match(analisis, /clasificacion: analisis\.clasificacion \?\? null,/);
});

// ── 2. LOS TEXTOS DEL RENGLÓN ─────────────────────────────────────────────

test("CHEDDAR: LA TARJETA DICE «3 bultos de 18 = 54 unidades», NO «54 u, el papel dice 3 u»", () => {
  const { fila } = porLaConciliacion({ producto: CHEDDAR, renglon: R_CHEDDAR, detalle: D_CHEDDAR });
  assert.equal(bultoDelPapelSinBultoEnLaFicha(fila), 18);
  assert.equal(textoDeLaCantidad(fila), "3 bultos de 18 = 54 unidades");
  const t = texto(React.createElement(TarjetaLineaFactura, { fila }));
  assert.match(t, /Factura 3 bultos de 18 = 54 unidades/);
  assert.doesNotMatch(t, /el papel dice/);
  assert.doesNotMatch(t, /54 u\b/);
});

test("CHEDDAR: EL CASILLERO ES «Bultos de 18» Y ARRANCA EN 3; SE GUARDAN 54 UNIDADES", () => {
  const { fila } = porLaConciliacion({ producto: CHEDDAR, renglon: R_CHEDDAR, detalle: D_CHEDDAR });
  const alAbrir = cuantoEntroAlAbrir(fila);
  assert.equal(alAbrir.completos / bultoDelPapelSinBultoEnLaFicha(fila), 3, "el casillero arranca en 3");
  assert.equal(hayDiferenciaDePrecio(fila), true, "se ofrece Aceptar / Dejar");
  const h = texto(React.createElement(HojaCorregirLinea, { fila, abierta: true, onCerrar() {}, onGuardar() {} }));
  assert.match(h, /la factura dice 3 bultos de 18 = 54 unidades/);
  assert.match(h, /Bultos de 18/, "el rótulo del casillero dice de cuánto es el bulto");
  // La hoja arranca el casillero con ese número y guarda las unidades.
  const hoja = sinComentarios("./HojaCorregirLinea.jsx");
  assert.match(hoja, /String\(bultoDelPapel \? alAbrir\.completos \/ bultoDelPapel : alAbrir\.completos\)/);
  assert.match(hoja, /const factorDelCasillero = vaPorPack \? Number\(fila\?\.factorPack\) \|\| 1 : bultoDelPapel \?\? 1;/);
  assert.match(hoja, /return enUnidadesDeLaFila\(b, factorDelCasillero\) \+ s;/);
  assert.match(hoja, /cantidadRecibida: bultos === "" \? null : bultoDelPapel \? unidadesContadas : Number\(bultos\),/);
});

test("UN PRODUCTO CON BULTO EN LA FICHA, O UNIDADES QUE NO COMPLETAN BULTOS, NO CAMBIAN", () => {
  const { fila } = porLaConciliacion({ producto: CHEDDAR, renglon: R_CHEDDAR, detalle: D_CHEDDAR });
  assert.equal(bultoDelPapelSinBultoEnLaFicha({ ...fila, factorPack: 18 }), null, "con bulto en la ficha manda la ficha");
  assert.equal(bultoDelPapelSinBultoEnLaFicha({ ...fila, unidad: { ...fila.unidad, requiereDecision: true } }), null);
  assert.equal(bultoDelPapelSinBultoEnLaFicha({ ...fila, unidad: { ...fila.unidad, unidadesPorFacturada: 20 } }), null, "54 no completa bultos de 20");
});
