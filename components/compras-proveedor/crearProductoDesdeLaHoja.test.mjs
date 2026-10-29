// "CREAR PRODUCTO" DESDE LA HOJA "QUÉ PRODUCTO ES".
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/crearProductoDesdeLaHoja.test.mjs
//
// Myf #383: "HELLMANNS MAY LIVIANA DP 24X237G" no existía en el catálogo y la
// hoja no tenía salida. Ahora la búsqueda en todo el catálogo ofrece "Crear
// producto", que abre el alta de siempre precargada con el papel.
//
// La fila sale de `filasDeConciliacion`, el mismo camino que la pantalla, con
// un renglón SIN VINCULAR: así es como llega a la hoja.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BuscadorProducto, TEXTO_CREAR_PRODUCTO } from "@/components/comprobantes/PiezasConciliacion";
import FormProducto from "@/components/productos/FormProducto";
import { UserProvider } from "@/app/context/UserContext";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { precioFinalDelRenglon } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { precargaDelAlta, costoDelRenglonParaElAlta } from "@/lib/compras-proveedor/altaDesdeElPapel";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const MYF = 41;

/** Un renglón sin vincular, como lo arma la conciliación del pedido. */
function renglon({ texto, cantidad = 2, importe = 70180, cargo = 0, codigoProveedor = null }) {
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 90, estado: "CARGADO", lineas: [{
      id: 900, orden: 3, textoCrudo: texto, codigoProveedor, cantidad, netoUnitario: importe / cantidad,
      subtotalImpreso: importe, costoFinalRenglon: importe, cargoDelRenglon: cargo,
      productoLocalId: null, pedidoDetalleId: null, precio: null, unidad: null, candidatos: [], origen: "SIN_CANDIDATOS",
    }] }],
    detalles: [],
  }).grupos[0].filas;
  return f;
}

const HELLMANNS = () => renglon({ texto: "HELLMANNS MAY LIVIANA DP 24X237G", cargo: 1234.5 });

test("en todo el catálogo, con permiso, aparece «Crear producto»; sin permiso, no", () => {
  const con = renderToStaticMarkup(React.createElement(BuscadorProducto, { onElegir() {}, onCancelar() {}, onCrearProducto() {} }));
  assert.match(con, new RegExp(TEXTO_CREAR_PRODUCTO));
  const sin = renderToStaticMarkup(React.createElement(BuscadorProducto, { onElegir() {}, onCancelar() {} }));
  assert.doesNotMatch(sin, new RegExp(TEXTO_CREAR_PRODUCTO));
  // Entre lo del proveedor todavía no: primero se busca en todo el catálogo.
  const enElProveedor = renderToStaticMarkup(
    React.createElement(BuscadorProducto, { proveedorId: MYF, onElegir() {}, onCancelar() {}, onCrearProducto() {} })
  );
  assert.doesNotMatch(enElProveedor, new RegExp(TEXTO_CREAR_PRODUCTO));
});

test("cada precargado sale de donde corresponde", () => {
  const f = HELLMANNS();
  const p = precargaDelAlta({ fila: f, proveedorId: MYF });
  assert.equal(p.nombre, "HELLMANNS MAY LIVIANA DP 24X237G", "el nombre es lo que dice el papel");
  assert.equal(p.proveedor_id, MYF, "el proveedor es el del comprobante");
  assert.equal(p.factor_pack, 24, "el bulto, porque el papel lo imprime");
  // El costo es el de la recepción: costo final del renglón más su parte de los
  // cargos, dividido por la cantidad.
  assert.equal(p.precio_costo, precioFinalDelRenglon({ costoFinalRenglon: 70180, cargoDeLaLinea: 123450, divisor: 2 }));
  assert.equal(p.precio_costo, 35707.25);
  // Lo que el alta no asigna sola no se inventa.
  assert.equal("sku" in p, false, "el alta no asigna código interno: no se inventa uno del papel");
  assert.equal("precio_venta" in p, false, "sin margen cargado el alta no calcula la venta");
  assert.equal("id" in p, false, "sin id: sigue siendo un alta");
});

test("lo que el papel no trae queda vacío", () => {
  const sinBulto = precargaDelAlta({ fila: renglon({ texto: "MAYONESA SUELTA" }), proveedorId: MYF });
  assert.equal("factor_pack" in sinBulto, false);
  const sinImporte = renglon({ texto: "MAYONESA SUELTA", importe: 0 });
  assert.equal(costoDelRenglonParaElAlta(sinImporte), null, "bonificado o sin importe: sin costo");
  assert.equal("precio_costo" in precargaDelAlta({ fila: sinImporte, proveedorId: MYF }), false);
});

test("el formulario de alta se dibuja con lo precargado y lo demás vacío", () => {
  const precarga = precargaDelAlta({ fila: HELLMANNS(), proveedorId: MYF });
  // El formulario lee el perfil del usuario; el proveedor real lo da vacío
  // hasta consultar la sesión, que es como se dibuja la primera vez.
  const html = renderToStaticMarkup(
    React.createElement(
      UserProvider,
      null,
      React.createElement(FormProducto, {
        initialData: precarga,
        catalogos: { CATEGORIAS: [], PROVEEDORES: [{ id: MYF, nombre: "Myf" }], AREAS: [] },
        onSubmit() {},
        onCancel() {},
        submitLabel: "Crear producto",
      })
    )
  );
  assert.match(html, /value="HELLMANNS MAY LIVIANA DP 24X237G"/);
  assert.match(html, /value="35707.25"/);
  assert.match(html, /value="24"/);
  assert.match(html, />Myf</, "el proveedor viene elegido");
  assert.match(html, /Crear producto/);
});

test("el alta precargada se titula y se comporta como alta, no como edición", () => {
  const modal = codigoDe("components/productos/ModalProductoFinal.jsx");
  assert.match(modal, /title=\{initialData\?\.id \? "Editar producto" : "Nuevo producto"\}/);
  assert.match(modal, /submitLabel=\{initialData\?\.id \? "Guardar cambios" : "Crear producto"\}/);
  const form = codigoDe("components/productos/FormProducto.jsx");
  assert.match(form, /if \(!initialData\?\.id \|\| !p\.modo_envio\) \{/);
});

test("al crear, se vincula por el camino de siempre; cancelar no crea ni vincula", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /onCrearProducto=\{puedeCrearProducto \? \(\) => setCreando\(true\) : null\}/);
  assert.match(hoja, /onCancelar=\{\(\) => setCreando\(false\)\}/);
  assert.match(hoja, /setCreando\(false\);\s*await elegir\(producto\.id\);/);
  const alta = codigoDe("components/compras-proveedor/AltaDesdeElPapel.jsx");
  assert.match(alta, /fetch\(`\/api\/productos\/crear\?localId=\$\{localId\}`/);
  // El único fetch que escribe vive en `crear`, que solo corre al guardar.
  assert.equal((alta.match(/method: "POST"/g) ?? []).length, 1);
  assert.match(alta, /onSubmit=\{crear\}/);
  assert.match(alta, /onClose=\{onCancelar\}/);
});

test("el botón sigue al permiso de crear productos", () => {
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.match(pagina, /const puedeCrearProductoP = esAdminP \|\| permisosP\.includes\("productos\.crear"\);/);
  assert.match(pagina, /puedeCrearProducto=\{puedeCrearProductoP\}/);
  const ruta = codigoDe("app/api/productos/crear/route.js");
  assert.match(ruta, /checkPerm\(session, "productos\.crear"\)/);
});
