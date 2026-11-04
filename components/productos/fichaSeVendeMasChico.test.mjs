// LA FICHA DEL PRODUCTO: "+ SE VENDE MÁS CHICO" (tercer nivel de empaque,
// tanda 9 — docs/roadmap/tercer-nivel-empaque.md).
//
//   node --import ./scripts/alias-loader.mjs --test components/productos/fichaSeVendeMasChico.test.mjs
//
// Cerrado por defecto: lo único nuevo en la ficha de un producto sin el dato es
// el enlace. Abierto si el producto ya tiene el dato, con los campos de la
// ficha copiados tal cual (`Field` + `SunmiInput`). El precio del suelto aparece
// en Precios solo si el producto tiene el dato. Los `initialData` tienen la
// forma que devuelve `/api/productos/obtener` (`mergeBaseLocalToUi`).

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FormProducto from "@/components/productos/FormProducto";
import { UserProvider } from "@/app/context/UserContext";
import { mergeBaseLocalToUi } from "@/lib/mappers/producto";

const dibujar = (initialData) =>
  renderToStaticMarkup(
    React.createElement(
      UserProvider,
      null,
      React.createElement(FormProducto, {
        initialData,
        catalogos: { CATEGORIAS: [], PROVEEDORES: [], AREAS: [] },
        onSubmit() {},
        onCancel() {},
      })
    )
  );

const base = (x = {}) => ({
  id: 7, nombre: "Camel Yellow 20", unidad_medida: "pack", factor_pack: 10, precio_costo: "12000", precio_venta: "15000",
  redondeo_100: false, activo: true, es_combo: false, modalidad: "NORMAL", ...x,
});

test("F1. sin el dato: el enlace cerrado, sin los campos ni el precio del suelto", () => {
  const html = dibujar(mergeBaseLocalToUi(base(), { id: 70, localId: 2, precio_venta: "1500" }));
  assert.match(html, /\+ Se vende más chico/);
  assert.doesNotMatch(html, /Sueltos por unidad|Nombre de la unidad|Nombre del bulto/);
  assert.doesNotMatch(html, /Venta suelto/);
});

test("F2. con el dato: abierto, con los tres campos cargados y el precio del suelto de la ubicación", () => {
  const html = dibujar(
    mergeBaseLocalToUi(base({ sueltos_por_unidad: 20, nombre_unidad: "atado", nombre_bulto: "cartón" }), { id: 70, localId: 2, precio_venta: "1500", precio_venta_suelto: "100" })
  );
  assert.doesNotMatch(html, /\+ Se vende más chico/);
  assert.match(html, /Sueltos por unidad<\/label><input[^>]*value="20"/);
  assert.match(html, /Nombre de la unidad<\/label><input[^>]*value="atado"/);
  assert.match(html, /Nombre del bulto<\/label><input[^>]*value="cartón"/);
  assert.match(html, /Venta suelto<\/label><input[^>]*value="100"/);
});

test("F3. un producto por kilo no ofrece venderse más chico", () => {
  const html = dibujar(mergeBaseLocalToUi(base({ unidad_medida: "kg", factor_pack: null }), null));
  assert.doesNotMatch(html, /Se vende más chico|Sueltos por unidad/);
});
