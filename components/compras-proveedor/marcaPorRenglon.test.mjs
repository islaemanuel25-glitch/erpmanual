// LA MARCA DE "REVISADA" ES DEL RENGLÓN DEL PAPEL, Y ES UN HECHO GUARDADO.
//
// ── LOS DOS DEFECTOS QUE TRAJERON ESTE CANDADO ────────────────────────────
//
// 1. SE PERDÍA AL REFRESCAR. La marca vivía en el estado de React y en ningún
//    lado más —ni en la base ni en el `sessionStorage`, que solo guarda las
//    cantidades recibidas y los kilos—. Un refresco volvía a 0 de 15 revisadas
//    MIENTRAS las cantidades y las decisiones de precio sí sobrevivían, o sea
//    que la pantalla quedaba en un estado que nadie había dejado.
//
// 2. DOS RENGLONES COMPARTÍAN LA MARCA. El mapa se indexaba por
//    `pedidoDetalleId`, y dos renglones de una factura pueden apuntar a la
//    misma línea del pedido: medido sobre el comprobante 5 del pedido 232, las
//    líneas 120 y 121 van las dos al detalle 2565. Marcar una marcaba la otra,
//    y el contador de arriba contaba dos sobre un solo toque.
//
// El segundo no se veía: las dos tarjetas son del mismo producto, así que un
// tilde de más se lee como que uno se apuró.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** Un candado que mira código saca los comentarios antes de mirar. */
const sinComentarios = (txt) =>
  txt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

// Las dos líneas reales que comparten línea de pedido, con la forma que
// devuelve el endpoint: el detalle 2565 aparece en las dos.
const DETALLES = [
  { id: 2565, productoBaseId: 2019, nombre: "Marlboro 20 Crafted Box", cantidad: 4, precioCosto: 40500, unidad: "BULTO" },
];
const comprobanteCon = (lineas) => [
  { id: 5, estado: "SIN_TOTAL", tipo: "FC", puntoVenta: "0003", numero: "00012345", lineas },
];
const linea = (id, extra = {}) => ({
  id,
  textoCrudo: "M.CRAFTED 20 BOX",
  cantidad: 2,
  subtotalImpreso: 81000,
  productoLocalId: 6100,
  pedidoDetalleId: 2565,
  pedidoDetalle: DETALLES[0],
  precio: { precioAEscribir: 40500 },
  ...extra,
});

test("la fila lleva la marca del RENGLÓN, tal como la guarda la base", () => {
  const r = filasDeConciliacion({
    comprobantes: comprobanteCon([
      linea(120, { revisadoEnRecepcion: true, revisadoEnRecepcionAt: new Date("2026-09-21T10:00:00Z") }),
      linea(121),
    ]),
    detalles: DETALLES,
  });
  const [a, b] = r.grupos[0].filas;

  assert.equal(a.lineaId, 120);
  assert.equal(a.revisada, true);
  assert.ok(a.revisadaEn instanceof Date, "se guarda cuándo, no solo que sí");

  // LA OTRA NO SE CONTAGIA, y las dos apuntan a la misma línea del pedido.
  assert.equal(b.lineaId, 121);
  assert.equal(b.pedidoDetalleId, a.pedidoDetalleId, "el fixture tiene que ser el caso real");
  assert.equal(b.revisada, false);
});

test("sin la columna, la fila dice que NO está revisada", () => {
  // Una línea vieja, anterior a la migración, llega sin la bandera. No se
  // inventa un `true`: nadie la controló con este mecanismo porque no existía.
  const r = filasDeConciliacion({
    comprobantes: comprobanteCon([linea(120)]),
    detalles: DETALLES,
  });
  assert.equal(r.grupos[0].filas[0].revisada, false);
});

test("LA LISTA INDEXA POR RENGLÓN, no por línea de pedido", () => {
  const lista = sinComentarios(leer("components/compras-proveedor/ListaDeLaFactura.jsx"));
  const criterio = lista.match(/const yaRevisada = [^;]+;/);
  assert.ok(criterio, "se fue el criterio de qué línea está revisada");
  assert.match(criterio[0], /lineaId/, "volvió a indexarse por otra cosa");
  assert.doesNotMatch(
    criterio[0],
    /pedidoDetalleId/,
    "con la línea del pedido como clave, marcar un renglón marca el otro"
  );
  // Y la verdad sale de la fila, no solo del estado de la pantalla.
  assert.match(criterio[0], /revisada/, "el eco de la pantalla tapó lo que dice la base");
});

test("LA RUTA ESCRIBE LAS TRES COLUMNAS, Y DESMARCAR LAS BORRA", () => {
  const ruta = sinComentarios(
    leer("app/api/compras-proveedor/comprobantes/marcar-revisada/route.js")
  );
  assert.match(ruta, /revisadoEnRecepcion: revisada/);
  assert.match(ruta, /revisadoEnRecepcionPorId: revisada \? session\?\.id \?\? null : null/);
  assert.match(ruta, /revisadoEnRecepcionAt: revisada \? new Date\(\) : null/);
  // ── EL ALCANCE POR GRUPO NO SE NEGOCIA, Y AHORA VIVE UN PISO MÁS ABAJO ──
  //
  // Acá se afirmaba el `comprobante: { grupoId }` escrito en esta ruta. La
  // búsqueda del renglón se mudó a `resolverLineaDelPapel` —las tres rutas del
  // control la comparten desde que un id muerto por una relectura contestaba
  // "No existe esa línea."— así que el literal ya no está en este archivo.
  //
  // El alcance SIGUE, y se afirma donde ahora vive: la ruta le pasa el grupo, y
  // el módulo lo mete en las dos consultas. Sin esta segunda mitad, esto sería
  // un candado que dejó de mirar donde ocurre el problema.
  assert.match(ruta, /resolverLineaDelPapel\(prisma, \{\s*grupoId,/);
  const resolutor = sinComentarios(
    leer("lib/compras-proveedor/comprobante/resolverLineaDelPapel.js")
  );
  assert.match(resolutor, /where: \{ id, comprobante: \{ grupoId,/);
  assert.match(resolutor, /where: \{ comprobante: \{ grupoId, pedidoId: pedido \} \}/);
  assert.match(ruta, /checkPerm\(session, "compras\.recibir"\)/);
});

test("CONTRAPRUEBA: el patrón del criterio señala la versión vieja", () => {
  // Sin esto no se sabe si el candado de arriba afirma algo: se comprueba que
  // el criterio anterior —el que compartía la marca entre dos renglones— sí
  // dispara las dos afirmaciones.
  const viejo = "const yaRevisada = (f) => !!revisadas?.[f?.pedidoDetalleId];";
  assert.match(viejo, /pedidoDetalleId/);
  assert.doesNotMatch(viejo, /lineaId/);
});
