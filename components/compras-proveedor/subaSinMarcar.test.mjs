// UNA SUBA DE MÁS DEL 35 % NO VIENE MARCADA, Y SIN ELEGIR NO SE CIERRA.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/subaSinMarcar.test.mjs
//
// ── LA DECISIÓN (Emanuel, 2026-11-05) ─────────────────────────────────────
//
// El sachet de Super Mario releído sin UxB: el papel cobra $26.849,07 lo
// facturado —5 bultos de 40, leídos como 5 unidades— contra $668,86 del ERP.
// Es un producto sin pack, así que desde el maní de Prod Nat no muestra el
// cartel de escala sino el salto, con las dos opciones. Y la hoja marca el
// precio más alto: venía marcado "Aceptar el precio nuevo", y un toque de más
// dejaba un costo 40 veces mayor.
//
// Ahora: cuando el papel SUBE más que el umbral único de la pieza de unidades
// (35 %), no viene marcada ninguna; la hoja no guarda y la recepción no se
// cierra hasta elegir. Subas dentro del 35 % y cualquier baja, como hoy.
//
// Las filas salen por el camino de la conciliación —`analizarPrecioDeLinea` y
// `filasDeConciliacion`—, como en `picnicSaltoDePrecio.test.mjs`. El sachet es
// el renglón del papel tal como lo daría el lector sin UxB; el id del pedido y
// lo pedido son ilustrativos.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea, { opcionAlAbrir } from "./HojaCorregirLinea.jsx";
import HojaCerrarRecepcion from "./HojaCerrarRecepcion.jsx";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { loQueNoDejaCerrar, resumenDelCierre } from "@/lib/compras-proveedor/cierreDeRecepcion";
import { DECISION_DE_PRECIO } from "@/lib/compras-proveedor/decisionDePrecio";
import {
  precioDeUnaUnidad,
  saltoDePrecioAceptable,
  subaSinElegir,
  subeMasQueLoPlausible,
  TEXTO_ELEGI_EL_PRECIO,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const aLaVista = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

const HELLMANS = { precio_costo: 668.86, factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "BULTO" };
const DET_HELLMANS = { id: 9201, cantidad: 200, precioCosto: 668.86, unidad: "UNIDAD", productoBaseId: 701, factorPack: 1 };
const SACHET_SIN_UXB = {
  orden: 1, textoCrudo: "HELLMANN'S MAY SACHET 20X118G", cantidad: 5, netoUnitario: null,
  subtotalImpreso: 105290.47, costoFinalRenglon: 134245.36, enQueViene: null,
};

/** Un producto por unidad a $246 (el de PICNIC), para la suba chica. */
const PICNIC = { precio_costo: 246, factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "BULTO" };
const DET_PICNIC = { id: 9202, cantidad: 40, precioCosto: 246, unidad: "UNIDAD", productoBaseId: 702, factorPack: 1 };
const picnicA = (neto) => {
  const importe = Math.round(40 * neto * 100) / 100;
  return { orden: 1, textoCrudo: "PICNIC 38G", cantidad: 40, netoUnitario: neto, subtotalImpreso: importe, costoFinalRenglon: importe, enQueViene: "unidad" };
};

/** El maní de Prod Nat: la baja. */
const MANI = { precio_costo: 5000, factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "BULTO" };
const DET_MANI = { id: 9203, cantidad: 8, precioCosto: 5000, unidad: "UNIDAD", productoBaseId: 703, factorPack: 1 };
const RENGLON_MANI = {
  orden: 1, textoCrudo: "MANI C/ CASCARA BOLSA x 400 GRS", cantidad: 8, netoUnitario: 2312.5,
  subtotalImpreso: 18500, costoFinalRenglon: 18500, enQueViene: "unidad",
};

function filaDe({ linea, producto, detalle, decisionPrecio = null }) {
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Super Mario" } });
  const det = { ...detalle, costoMaestroHoy: producto.precio_costo };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 72, estado: "CARGADO", lineas: [{ ...linea, id: 802, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, costoMaestroCatalogo: producto.precio_costo, decisionPrecio }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, costoMaestroHoy: producto.precio_costo, variacionNormalPct: 10, revisada: true };
}
const sachet = (extra = {}) => filaDe({ linea: SACHET_SIN_UXB, producto: HELLMANS, detalle: DET_HELLMANS, ...extra });

const hojaHtml = (fila) =>
  renderToStaticMarkup(
    React.createElement(HojaCorregirLinea, {
      fila, abierta: true, onCerrar() {}, onGuardar() {}, onCorregirPapel() {}, onAceptarPrecio() {}, onDejarMiPrecio() {},
    })
  );
const marcada = (html, titulo) => {
  const boton = html.split("<button").find((b) => b.includes(`>${titulo}<`));
  assert.ok(boton, `no está la opción «${titulo}»`);
  return /aria-pressed="true"/.test(boton.slice(0, boton.indexOf(">")));
};
/** Lo que la hoja trae elegido al abrir, con la misma cuenta que usa. */
const alAbrir = (f) => opcionAlAbrir({ fila: f, sugerida: {}, saltoAceptable: saltoDePrecioAceptable(f), deUnaUnidad: precioDeUnaUnidad(f) });

test("EL SACHET SIN UxB: «El precio subió», sin ninguna opción marcada", () => {
  const f = sachet();
  assert.equal(saltoDePrecioAceptable(f), true, "un producto sin pack: salto de precio, no escala");
  assert.equal(subeMasQueLoPlausible(precioDeUnaUnidad(f)), true, "$26.849,07 contra $668,86");
  assert.equal(alAbrir(f), null, "antes: true, por ser el más alto");
  const html = hojaHtml(f);
  assert.match(aLaVista(html), / El precio subió [\d.]+,\d % /);
  assert.equal(marcada(html, "Aceptar el precio nuevo"), false);
  assert.equal(marcada(html, "Dejar el que tenía"), false);
});

test("EL SACHET: la hoja no guarda sin elegir, y la recepción no se cierra", () => {
  // La hoja: con un salto sin elegir, guardar dice que hay que elegir y no sigue.
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /if \(saltoAceptable && aceptaPrecio === null\) \{\s*setError\(TEXTO_ELEGI_EL_PRECIO\);\s*return;\s*\}/);
  assert.equal(TEXTO_ELEGI_EL_PRECIO, "Elegí qué precio queda antes de seguir.");
  // El cierre: el resumen lo cuenta, el texto lo dice y el botón queda apagado.
  const f = sachet();
  assert.equal(subaSinElegir(f), true);
  const r = resumenDelCierre({ filas: [f] });
  assert.equal(r.preciosSinElegir, 1);
  const motivo = loQueNoDejaCerrar(r);
  assert.equal(motivo, "Un producto sube más del 35 % y no elegiste qué precio queda. Abrí Corregir y elegí uno.");
  const cerrar = renderToStaticMarkup(React.createElement(HojaCerrarRecepcion, { abierta: true, filas: [f], totalesDeFacturas: [], contados: {} }));
  assert.ok(aLaVista(cerrar).includes(motivo), "la hoja de cerrar dice por qué no deja");
  const cierre = codigoDe("components/compras-proveedor/HojaCerrarRecepcion.jsx");
  assert.match(cierre, /disabled=\{guardando \|\| !enPantalla\.listo \|\| Boolean\(noDejaCerrar\)\}/);
  assert.match(cierre, /if \(!enPantalla\.listo \|\| noDejaCerrar\) return;/);
});

test("EL SACHET, YA ELEGIDO: dejar el tuyo destraba el cierre", () => {
  const f = sachet({ decisionPrecio: { decision: DECISION_DE_PRECIO.DEJA_EL_MIO, precioFacturado: 26849.07, precioPropio: 668.86 } });
  assert.equal(subaSinElegir(f), false);
  assert.equal(loQueNoDejaCerrar(resumenDelCierre({ filas: [f] })), null);
});

test("EL UMBRAL ES EL 35 % DE LA PIEZA DE UNIDADES, Y SOLO PARA ARRIBA", () => {
  // La suba del 10 % de abajo no llega a esta pregunta —no es un salto, se
  // compara normal—; acá se afirma el borde mismo.
  assert.equal(subeMasQueLoPlausible({ papel: 134, erp: 100 }), false, "34 %: queda como hoy");
  assert.equal(subeMasQueLoPlausible({ papel: 135, erp: 100 }), false, "35 % justo: dentro");
  assert.equal(subeMasQueLoPlausible({ papel: 136, erp: 100 }), true, "36 %: sin marcar");
  assert.equal(subeMasQueLoPlausible({ papel: 10, erp: 100 }), false, "una baja, por grande que sea, no");
});

test("UNA SUBA DEL 10 % SIGUE VINIENDO MARCADA COMO HOY: aceptar, el más alto", () => {
  const f = filaDe({ linea: picnicA(270.6), producto: PICNIC, detalle: DET_PICNIC });
  assert.equal(subaSinElegir(f), false);
  assert.equal(marcada(hojaHtml(f), "Aceptar el precio nuevo"), true);
  assert.equal(marcada(hojaHtml(f), "Dejar el que tenía"), false);
  assert.equal(loQueNoDejaCerrar(resumenDelCierre({ filas: [f] })), null);
});

test("UNA BAJA SIGUE CON «DEJAR EL QUE TENÍA» MARCADO: el maní de Prod Nat, −53,8 %", () => {
  const f = filaDe({ linea: RENGLON_MANI, producto: MANI, detalle: DET_MANI });
  assert.equal(subaSinElegir(f), false, "una baja no frena el cierre");
  const html = hojaHtml(f);
  assert.equal(marcada(html, "Dejar el que tenía"), true);
  assert.equal(marcada(html, "Aceptar el precio nuevo"), false);
  assert.equal(loQueNoDejaCerrar(resumenDelCierre({ filas: [f] })), null);
});
