// UN SALTO DE PRECIO GRANDE SE PUEDE ACEPTAR DESDE LA HOJA.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/picnicSaltoDePrecio.test.mjs
//
// Emanuel, 2026-10-29: PICNIC 38g, el papel cobra $375,35 la unidad y el ERP la
// tiene a $246,00 (53 % más). El aumento es real, y la hoja decía "La mercadería
// entra igual y tu costo no se toca" sin ofrecer aceptarlo. La regla de antes
// —ante un salto así no se ofrece aceptar— la reemplazó el dueño.
//
// La fila se arma por el mismo camino que la conciliación —`analizarPrecioDeLinea`
// y `filasDeConciliacion`—, como en `pablo337Hoja.test.mjs`, y no a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { formatearMoneda } from "@/lib/moneda";
import {
  loQueNoCuadra,
  saltoDePrecioAceptable,
  textoSiAceptaElSalto,
  textoSiNoAceptaElSalto,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const aLaVista = (el) => renderToStaticMarkup(el).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const literal = (s) => s.replace(/[$.*+?()[\]{}|\\^]/g, "\\$&");

const PICNIC = { precio_costo: 246, factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "BULTO" };
const DETALLE = { id: 9001, cantidad: 40, precioCosto: 246, unidad: "UNIDAD", productoBaseId: 501, factorPack: 1 };

function picnic({ producto = PICNIC, detalle = DETALLE, corrida = false } = {}) {
  const linea = { orden: 1, textoCrudo: "PICNIC 38G", cantidad: 40, netoUnitario: 375.35, subtotalImpreso: 15014, costoFinalRenglon: 15014, enQueViene: "unidad" };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Distribuidora" } });
  const det = { ...detalle, costoMaestroHoy: producto.precio_costo };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 70, estado: "CARGADO", lineas: [{ ...linea, id: 800, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, costoMaestroHoy: producto.precio_costo, variacionNormalPct: 10, producto: "PICNIC 38g", corridaSospechada: corrida };
}

const abrir = (fila, extra = {}) =>
  aLaVista(
    React.createElement(HojaCorregirLinea, {
      fila, abierta: true, onCerrar() {}, onGuardar() {}, onCorregirPapel() {}, onAceptarPrecio() {}, onDejarMiPrecio() {}, ...extra,
    })
  );

test("PICNIC es un salto de PRECIO, y es lo único que frena: se puede aceptar", () => {
  const f = picnic();
  assert.equal(loQueNoCuadra(f).que, "PRECIO");
  assert.match(loQueNoCuadra(f).texto, /\(53 % más\)\. Fijate si es este producto\./);
  assert.equal(saltoDePrecioAceptable(f), true);
});

test("la hoja ofrece aceptarlo, con el aviso arriba y los dos números", () => {
  const hoja = abrir(picnic());
  assert.match(hoja, /El precio no se puede comparar/);
  assert.match(hoja, /Fijate si es este producto/, "el aviso se mantiene: el salto puede ser un vínculo equivocado");
  assert.match(hoja, /Aceptar el precio nuevo/);
  assert.match(hoja, new RegExp(literal(`Pasa a ser tu costo: ${formatearMoneda(375.35)}. El margen se recalcula.`)));
  assert.match(hoja, /Dejar el que tenía/);
  assert.match(hoja, new RegExp(literal(`y tu costo queda en ${formatearMoneda(246)}.`)));
  assert.doesNotMatch(hoja, /tu costo no se toca/);
});

test("los textos dicen qué queda en cada caso, con el formato de moneda de la pantalla", () => {
  assert.equal(formatearMoneda(375.35), "$375,35");
  assert.equal(textoSiAceptaElSalto(375.35), "Pasa a ser tu costo: $375,35. El margen se recalcula.");
  assert.equal(
    textoSiNoAceptaElSalto({ entra: "40 unidades", erp: 246 }),
    "Si no lo aceptás, entran 40 unidades y tu costo queda en $246,00."
  );
});

test("al guardar con «aceptar» elegido, va por la misma ruta que el caso normal", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /if \(cambio \|\| \(saltoAceptable && aceptaPrecio !== null\)\) \{\s*const r = aceptaPrecio \? await onAceptarPrecio\?\.\(fila\) : await onDejarMiPrecio\?\.\(fila\);/);
  assert.match(hoja, /const saltoAceptable = saltoDePrecioAceptable\(fila\) && !yaDecidioElFreno && !noSePuedeAceptar;/);
});

test("el servidor deja pasar el salto, preguntando lo mismo sobre la fila de la hoja", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(ruta, /if \(sinComparacion && !dejaElMioBajoFreno && !aceptaUnSalto\) \{/);
  assert.match(ruta, /saltoDePrecioAceptable\(\{\s*\.\.\.filaDeLaHoja,/);
});

test("lo que no es un precio sigue sin poder aceptarse: un papel corrido, una escala", () => {
  const corrida = picnic({ corrida: true });
  assert.equal(saltoDePrecioAceptable(corrida), false);
  assert.match(abrir(corrida), /tu costo no se toca/);
  // Chandon de Pablo #337: el papel cobra la mitad de la botella, es escala.
  const escala = picnic({ producto: { ...PICNIC, precio_costo: 750.7 }, detalle: { ...DETALLE, precioCosto: 750.7 } });
  assert.equal(loQueNoCuadra(escala).que, "ESCALA");
  assert.equal(saltoDePrecioAceptable(escala), false);
  assert.doesNotMatch(abrir(escala), /Aceptar el precio nuevo/);
});
