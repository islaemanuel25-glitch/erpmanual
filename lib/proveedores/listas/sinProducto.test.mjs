// PAQUETE 3 DE UNA LISTA, "SIN PRODUCTO EN TU CATÁLOGO" (2026-11-04): el botón
// del listado, el `where` único y quién lo usa.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/sinProducto.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { botonesDeLaLista } from "@/app/modulos/proveedores/listas/page";
import { filasSinProductoWhere, porConfirmarWhere } from "./puedenSer.js";
import { filaCoincideConLaBusqueda } from "./sinProducto.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Una lista abierta como la manda `GET /api/proveedores/listas`. */
const item = (sinProducto) => ({
  id: 12,
  proveedor: { id: 2, nombre: "Dab" },
  paquetes: { tusProductos: 40, puedenSer: 0, sinProducto },
});

test("el botón del paquete 3 aparece solo si hay alguno, y abre su pantalla", () => {
  assert.deepEqual(botonesDeLaLista(item(0)).map((b) => b.clave), ["TUS_PRODUCTOS"]);
  const con = botonesDeLaLista(item(3));
  const b = con.find((x) => x.clave === "SIN_PRODUCTO");
  assert.ok(b);
  assert.equal(b.href, "/modulos/proveedores/listas/12/sin-producto");
  assert.match(b.texto, /· 3$/);
  // Una cerrada no trae paquetes: no hay botón.
  assert.equal(botonesDeLaLista({ ...item(3), paquetes: null }).some((x) => x.clave === "SIN_PRODUCTO"), false);
});

test("el where: sin producto, sin aplicar y sin una propuesta de «Pueden ser de…» por confirmar", () => {
  const w = filasSinProductoWhere({ importacionId: 12, proveedorId: 2 });
  assert.equal(w.importacionId, 12);
  assert.equal(w.productoBaseId, null);
  assert.equal(w.aplicada, false);
  assert.deepEqual(w.puedenSer.none.productoBase, porConfirmarWhere({ importacionId: 12, proveedorId: 2 }).productoBase);
});

test("el número del botón y las tarjetas salen del mismo where", () => {
  const listado = codigoDe("app/api/proveedores/listas/route.js");
  assert.match(listado, /importacionListaFila\.count\(\{\s*where: filasSinProductoWhere\(/);
  const pantalla = codigoDe("app/api/proveedores/listas/[id]/sin-producto/route.js");
  assert.match(pantalla, /where: filasSinProductoWhere\(\{ importacionId, proveedorId: cab\.proveedor\?\.id \}\)/);
  assert.match(pantalla, /items: filas\.map\(filaSinProductoParaLaPantalla\)/);
});

test("lo que usa la pantalla no arrastra Prisma al navegador", () => {
  // `sinProducto.js` importaba `puedenSer.js`, que trae Prisma: la pantalla no
  // compilaba (`node:async_hooks` en el navegador). Los candados puros no lo
  // ven; lo vio `next dev`. Estos dos módulos los importa una pantalla.
  for (const rel of ["lib/proveedores/listas/sinProducto.js", "lib/proveedores/listas/altaDesdeLaLista.js"]) {
    assert.doesNotMatch(codigoDe(rel), /^\s*import\s/m, `${rel} es puro: no importa nada`);
  }
});

test("el buscador mira el código y la descripción", () => {
  const f = { codigoCrudo: "AL-0045", codigoNormalizado: "AL0045", descripcionProveedor: "ALFAJOR TRIPLE", codigoBarraProveedor: null };
  assert.equal(filaCoincideConLaBusqueda(f, ""), true);
  assert.equal(filaCoincideConLaBusqueda(f, "al-00"), true);
  assert.equal(filaCoincideConLaBusqueda(f, "triple"), true);
  assert.equal(filaCoincideConLaBusqueda(f, "coca"), false);
});
