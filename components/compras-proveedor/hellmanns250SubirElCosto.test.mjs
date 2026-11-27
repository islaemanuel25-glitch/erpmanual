// AL RECIBIR SE PUEDE SUBIR —Y BAJAR— EL COSTO, Y VIENE MARCADO EL MÁS ALTO.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/hellmanns250SubirElCosto.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-27, recepción real) ─────────────────────────
//
// HELLMANNS MAYONESA 250G: la factura trae 4 PACK x24 a $36.391,04 el pack —
// $1.516,29 la unidad—, total $145.564,14. El ERP la tiene a $1.290,94 la
// unidad: −17,5 % contra el papel. La tarjeta decía "Dejás tu precio ·
// $1.290,94 / u" y no había forma de subir el costo al del papel.
//
// Por qué: el análisis compara el papel contra el costo del CATÁLOGO, y contra
// él la diferencia era una baja de más del 15 % —"sospecha de mala lectura"—.
// Esa clase hacía tres cosas, las tres bloqueos: la hoja marcaba "Dejar el que
// tenía" de entrada, escondía "Aceptar el precio nuevo", y aunque se aceptara,
// el cierre no escribía el costo. Quien tocaba "Revisado y seguir" guardaba
// "Dejás tu precio" sin haberlo elegido.
//
// REGLAS DE EMANUEL, fijadas:
//   1. Viene marcado SIEMPRE el más alto entre el ERP y el papel.
//   2. Pasar la variación del proveedor es una alerta visual, no un bloqueo.
//   3. Subir o bajar al recibir nunca queda bloqueado.
//
// Y en la lista aparecía "HELLMANNS MAYONESA 250G · 20 · $0,00": un renglón
// del papel que no es mercadería —envase, cargo o descuento— atado a la línea
// del pedido de la mayonesa. Esos renglones conservaban el vínculo, y el armado
// de filas sumaba sus 20 unidades a los 4 packs.
//
// Las filas salen por el camino de la pantalla: `analizarLineas` y
// `filasDeConciliacion`.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { aplanarDetalles, analizarLineas } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { ACCION_PRECIO, puedeAceptarse } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";
import { clasificarDiferenciaCosto, decidirEscrituraDeCosto } from "@/lib/compras-proveedor/fronteraCosto";

const PAPEL_PACK = 36391.04;
const ERP_UNIDAD = 1290.94;

const HELLMANNS = (precioCosto) => ({
  id: 950, nombre: "HELLMANNS MAYONESA 250G", unidad_medida: "unidad", factor_pack: 1,
  modoCompraProveedor: "UNIDAD", pesoEsFijo: false, pesoReferenciaKg: null, precio_costo: precioCosto,
});

const RENGLON = (orden, texto, cantidad, neto, extra = {}) => ({
  id: 9500 + orden, comprobanteId: 95, orden, codigoProveedor: null, textoCrudo: texto, cantidad, netoUnitario: neto,
  subtotalImpreso: Math.round(cantidad * neto * 100) / 100, costoFinalRenglon: Math.round(cantidad * neto * 100) / 100,
  tipoRenglon: "MERCADERIA", enQueViene: null, productoLocalId: 950, pedidoDetalleId: 9600, unidadElegida: null, noVino: false,
  ...extra,
});
const LA_FACTURA = RENGLON(1, "HELLMANNS MAYONESA 250G X24", 4, PAPEL_PACK);
// El renglón que se veía como "· 20 · $0,00": fuera de la mercadería, a cero,
// y atado a la misma línea del pedido.
const EL_DE_CERO = RENGLON(2, "HELLMANNS MAYONESA 250G", 20, 0, { tipoRenglon: "DESCUENTO" });

/**
 * La fila de la mayonesa por el camino de la pantalla.
 * @param catalogo  el costo del producto hoy; el pedido queda en $1.290,94
 */
function conciliar({ catalogo = ERP_UNIDAD, pedido = ERP_UNIDAD, renglones = [LA_FACTURA] } = {}) {
  const producto = HELLMANNS(catalogo);
  const contexto = {
    datos: { codigosProveedor: [], productos: [{ productoBaseId: producto.id, nombre: producto.nombre }] },
    catalogo: [producto],
    catalogoNormalizado: [{ productoBaseId: producto.id, nombre: producto.nombre }],
    nombrePorBase: new Map([[producto.id, producto.nombre]]),
    datosPorBase: new Map([[producto.id, producto]]),
    decisionPorBase: new Map(),
    variacionNormalPct: 10,
  };
  const detalles = aplanarDetalles([
    { id: 9600, cantidad: 96, unidad: "UNIDAD", precioCosto: pedido, cantidadRecibida: null, producto: { id: 950, baseId: 950, base: producto } },
  ]);
  const c = { id: 95, estado: "CARGADO", proveedor: { id: 51, nombre: "Proveedor", umbralRevisarPct: null, umbralSospechaBajaPct: null }, lineas: renglones };
  const lineas = analizarLineas({ comprobante: c, contexto, detallesPlanos: detalles, porProductoLocal: new Map([[950, { baseId: 950 }]]) });
  const { grupos } = filasDeConciliacion({ comprobantes: [{ ...c, lineas }], detalles });
  const filas = grupos.flatMap((g) => g.filas);
  return { fila: { ...filas.find((f) => f.lineaId === LA_FACTURA.id), variacionNormalPct: 10 }, filas };
}

const html = (el) => renderToStaticMarkup(el);
const plano = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const hoja = (fila) => html(React.createElement(HojaCorregirLinea, { fila, abierta: true, onCerrar() {}, onGuardar() {} }));
/** ¿La opción de precio con ese título viene marcada? */
const marcada = (h, titulo) => {
  const boton = h.split("<button").find((b) => b.includes(`>${titulo}<`));
  assert.ok(boton, `no está la opción «${titulo}»`);
  return /aria-pressed="true"/.test(boton.slice(0, boton.indexOf(">")));
};

test("LA TARJETA: papel $36.391,04 el pack de 24 · $1.516,29 la unidad, ERP $1.290,94 / u con −17,5 %", () => {
  const t = plano(html(React.createElement(TarjetaLineaFactura, { fila: conciliar().fila })));
  assert.match(t, /Papel \$36\.391,04 el pack de 24 · \$1\.516,29 la unidad/);
  // El porcentaje del renglón ERP queda como estaba: negativo, el ERP más barato.
  assert.match(t, /ERP \$1\.290,94 \/ u −17,5 %/);
  assert.doesNotMatch(t, /Dejás tu precio/);
});

test("REGLA 1 · viene marcado el del papel, que es el más alto, y se puede tomar", () => {
  const h = hoja(conciliar().fila);
  assert.equal(marcada(h, "Aceptar el precio nuevo"), true);
  assert.equal(marcada(h, "Dejar el que tenía"), false);
  assert.match(plano(h), /Queda \$1\.516,29 \/ u\. El margen se recalcula\./, "dice con el número qué costo queda");
});

test("EL CASO DE PRODUCCIÓN: con el catálogo más arriba que el papel, ANTES se marcaba dejar y se escondía aceptar", () => {
  // El pedido en $1.290,94 y el catálogo en $1.800: contra el catálogo el
  // papel es una baja del 15,8 %, la "sospecha de mala lectura".
  const { fila } = conciliar({ catalogo: 1800 });
  assert.equal(fila.precio.decision.accion, ACCION_PRECIO.FRENA, "la clase que bloqueaba");
  const t = plano(html(React.createElement(TarjetaLineaFactura, { fila })));
  assert.match(t, /ERP \$1\.290,94 \/ u −17,5 %/, "la misma tarjeta que vio Emanuel");
  const h = hoja(fila);
  // REGLAS 2 y 3: la alerta se dice, y las dos opciones están.
  assert.equal(marcada(h, "Aceptar el precio nuevo"), true, "venía marcado «Dejar el que tenía»");
  assert.equal(marcada(h, "Dejar el que tenía"), false);
  assert.match(plano(h), /no parece un precio nuevo|dígito mal leído/);
  // El servidor acepta…
  const base = { linea: { id: fila.lineaId }, productoBaseId: 950, lineaDePedidoId: 9600, comprobante: { estado: "CARGADO" }, decision: fila.precio.decision, unidad: fila.unidad };
  assert.deepEqual(puedeAceptarse(base), { ok: true }, "rechazaba con «sospecha de mala lectura»");
  // …y el cierre escribe lo aceptado, y solo lo aceptado.
  const clasificacion = clasificarDiferenciaCosto({ costoAnterior: 1800, costoNuevo: PAPEL_PACK / 24 });
  assert.equal(decidirEscrituraDeCosto({ clasificacion, aceptada: true }).escribe, true);
  assert.equal(decidirEscrituraDeCosto({ clasificacion }).escribe, false, "sin aceptar nunca baja solo");
});

test("REGLA 1 AL REVÉS · con el ERP más caro que el papel viene marcado el del ERP, y aceptar sigue estando", () => {
  // $1.700 la unidad contra $1.516,29 del papel: el ERP es el más alto.
  const h = hoja(conciliar({ catalogo: 1700, pedido: 1700 }).fila);
  assert.equal(marcada(h, "Dejar el que tenía"), true);
  assert.equal(marcada(h, "Aceptar el precio nuevo"), false);
});

test("EL «· 20 · $0,00»: un renglón que no es mercadería no le suma unidades a la mayonesa", () => {
  const { fila, filas } = conciliar({ renglones: [LA_FACTURA, EL_DE_CERO] });
  const deCero = filas.find((f) => f.lineaId === EL_DE_CERO.id);
  assert.equal(deCero.envase, true, "va en la sección de lo que no es producto");
  assert.equal(deCero.pedidoDetalleId, null, "se colgaba de la línea de la mayonesa");
  // La mayonesa dice lo que dice la factura —4 packs de 24 = 96—, como sin
  // el renglón de cero. Con él colgado, la línea del pedido recibía 4 + 20.
  const sola = conciliar().fila;
  assert.equal(fila.cantidadPapelTotal ?? fila.cantidad, sola.cantidadPapelTotal ?? sola.cantidad);
  assert.equal(
    plano(html(React.createElement(TarjetaLineaFactura, { fila }))),
    plano(html(React.createElement(TarjetaLineaFactura, { fila: sola })))
  );
});
