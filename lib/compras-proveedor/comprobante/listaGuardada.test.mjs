// LA LISTA GUARDADA DEL PROVEEDOR, COMO CATÁLOGO DE LA RECEPCIÓN.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/listaGuardada.test.mjs
//
// El caso: pedido 654 de Arcor (2026-11-17). Siete renglones quedaban "Sin
// vincular" con la lista de Arcor subida: sus renglones de la lista no tenían
// producto y la recepción solo miraba los vínculos de código.
//
// Todos los datos son de producción, leídos el 2026-11-17: los siete renglones
// del papel (líneas 1068, 1069, 1077, 1092 a 1095 de los comprobantes 96 y 97),
// sus siete renglones de la importación 6 —la última de Arcor sin cancelar, con
// recargo 5 % e impuesto 0—, los dos vínculos de código del producto 217 (con
// y sin el prefijo "10" de Arcor) con sus dos renglones de la lista, y el
// renglón 20069 de la importación 28 del proveedor 17, que tiene producto y
// ningún vínculo de código.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  armarListaGuardada,
  filaDeLaListaSinProducto,
  vinculosDeLaListaGuardada,
} from "./listaGuardada.js";
import { buscarProductoDeLaLinea, analizarLineas } from "./analisisDeComprobante.js";
import { filasDeConciliacion } from "./filasDeConciliacion.js";
import { ORIGEN_VINCULO } from "./vinculo.js";
import {
  PRECIO_ES,
  TEXTO_CREAR_DESDE_LA_LISTA,
  costoDelAltaDesdeLaLista,
  detalleDelRenglonDeLaLista,
  lecturaRecordadaDelAlta,
} from "@/lib/proveedores/listas/costoDelAltaDesdeLaLista";
import { precargaDelAltaDesdeLaLista } from "@/lib/proveedores/listas/altaDesdeLaLista";
import HojaCorregirLinea from "@/components/compras-proveedor/HojaCorregirLinea.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ARCOR = 20;
// La cabecera de la importación 6, como la devuelve Prisma (Decimal → string).
const CABECERA_6 = { id: 6, recargoPct: "5", impuestoAdicionalPct: "0" };

// Los renglones de la importación 6, con los campos de `CAMPOS_FILA_LISTA_GUARDADA`.
const fila = (id, codigo, descripcion, unidadesPorBulto, precioConIva, productoBaseId = null) => ({
  id,
  codigoCrudo: codigo,
  codigoNormalizado: codigo,
  descripcionProveedor: descripcion,
  codigoBarraProveedor: null,
  precioConIva,
  unidadesPorBulto,
  costoMaestroPropuesto: null,
  costoUnitarioCalculado: null,
  productoBaseId,
});
const LAS_SIETE = [
  fila(5422, "14230", "TABL. TOP LINE MENTA 20x6,7G", 24, "7162.658404"),
  fila(5423, "15052", "TABL. TOP LINE STRONG 20X6.7G", 24, "7162.654653"),
  fila(5442, "15117", "MR POP EXPLOSIVE FRUTILLA 20u x 10G", 10, "11601.857036"),
  fila(5430, "15518", "TOPLINE 7 MANDARINA 16x24g", 20, "12445.359289"),
  fila(5451, "10131", "MENTHO PLUS MIEL 12u x 29,4g", 12, "5735.761911"),
  fila(5452, "10132", "MENTHO PLUS MENTA 12u x 29,4g", 12, "5735.761911"),
  fila(5431, "15519", "TOPLINE 7 STRAWBERRY 16x24g", 20, "12445.359289"),
];
// Dos renglones vinculados al producto 217, que tiene vínculo de código con y
// sin el prefijo "10". El 4928 lo vinculó la lista por terminación.
const DEL_217 = [
  fila(4928, "12631", "PRESTO. ESPINA/CREMA x 250g", null, null, 217),
  fila(5369, "2631", "MOGUL x 500Grs DIENTES (86u)", null, null, 217),
];
const VINCULOS_217 = [
  { codigoInterno: "1002631", productoBaseId: 217, activo: true },
  { codigoInterno: "2631", productoBaseId: 217, activo: true },
];

// Los siete renglones del papel: código, texto, cantidad e importe.
const PAPEL = [
  { id: 1092, codigoProveedor: "14230", textoCrudo: "TABL. TOP LINE MENTA 20x6,7G", cantidad: 6, costoFinalRenglon: 29989.22, fila: 5422 },
  { id: 1093, codigoProveedor: "15052", textoCrudo: "TABL. TOP LINE STRONG 20X6.7G", cantidad: 6, costoFinalRenglon: 29989.2, fila: 5423 },
  { id: 1094, codigoProveedor: "15117", textoCrudo: "MR POP EXPLOSIVE FRUTILLA 20u x 10", cantidad: 3, costoFinalRenglon: 16191.87, fila: 5442 },
  { id: 1095, codigoProveedor: "15518", textoCrudo: "TABL. TOP LINE 7 MANDARINA 16x14g", cantidad: 3, costoFinalRenglon: 37336.83, fila: 5430 },
  { id: 1068, codigoProveedor: "10131", textoCrudo: "MENTHO PLUS MIEL 12u x 29,4g", cantidad: 3, costoFinalRenglon: 17207.29, fila: 5451 },
  { id: 1069, codigoProveedor: "10132", textoCrudo: "MENTHO PLUS MENTA 12u x 29,4g", cantidad: 3, costoFinalRenglon: 17207.29, fila: 5452 },
  { id: 1077, codigoProveedor: "15519", textoCrudo: "TABL. TOP LINE 7 STRAWBERRY 16x24g", cantidad: 3, costoFinalRenglon: 37336.07, fila: 5431 },
];

const listaDeArcor = () =>
  armarListaGuardada(
    { cabecera: CABECERA_6, filas: [...LAS_SIETE, ...DEL_217], vinculosDelProveedor: VINCULOS_217 },
    { universo: new Set([217]) }
  );

/** El contexto de la cascada, con el universo y los vínculos del proveedor. */
const contextoCon = (listaGuardada, { vinculos = [], universo = [] } = {}) => ({
  datos: {
    codigosProveedor: vinculos.map((v, i) => ({ id: i + 1, descripcionProveedor: null, unidadesPorPresentacion: null, ...v })),
    productos: universo.map((id) => ({ productoBaseId: id, nombre: `Producto ${id}` })),
    lecturasRecordadas: new Map(),
  },
  listaGuardada,
  catalogo: [],
  catalogoNormalizado: [],
  nombrePorBase: new Map(universo.map((id) => [id, `Producto ${id}`])),
  datosPorBase: new Map(),
  decisionPorBase: new Map(),
});

test("los siete renglones de Arcor encuentran su renglón de la lista guardada, por código", () => {
  const lista = listaDeArcor();
  for (const l of PAPEL) {
    const r = filaDeLaListaSinProducto({ linea: l, listaGuardada: lista });
    assert.ok(r, `la línea ${l.id} (${l.codigoProveedor}) tiene renglón en la lista`);
    assert.equal(r.fila.id, l.fila, `la línea ${l.id} va al renglón ${l.fila}`);
    assert.equal(r.importacionId, 6);
    assert.deepEqual(r.cuentaDeLaLista, { recargoPct: 5, impuestoAdicionalPct: 0 });
    // Con la forma de `GET sin-producto`: el precio como número.
    assert.equal(typeof r.fila.precioConIva, "number");
  }
});

test("la lista de Arcor no suma vínculos: los que tienen producto ya tienen código vinculado", () => {
  // Medido en producción con la importación 6: 0. Comparando el texto exacto
  // sumaba 135, por el prefijo "10" que la lista no trae.
  assert.deepEqual(vinculosDeLaListaGuardada(listaDeArcor()), []);
});

test("y la cascada no los vincula sola: no tienen producto, así que se ofrecen crear", () => {
  const ctx = contextoCon(listaDeArcor(), { vinculos: VINCULOS_217, universo: [217] });
  for (const l of PAPEL) {
    const r = buscarProductoDeLaLinea({ linea: { codigoProveedor: l.codigoProveedor, descripcion: l.textoCrudo }, contexto: ctx });
    assert.equal(r.vinculoAutomatico, null, `la línea ${l.id} no se vincula a nada`);
  }
});

test("un código que ya tiene vínculo no se ofrece crear desde la lista", () => {
  // 2631 es el código del producto 217: el renglón 5369 tiene producto y el
  // papel se vincula por el vínculo de siempre, no por la lista.
  const lista = listaDeArcor();
  assert.equal(filaDeLaListaSinProducto({ linea: { codigoProveedor: "2631" }, listaGuardada: lista }), null);
  // Sin código no hay nada que buscar: la lista vincula por código.
  assert.equal(filaDeLaListaSinProducto({ linea: { codigoProveedor: null }, listaGuardada: lista }), null);
  // Sin lista guardada, tampoco.
  assert.equal(filaDeLaListaSinProducto({ linea: PAPEL[0], listaGuardada: null }), null);
});

// ── EL PUNTO a: UN RENGLÓN DE LA LISTA CON PRODUCTO VINCULA SOLO ─────────
//
// Proveedor 17, importación 28: el renglón 20069 está vinculado al 2320 y el
// producto no tiene ningún vínculo de código con el proveedor. Antes, una
// boleta con ese código no lo encontraba.
const P17_FILA = { ...fila(20069, "1200008852", "VALENCIANO PEPA 150GRX28", null, "768.69", 2320), codigoBarraProveedor: "7798126074342" };
const P17_VINCULO = { codigoInterno: "3110001028", productoBaseId: 1490, activo: true };
const listaDel17 = (vinculosDelProveedor = [P17_VINCULO], universo = [2320, 1490]) =>
  armarListaGuardada(
    { cabecera: { id: 28, recargoPct: null, impuestoAdicionalPct: null }, filas: [P17_FILA], vinculosDelProveedor },
    { universo: new Set(universo) }
  );
const PAPEL_17 = { codigoProveedor: "1200008852", descripcion: "VALENCIANO PEPA 150GRX28" };

test("un renglón de la lista con producto vincula solo, por el código", () => {
  const lista = listaDel17();
  const ctx = contextoCon(lista, { vinculos: [P17_VINCULO], universo: [2320, 1490] });
  const r = buscarProductoDeLaLinea({ linea: PAPEL_17, contexto: ctx });
  assert.equal(r.vinculoAutomatico?.productoBaseId, 2320);
  assert.equal(r.origen, ORIGEN_VINCULO.CODIGO_PROVEEDOR);
  // Sin la lista, el mismo papel no se vinculaba.
  const antes = buscarProductoDeLaLinea({ linea: PAPEL_17, contexto: { ...ctx, listaGuardada: null } });
  assert.equal(antes.vinculoAutomatico, null);
});

test("la lista no resucita un vínculo dado de baja, ni vincula fuera del universo, ni le da un segundo código a un producto", () => {
  const dadoDeBaja = { codigoInterno: "1200008852", productoBaseId: 2320, activo: false };
  assert.deepEqual(vinculosDeLaListaGuardada(listaDel17([P17_VINCULO, dadoDeBaja])), []);
  assert.deepEqual(vinculosDeLaListaGuardada(listaDel17([P17_VINCULO], [1490])), [], "2320 no es del proveedor");
  const otroCodigo = { codigoInterno: "3110009999", productoBaseId: 2320, activo: true };
  assert.deepEqual(vinculosDeLaListaGuardada(listaDel17([P17_VINCULO, otroCodigo])), []);
  // Y ese renglón, que TIENE producto, tampoco se ofrece crear: el producto ya existe.
  assert.equal(filaDeLaListaSinProducto({ linea: PAPEL_17, listaGuardada: listaDel17([P17_VINCULO, otroCodigo]) }), null);
  // Y vincula por código, no por el texto: sin descripción.
  assert.equal(vinculosDeLaListaGuardada(listaDel17())[0].descripcionProveedor, null);
});

// ── EL PUNTO b: LO QUE SE PRECARGA Y LO QUE SE RECUERDA ───────────────────

test("el alta desde la lista precarga nombre, proveedor, bulto y el costo con la cuenta de la lista", () => {
  const r = filaDeLaListaSinProducto({ linea: PAPEL[0], listaGuardada: listaDeArcor() });
  const { recargoPct, impuestoAdicionalPct } = r.cuentaDeLaLista;
  const p = precargaDelAltaDesdeLaLista({
    fila: r.fila,
    proveedorId: ARCOR,
    costo: costoDelAltaDesdeLaLista({ fila: r.fila, recargoPct, impuestoAdicionalPct }),
  });
  assert.equal(p.nombre, "TABL. TOP LINE MENTA 20x6,7G");
  assert.equal(p.proveedor_id, ARCOR);
  assert.equal(p.unidad_medida, "pack");
  assert.equal(p.factor_pack, 24);
  assert.equal("precio_costo" in p, false, "con bulto, el costo espera la respuesta");
  // 7.162,66 + 5 % de recargo.
  assert.equal(costoDelAltaDesdeLaLista({ fila: r.fila, recargoPct, impuestoAdicionalPct, precioEs: PRECIO_ES.CAJA }), 7520.79);
  assert.equal(detalleDelRenglonDeLaLista(r.fila), "Código 14230 · 24 por caja · $ 7.162,66");
  // Lo elegido se recuerda con el bulto de la LISTA, no con el del papel.
  assert.deepEqual(lecturaRecordadaDelAlta({ fila: r.fila, precioEs: PRECIO_ES.UNIDAD }), {
    clave: "PACK_24",
    multiplicador: 24,
    cantidad: null,
  });
});

// ── EL CAMINO: DE LA CONCILIACIÓN A LA HOJA DE CORREGIR ───────────────────

/** La línea 1092 tal como la arma la conciliación del pedido, con la lista. */
function filaDeLaPantalla() {
  const l = PAPEL[0];
  const [analizada] = analizarLineas({
    comprobante: {
      id: 97,
      proveedor: { id: ARCOR },
      lineas: [{
        id: l.id, orden: 1, textoCrudo: l.textoCrudo, codigoProveedor: l.codigoProveedor, cantidad: l.cantidad,
        costoFinalRenglon: l.costoFinalRenglon, subtotalImpreso: l.costoFinalRenglon, netoUnitario: l.costoFinalRenglon / l.cantidad,
        productoLocalId: null, pedidoDetalleId: null, tipoRenglon: "MERCADERIA",
      }],
    },
    contexto: contextoCon(listaDeArcor(), { vinculos: VINCULOS_217, universo: [217] }),
  });
  return filasDeConciliacion({ comprobantes: [{ id: 97, estado: "CARGADO", lineas: [analizada] }], detalles: [] }).grupos[0].filas[0];
}

test("la fila de la pantalla lleva el renglón de la lista hasta la hoja", () => {
  const f = filaDeLaPantalla();
  assert.equal(f.productoBaseId, null);
  assert.equal(f.filaDeLaLista?.fila.id, 5422);
});

test("la hoja de Corregir ofrece crear con los datos de la lista, solo con permiso de crear productos", () => {
  const fila = filaDeLaPantalla();
  const dibujar = (puedeCrearProducto) =>
    renderToStaticMarkup(
      React.createElement(HojaCorregirLinea, { fila, abierta: true, onCerrar() {}, onGuardar() {}, onVincular() {}, proveedorId: ARCOR, puedeCrearProducto })
    );
  const con = dibujar(true);
  assert.match(con, new RegExp(TEXTO_CREAR_DESDE_LA_LISTA));
  assert.match(con, /TABL\. TOP LINE MENTA 20x6,7G/);
  assert.match(con, /Código 14230 · 24 por caja/);
  assert.doesNotMatch(dibujar(false), new RegExp(TEXTO_CREAR_DESDE_LA_LISTA));
});

// ── DESPUÉS DE CREAR, LA HOJA SIGUE EN LA LÍNEA (Emanuel, 2026-11-18) ────
//
// El producto recién creado es el que arma el alta con el renglón 5422: lo
// precargado por `precargaDelAltaDesdeLaLista`, con el costo de "Por la caja".
// El id lo pone la base al crear; acá cualquiera, porque la línea llega a la
// hoja por su código vinculado, como llega la próxima boleta.
const RECIEN_CREADO = 9001;
const LOCAL_RECIEN_CREADO = 19001;
function filaYaVinculada() {
  const l = PAPEL[0];
  const lista = listaDeArcor();
  const r = filaDeLaListaSinProducto({ linea: l, listaGuardada: lista });
  const costo = costoDelAltaDesdeLaLista({ fila: r.fila, ...r.cuentaDeLaLista, precioEs: PRECIO_ES.CAJA });
  const ficha = { id: RECIEN_CREADO, ...precargaDelAltaDesdeLaLista({ fila: r.fila, proveedorId: ARCOR, costo }) };
  const ctx = contextoCon(lista, {
    vinculos: [...VINCULOS_217, { codigoInterno: "14230", productoBaseId: RECIEN_CREADO, activo: true }],
    universo: [217, RECIEN_CREADO],
  });
  ctx.datosPorBase = new Map([[RECIEN_CREADO, ficha]]);
  ctx.nombrePorBase = new Map([[RECIEN_CREADO, ficha.nombre]]);
  const [analizada] = analizarLineas({
    comprobante: {
      id: 97,
      proveedor: { id: ARCOR },
      lineas: [{
        id: l.id, orden: 1, textoCrudo: l.textoCrudo, codigoProveedor: l.codigoProveedor, cantidad: l.cantidad,
        costoFinalRenglon: l.costoFinalRenglon, subtotalImpreso: l.costoFinalRenglon, netoUnitario: l.costoFinalRenglon / l.cantidad,
        // Como la deja la ruta de vincular: el renglón con su producto del local.
        productoLocalId: LOCAL_RECIEN_CREADO, pedidoDetalleId: null, tipoRenglon: "MERCADERIA",
      }],
    },
    contexto: ctx,
    porProductoLocal: new Map([[LOCAL_RECIEN_CREADO, { baseId: RECIEN_CREADO }]]),
  });
  return filasDeConciliacion({ comprobantes: [{ id: 97, estado: "CARGADO", lineas: [analizada] }], detalles: [] }).grupos[0].filas[0];
}

test("con la línea ya vinculada, la hoja abre lista para «Revisado y seguir», sin volver a elegir producto", () => {
  const fila = filaYaVinculada();
  assert.equal(fila.productoBaseId, RECIEN_CREADO);
  assert.equal(fila.filaDeLaLista, null, "ya tiene producto: no se ofrece crear de nuevo");
  const html = renderToStaticMarkup(
    React.createElement(HojaCorregirLinea, { fila, abierta: true, onCerrar() {}, onGuardar() {}, onVincular() {}, proveedorId: ARCOR, puedeCrearProducto: true })
  );
  assert.match(html, /Revisado y seguir/);
  assert.doesNotMatch(html, /Qué producto es/);
  assert.doesNotMatch(html, new RegExp(TEXTO_CREAR_DESDE_LA_LISTA));
  assert.match(html, /TABL\. TOP LINE MENTA 20x6,7G/);
});

test("la página no cierra la hoja al vincular lo creado desde la lista: la reabre con la fila nueva", () => {
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  // Solo lo creado desde la lista sigue; cualquier otro vínculo cierra como siempre.
  assert.match(pagina, /if \(extra\?\.filaListaId\) setSeguirEnLaLinea\(claveDeFila\(fila\)\);\s*else setLineaACorregir\(null\);/);
  // Espera la fila CON producto: la de antes de vincular no sirve.
  assert.match(pagina, /if \(nueva\?\.productoBaseId != null\) \{\s*setLineaACorregir\(nueva\);\s*setSeguirEnLaLinea\(null\);/);
  assert.match(pagina, /\}, \[filasDeFactura, seguirEnLaLinea\]\);/);
  // Cerrarla a propósito no la reabre, y mientras espera no se puede crear otra vez.
  assert.match(pagina, /onCerrar=\{\(\) => \{\s*setSeguirEnLaLinea\(null\);\s*setLineaACorregir\(null\);/);
  assert.match(pagina, /guardando=\{seguirEnLaLinea != null\}/);
});

test("al crear, el producto se vincula por el camino de siempre con el renglón de la lista", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /await elegir\(producto\.id, \{ \.\.\.extra, filaListaId: delaLista\.fila\?\.id \?\? null \}\);/);
  assert.match(hoja, /cuentaDeLaLista=\{delaLista\.cuentaDeLaLista\}/);
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.match(pagina, /\.\.\.\(extra\?\.filaListaId \? \{ filaListaId: extra\.filaListaId \} : \{\}\)/);
  // La ruta vuelve a leer el renglón, y solo de una lista del mismo proveedor.
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/vincular/route.js");
  assert.match(ruta, /importacion: \{ grupoId, proveedorId: proveedorDelPapel \}/);
  assert.match(ruta, /lecturaRecordadaDelAlta\(\{ fila: filaDeLaLista, precioEs/);
});
