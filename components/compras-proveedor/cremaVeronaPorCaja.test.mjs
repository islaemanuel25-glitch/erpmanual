// EL ALTA DESDE LA RECEPCIÓN PREGUNTA SI EL PRECIO ES POR CAJA O POR UNIDAD,
// COMO EL ALTA DE LISTAS.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/cremaVeronaPorCaja.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-06, recepción real) ─────────────────────────
//
// DAS Mayorista, factura 0020-00017245: "9020 CREMA VERONA XCAJA 20 — 6,00 —
// $ 24.793,38 — $ 148.760,28", 6 cajas de 20, sin producto en el catálogo.
// Desde "Corregir" → crear producto, el alta abría con el Factor pack VACÍO y
// "Costo * (por unidad)" en 30.743,79 —el precio de la CAJA con los impuestos
// que la recepción suma al costo—. Guardado así, cada crema quedaba a
// $ 30.743,79.
//
// Decisión de Emanuel: el alta desde la recepción hace lo mismo que el alta de
// "Sin producto en tu catálogo" de Listas, copiado tal cual. La cantidad por
// caja sale del nombre ("XCAJA 20" → 20; "X 4.5 KG" es peso, no cantidad), y
// con N > 1 la misma pregunta, sin nada elegido y con el costo vacío.
//
// El renglón pasa por `filasDeConciliacion`, el camino de la pantalla, como
// llega a la hoja: sin vincular. El costo final del renglón es el del papel con
// lo que la recepción suma: 6 × 30.743,79 = 184.462,74.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FormProducto from "@/components/productos/FormProducto";
import { UserProvider } from "@/app/context/UserContext";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import {
  bultoDelAltaDesdeElPapel,
  codigoDelProveedorParaElAlta,
  costoDelAltaDesdeElPapel,
  costoDelRenglonParaElAlta,
  lecturaRecordadaDelAltaDesdeElPapel,
  precargaDelAlta,
  preguntaDelAltaDesdeElPapel,
} from "@/lib/compras-proveedor/altaDesdeElPapel";
import { PRECIO_ES, preguntaDelPrecioDeLaLista } from "@/lib/proveedores/listas/costoDelAltaDesdeLaLista";
import { cantidadEnNombre, cantidadPorCajaEnNombre } from "@/lib/proveedores/listas/lectura/numeroDeLista";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const DAS = 77;

/** Un renglón sin vincular, como lo arma la conciliación del pedido. */
function renglon({ texto, cantidad = 6, neto = 24793.38, costoFinal = 184462.74, codigoProveedor = null, enQueViene = null }) {
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 95, estado: "CARGADO", lineas: [{
      id: 950, orden: 1, textoCrudo: texto, codigoProveedor, cantidad, netoUnitario: neto, enQueViene,
      subtotalImpreso: Math.round(cantidad * neto * 100) / 100, costoFinalRenglon: costoFinal, cargoDelRenglon: 0,
      productoLocalId: null, pedidoDetalleId: null, precio: null, unidad: null, candidatos: [], origen: "SIN_CANDIDATOS",
    }] }],
    detalles: [],
  }).grupos[0].filas;
  return f;
}

const CREMA = () => renglon({ texto: "CREMA VERONA XCAJA 20", codigoProveedor: "9020" });

test("CREMA VERONA XCAJA 20: factor 20, «Pack», y el costo vacío hasta elegir", () => {
  const f = CREMA();
  assert.equal(costoDelRenglonParaElAlta(f), 30743.79, "el precio de partida es el de hoy: la caja con lo que suma la recepción");
  assert.equal(bultoDelAltaDesdeElPapel(f), 20);
  const p = precargaDelAlta({ fila: f, proveedorId: DAS });
  assert.equal(p.nombre, "CREMA VERONA XCAJA 20");
  assert.equal(codigoDelProveedorParaElAlta(f), "9020");
  assert.equal(p.unidad_medida, "pack");
  assert.equal(p.factor_pack, 20);
  assert.equal("precio_costo" in p, false, "decía 30.743,79 «por unidad»");
});

test("CREMA VERONA: la pregunta de Listas, con «factura», sin nada elegido; caja 30.743,79 / 1.537,19 y unidad 614.875,80", () => {
  const q = preguntaDelAltaDesdeElPapel(CREMA());
  const sinEspacios = (t) => t.replace(/ /g, " ");
  assert.equal(q.titulo, "¿El precio de la factura es por caja o por unidad?");
  assert.equal(sinEspacios(q.detalle), "La factura dice $ 30.743,79 y 20 por caja.");
  assert.deepEqual(q.opciones.map((o) => o.texto), ["Por la caja de 20", "Por unidad"]);
  const [caja, unidad] = q.opciones;
  assert.equal(caja.costo, 30743.79, "Costo (por caja)");
  assert.equal(caja.unitario, 1537.19, "costo por unidad");
  assert.equal(sinEspacios(caja.cuenta), "Caja $ 30.743,79 · c/u $ 1.537,19");
  assert.equal(unidad.costo, 614875.8, "precio × 20");
  assert.equal(sinEspacios(unidad.cuenta), "Caja $ 614.875,80 · c/u $ 30.743,79");
  // Lo que se muestra es lo que se carga al elegir.
  assert.equal(costoDelAltaDesdeElPapel({ fila: CREMA(), precioEs: PRECIO_ES.CAJA }), 30743.79);
  assert.equal(costoDelAltaDesdeElPapel({ fila: CREMA(), precioEs: PRECIO_ES.UNIDAD }), 614875.8);
  assert.equal(costoDelAltaDesdeElPapel({ fila: CREMA() }), null, "sin elegir, vacío");
});

// El formulario lee el perfil del usuario; el proveedor real lo da vacío hasta
// consultar la sesión, que es como se dibuja la primera vez.
const dibujarAlta = (initialData) =>
  renderToStaticMarkup(
    React.createElement(
      UserProvider,
      null,
      React.createElement(FormProducto, {
        initialData,
        catalogos: { CATEGORIAS: [], PROVEEDORES: [{ id: DAS, nombre: "DAS Mayorista" }], AREAS: [] },
        onSubmit() {},
        onCancel() {},
        submitLabel: "Crear producto",
      })
    )
  );

test("en el formulario de verdad: Factor pack 20 y el costo vacío", () => {
  const html = dibujarAlta(precargaDelAlta({ fila: CREMA(), proveedorId: DAS }));
  assert.match(html, /value="20"/);
  const campoCosto = html.slice(html.indexOf("Costo *")).match(/<input[^>]*>/)?.[0] ?? "";
  assert.match(campoCosto, /value=""/);
  assert.doesNotMatch(html, /value="30743.79"/);
});

test("MORTADELA X 4.5 KG: es peso, no cantidad por caja; sin factor y sin pregunta", () => {
  assert.equal(cantidadEnNombre("MORTADELA X 4.5 KG"), null);
  assert.equal(cantidadPorCajaEnNombre("MORTADELA X 4.5 KG"), null);
  const f = renglon({ texto: "MORTADELA X 4.5 KG", cantidad: 3, neto: 33000, costoFinal: 3 * 41330.09 });
  const p = precargaDelAlta({ fila: f, proveedorId: DAS });
  assert.equal("factor_pack" in p, false);
  assert.equal("unidad_medida" in p, false);
  assert.equal(preguntaDelAltaDesdeElPapel(f), null);
  assert.equal(p.precio_costo, 41330.09, "como hoy: costo por unidad");
});

test("UN NOMBRE SIN NÚMERO NO PREGUNTA: queda como hoy", () => {
  const f = renglon({ texto: "MAYONESA SUELTA", cantidad: 2, neto: 30000, costoFinal: 70180 });
  assert.equal(preguntaDelAltaDesdeElPapel(f), null);
  const p = precargaDelAlta({ fila: f, proveedorId: DAS });
  assert.equal("factor_pack" in p, false);
  assert.equal(p.precio_costo, 35090);
});

test("«X 12» y el UxB del renglón también dicen la caja; el del renglón manda sobre el nombre", () => {
  assert.equal(bultoDelAltaDesdeElPapel(renglon({ texto: "GALLETITAS X 12" })), 12);
  assert.equal(bultoDelAltaDesdeElPapel(renglon({ texto: "YERBA X 500 GR" })), null, "500 gramos no es una caja");
  assert.equal(bultoDelAltaDesdeElPapel(renglon({ texto: "CREMA VERONA XCAJA 20", enQueViene: "bulto de 24" })), 24);
});

test("LISTAS NO CAMBIA: su pregunta sigue diciendo «lista», y «XCAJA 20» no entra a su lector", () => {
  const q = preguntaDelPrecioDeLaLista({ precioConIva: 3139.92, unidadesPorBulto: 10 });
  assert.equal(q.titulo, "¿El precio de la lista es por caja o por unidad?");
  assert.match(q.detalle, /^La lista dice /);
  assert.equal(cantidadEnNombre("CREMA VERONA XCAJA 20"), null);
});

test("LO ELEGIDO SE RECUERDA PARA EL PRODUCTO CON EL PROVEEDOR, COMO EN LISTAS", () => {
  assert.deepEqual(lecturaRecordadaDelAltaDesdeElPapel({ fila: CREMA(), precioEs: PRECIO_ES.CAJA }), { clave: "MISMA_PRESENTACION", multiplicador: 1, cantidad: null });
  assert.deepEqual(lecturaRecordadaDelAltaDesdeElPapel({ fila: CREMA(), precioEs: PRECIO_ES.UNIDAD }), { clave: "PACK_20", multiplicador: 20, cantidad: null });
  assert.equal(lecturaRecordadaDelAltaDesdeElPapel({ fila: CREMA(), precioEs: null }), null);
  // El camino: el alta lo devuelve, la hoja y la pantalla lo pasan, y la ruta
  // lo guarda en la misma tabla y la misma transacción que el vínculo.
  const alta = codigoDe("components/compras-proveedor/AltaDesdeElPapel.jsx");
  assert.match(alta, /await onCreado\?\.\(data\.item, \{ precioEs \}\);/);
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /const r = await onVincular\?\.\(fila, productoBaseId, extra\);/);
  const pantalla = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.match(pantalla, /\.\.\.\(extra\?\.precioEs \? \{ precioEs: extra\.precioEs \} : \{\}\)/);
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/vincular/route.js");
  assert.match(ruta, /lecturaRecordadaDelAltaDesdeElPapel\(\{ fila: linea, precioEs: body\?\.precioEs \?\? null \}\)/);
  assert.match(ruta, /enQueViene: true,/);
  const transaccion = ruta.slice(ruta.indexOf("await prisma.$transaction(async (tx) => {"));
  assert.match(transaccion, /^await prisma\.\$transaction\(async \(tx\) => \{\s*if \(lecturaDelAlta && proveedorDelPapel\) \{\s*await tx\.lecturaProductoProveedor\.upsert\(/);
});

test("LA PREGUNTA ES LA DE LISTAS COPIADA TAL CUAL: misma pieza, mismos rótulos, mismo arranque sin elegir", () => {
  const recepcion = codigoDe("components/compras-proveedor/AltaDesdeElPapel.jsx");
  const listas = codigoDe("components/proveedores/listas/AltaDesdeLaLista.jsx");
  const bloque = (fuente, desde, hasta) => fuente.slice(fuente.indexOf(desde), fuente.indexOf(hasta, fuente.indexOf(desde))).replace(/\s+/g, " ");
  for (const [desde, hasta] of [["antesDelCosto={", "textosDelCosto={"], ["textosDelCosto={", "costoSugerido={costoSugerido}"]]) {
    assert.ok(recepcion.includes(desde), `falta ${desde} en la recepción`);
    assert.equal(bloque(recepcion, desde, hasta), bloque(listas, desde, hasta), `${desde} no es el de Listas`);
  }
  assert.match(recepcion, /import SunmiOpcionElegible from "@\/components\/sunmi\/SunmiOpcionElegible";/);
  assert.match(recepcion, /const \[precioEs, setPrecioEs\] = useState\(null\);/);
  assert.match(recepcion, /costoSugerido=\{costoSugerido\}/);
  assert.match(recepcion, /const costoSugerido = pregunta \? costoDelAltaDesdeElPapel\(\{ fila, precioEs \}\) : null;/);
});
