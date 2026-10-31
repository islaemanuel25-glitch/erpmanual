// EL TAMAÑO DE UN RENGLÓN: SE MUESTRA, ORDENA LA HOJA Y SE PUEDE BUSCAR.
//
// ── EL CASO ─────────────────────────────────────────────────────────────────
//
// Probando con la lista real de Carozo (importación posterior a beab622): la
// hoja "¿Cuál es Estancia Malbec 1.125ml en la lista de Carozo?" mostraba cada
// renglón como "código · nombre" y "$ 2.332,40 por 6". En esta lista el tamaño
// está en la columna de presentación (6X750, 6X1125, 12X1000) y no en el nombre,
// así que el de 750 y el de 1.125 eran iguales en pantalla.
//
// Los renglones salen del PDF real ("VINOS CONTADO 19.10.pdf"), leído por el
// lector de verdad; sin la carpeta `erpazul-fixtures-dev` esos casos se saltean
// diciendo por qué. Las reglas sueltas corren siempre, abajo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { leerArchivoDeLista } from "@/lib/proveedores/listas/lectura/lecturaDeArchivo";
import { proponerMapeo } from "@/lib/proveedores/listas/lectura/deteccionDeColumnas";
import { filasDelArchivo } from "@/lib/proveedores/listas/importacionGenerica";
import {
  candidatasConPuntaje,
  renglonDeLaHoja,
  tamanoBuscado,
  whereDeBusquedaDeRenglones,
  grupoPorTamano,
} from "@/lib/proveedores/listas/vincularConUnaFila";
import { presentacionDelRenglon, despuesDelPrecio } from "@/lib/proveedores/listas/presentacion";
import TarjetaPorConfirmar from "@/components/proveedores/listas/TarjetaPorConfirmar";
import TarjetaProductoDeLaLista from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import { ESTADO_TU_PRODUCTO } from "@/lib/proveedores/listas/tusProductos";
import { fixturePorMarca } from "../../../scripts/test/fixturesExternos.mjs";

const { ruta, motivo } = fixturePorMarca({ marca: "vinos contado", extension: ".pdf" });
const saltear = ruta ? false : motivo;

/** Los renglones como los guarda la base: con los campos de `ImportacionListaFila`. */
let renglones = null;
async function leer() {
  if (renglones) return renglones;
  const r = await leerArchivoDeLista(new Uint8Array(fs.readFileSync(ruta)), { nombre: "VINOS CONTADO 19.10.pdf" });
  const columnas = r.tabla.titulos.map((titulo, indice) => ({ indice, titulo, valores: r.tabla.filas.map((f) => f.valores[indice]) }));
  const { filas } = filasDelArchivo({ tabla: r.tabla, mapeo: proponerMapeo(columnas).mapeo });
  renglones = filas.map((f, i) => ({
    id: i + 1,
    codigoCrudo: f.codigoCrudo,
    codigoNormalizado: f.codigoNormalizado,
    descripcionProveedor: f.descripcionProveedor,
    unidadProveedor: f.unidadProveedor,
    unidadesPorBulto: f.unidadesPorBulto,
    contenidoMl: f.contenidoMl,
    precioConIva: f.preciosPorColumna[4],
    productoBaseId: null,
  }));
  return renglones;
}

/**
 * El `where` del buscador evaluado sobre los renglones en memoria, con la misma
 * semántica que Postgres: `contains` sin distinguir mayúsculas e igualdad del
 * entero. Contra la base se ejerció aparte (con su forma exacta) en esta tanda.
 */
function cumple(where, f) {
  if (where.importacionId !== undefined && !where.OR) return true;
  return where.OR.some((c) => {
    if (c.descripcionProveedor) return String(f.descripcionProveedor).toLowerCase().includes(c.descripcionProveedor.contains.toLowerCase());
    if (c.codigoCrudo) return String(f.codigoCrudo).toLowerCase().includes(c.codigoCrudo.contains.toLowerCase());
    if (c.contenidoMl !== undefined) return f.contenidoMl === c.contenidoMl;
    return false;
  });
}

test("el renglón 86288 muestra su presentación en la hoja y en las tarjetas", { skip: saltear }, async () => {
  const filas = await leer();
  const f = filas.find((x) => x.codigoNormalizado === "86288");
  assert.equal(f.descripcionProveedor, "ESTANCIA MENDOZA MALBEC");
  assert.equal(f.contenidoMl, 750);

  // La hoja de elegir renglón: lo que dibuja debajo del nombre.
  const enLaHoja = candidatasConPuntaje({ filas: [f], nombreDelProducto: "Estancia Malbec 1.125ml" })[0];
  assert.equal(enLaHoja.contenidoMl, 750);
  assert.equal(despuesDelPrecio(enLaHoja), " · 6 × 750 ml");

  // "Pueden ser de…".
  const porConfirmar = renderToStaticMarkup(
    React.createElement(TarjetaPorConfirmar, {
      item: { productoBaseId: 1, nombre: "VINO ESTANCIA MENDOZA MALBEC 750ML", proveedoresDeHoy: "Sin proveedor", renglon: renglonDeLaHoja(f) },
    })
  );
  assert.ok(porConfirmar.includes("6 × 750 ml"), "la tarjeta de «Pueden ser de…» no muestra la presentación");

  // "Tus productos de…", vinculado.
  const vinculado = renderToStaticMarkup(
    React.createElement(TarjetaProductoDeLaLista, {
      item: {
        productoBaseId: 1,
        nombre: "VINO ESTANCIA MENDOZA MALBEC 750ML",
        estado: ESTADO_TU_PRODUCTO.MISMO_PRECIO,
        filaId: f.id,
        costoHoy: 2332.4,
        renglon: { codigo: f.codigoCrudo, descripcion: f.descripcionProveedor, precio: 2332.4, cantidad: 6, contenidoMl: 750 },
      },
      abierta: true,
    })
  );
  assert.ok(vinculado.includes("6 × 750 ml"), "la tarjeta de «Tus productos» no muestra la presentación");
});

test("para «Estancia Malbec 1.125ml» los renglones de 1125 ml van antes que los de 750 ml", { skip: saltear }, async () => {
  const filas = await leer();
  const orden = candidatasConPuntaje({ filas, nombreDelProducto: "Estancia Malbec 1.125ml" });
  const ultimoDe1125 = orden.map((c) => c.contenidoMl).lastIndexOf(1125);
  const primeroDe750 = orden.findIndex((c) => c.contenidoMl === 750);
  assert.ok(ultimoDe1125 >= 0, "no hay renglones de 1125 ml entre las candidatas");
  assert.ok(primeroDe750 >= 0, "no hay renglones de 750 ml entre las candidatas");
  assert.ok(ultimoDe1125 < primeroDe750, `un renglón de 750 ml (posición ${primeroDe750}) quedó antes que uno de 1125 ml (${ultimoDe1125})`);
  // Y adentro de los de 750, ESTANCIA MENDOZA MALBEC sigue primero por parecido.
  assert.equal(orden[primeroDe750].descripcion, "ESTANCIA MENDOZA MALBEC");
});

test("buscar «1.125» devuelve solo renglones de 1125 ml; «750» y «1125» buscan por presentación", { skip: saltear }, async () => {
  const filas = await leer();
  const con = (buscar) => filas.filter((f) => cumple(whereDeBusquedaDeRenglones({ importacionId: 1, buscar }), f));
  const de1125 = con("1.125");
  assert.ok(de1125.length > 0);
  assert.deepEqual([...new Set(de1125.map((f) => f.contenidoMl))], [1125]);
  assert.equal(de1125.length, filas.filter((f) => f.contenidoMl === 1125).length, "faltan renglones de 1125 ml");
  assert.ok(con("1125").every((f) => f.contenidoMl === 1125));
  assert.ok(con("750").some((f) => f.codigoNormalizado === "86288"));
  // Un código sigue buscándose como código: "2353" no es un tamaño.
  assert.deepEqual(con("2353").map((f) => f.codigoNormalizado), ["2353"]);
});

// ── SIN FIXTURE ─────────────────────────────────────────────────────────────

test("la presentación se arma con lo leído y no se inventa sin contenido", () => {
  assert.equal(presentacionDelRenglon({ cantidad: 6, contenidoMl: 750 }), "6 × 750 ml");
  assert.equal(presentacionDelRenglon({ cantidad: 12, contenidoMl: 1000 }), "12 × 1000 ml");
  assert.equal(presentacionDelRenglon({ cantidad: null, contenidoMl: 1125 }), "1125 ml");
  assert.equal(presentacionDelRenglon({ cantidad: 6, contenidoMl: null }), null);
  assert.equal(presentacionDelRenglon({ cantidad: 6 }), null);
  // Sin presentación, la hoja dice lo de siempre.
  assert.equal(despuesDelPrecio({ cantidad: 6, contenidoMl: null }), " por 6");
  assert.equal(despuesDelPrecio({ cantidad: 1, contenidoMl: null }), "");
});

test("el tamaño buscado sale de la misma normalización que el emparejado", () => {
  assert.equal(tamanoBuscado("1.125"), 1125);
  assert.equal(tamanoBuscado("1125"), 1125);
  assert.equal(tamanoBuscado("750"), 750);
  assert.equal(tamanoBuscado("1.125ml"), 1125);
  assert.equal(tamanoBuscado("2353"), null);
  assert.equal(tamanoBuscado("malbec"), null);
  assert.deepEqual(whereDeBusquedaDeRenglones({ importacionId: 7, buscar: "" }), { importacionId: 7 });
  assert.deepEqual(whereDeBusquedaDeRenglones({ importacionId: 7, buscar: "1.125" }).OR.at(-1), { contenidoMl: 1125 });
  assert.equal(grupoPorTamano("1125ml", "1125ml"), 0);
  assert.equal(grupoPorTamano("1125ml", null), 1);
  assert.equal(grupoPorTamano(null, "750ml"), 1);
  assert.equal(grupoPorTamano("1125ml", "750ml"), 2);
});
