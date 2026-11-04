// LA REGLA ÚNICA DE UNIDADES, TANDA 2: LA SIEMBRA DESDE FACTURA LEE LA FICHA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/unidades/siembraConLaFicha.test.mjs
//
// ── EL DEFECTO ─────────────────────────────────────────────────────────────
//
// Relevamiento del 2026-11-04: la siembra le pasaba a `costoParaUnidad` el
// producto sin `factor_pack` —su consulta traía `{ id, precio_costo, es_combo }`—
// y no se enteraba de que era un pack. La misma línea por unidad salía a $38.400
// en la siembra y a $3.200 en la importación. Es la familia del durazno del
// pedido 491. El candado que había afirmaba que la siembra LLAMABA a
// `costoParaUnidad`, y eso era verdad: no miraba qué ficha le pasaba.
//
// Las filas se arman con las mismas funciones que la pantalla —`analizarPrecioDeLinea`
// y `filasDeConciliacion`— y el plan con las de la siembra.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { costoEnLaUnidad } from "./reglaDeUnidades.js";
import { costoParaUnidad } from "../compras-proveedor/importacion/merge.js";
import { analizarPrecioDeLinea } from "../compras-proveedor/comprobante/precioDeLinea.js";
import { filasDeConciliacion } from "../compras-proveedor/comprobante/filasDeConciliacion.js";
import { cantidadParaElPedido, lineaSembradaQueRehacer, loQueHayQueSembrar } from "../compras-proveedor/pedidoDesdeFactura.js";
import { hayDiferenciaDePrecio, motivoSinComparacion } from "../compras-proveedor/estadoDeLineaFacturada.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Lo que la siembra le pide a la base de cada producto, leído de su consulta. */
function fichaQueTraeLaSiembra() {
  const siembra = codigoDe("lib/compras-proveedor/sembrarPedidoDesdeFactura.js");
  const i = siembra.indexOf("prisma.productoLocal.findMany(");
  assert.ok(i > 0, "la siembra dejó de buscar los productos de la ubicación");
  const consulta = siembra.slice(i, siembra.indexOf("});", i));
  const campos = {};
  for (const m of consulta.matchAll(/\b([a-zA-Z_]+): true\b/g)) campos[m[1]] = true;
  return campos;
}

/** El producto de la base con solo los campos que la siembra pide. */
function comoLoVeLaSiembra(producto) {
  const pide = fichaQueTraeLaSiembra();
  return Object.fromEntries(Object.entries(producto).filter(([k]) => pide[k]));
}

/** La fila de la tarjeta de un pedido nacido de factura. */
function fila({ linea, producto, detalle, unidadElegida = null }) {
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "P" }, unidadElegida });
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 1, estado: "CARGADO", lineas: [{ ...linea, id: 1, pedidoDetalleId: detalle.id, productoLocalId: 1, pedidoDetalle: detalle, precio, unidad: precio.unidad, decisionPrecio: null, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [detalle],
    nacidoDeFactura: true,
  }).grupos[0].filas;
  return { ...f, id: 1, productoBaseId: detalle.productoBaseId, variacionNormalPct: 10 };
}

const PACK12 = { id: 1, precio_costo: 38400, es_combo: false, factor_pack: 12, unidad_medida: "pack", modoCompraProveedor: "BULTO", sueltos_por_unidad: null };

test("UNIDAD: LA SIEMBRA DA $3.200, LA MISMA ESCALA QUE LA PIEZA Y QUE LA IMPORTACIÓN", () => {
  const visto = comoLoVeLaSiembra(PACK12);
  // La pieza: $38.400 el bulto de 12 son $3.200 la unidad.
  const pieza = costoEnLaUnidad({ costo: 38400, de: "BULTO", a: "UNIDAD", base: PACK12 });
  assert.equal(pieza, 3200);
  // La siembra, con el producto como lo trae su consulta.
  assert.equal(costoParaUnidad({ costoMaestro: 38400, unidad: "UNIDAD", producto: visto }), pieza, "salía $38.400: sin ficha no hay pack");
  // La importación, con su producto de siempre.
  assert.equal(costoParaUnidad({ costoMaestro: 38400, unidad: "UNIDAD", producto: { factor_pack: 12, modoCompra: "BULTO" } }), pieza);
  // Por bulto, el costo maestro tal cual.
  assert.equal(costoParaUnidad({ costoMaestro: 38400, unidad: "BULTO", producto: visto }), 38400);
});

test("UN PAPEL QUE NO DEJA SABER LA ESCALA SE SIEMBRA EN UNIDAD AL COSTO DE LA UNIDAD", () => {
  // 12 a $9.000 contra el pack de 12 a $38.400: ni la unidad ni el bulto.
  const linea = { orden: 1, textoCrudo: "X", cantidad: 12, netoUnitario: 9000, subtotalImpreso: 108000, costoFinalRenglon: 108000 };
  const f = fila({ linea, producto: PACK12, detalle: { id: 1, cantidad: 12, precioCosto: 3200, unidad: "UNIDAD", productoBaseId: 1, factorPack: 12 } });
  const cuanto = cantidadParaElPedido(f);
  assert.deepEqual(cuanto, { cantidad: 12, unidad: "UNIDAD" });
  assert.equal(costoParaUnidad({ costoMaestro: 38400, unidad: cuanto.unidad, producto: comoLoVeLaSiembra(PACK12) }), 3200);
});

test("CUANDO ALGUIEN ELIGE LA ESCALA, LA LÍNEA SEMBRADA EN UNIDAD PASA A BULTO Y LA TARJETA OFRECE", () => {
  // Pack de 2 a $1.500, 10 a $1.000: las dos lecturas caen, y se sembró en
  // UNIDAD a $750. Alguien eligió "por unidad": son 5 bultos de 2 a $2.000.
  const PACK2 = { id: 2, precio_costo: 1500, es_combo: false, factor_pack: 2, unidad_medida: "pack", modoCompraProveedor: "BULTO", sueltos_por_unidad: null };
  const linea = { orden: 1, textoCrudo: "Y", cantidad: 10, netoUnitario: 1000, subtotalImpreso: 10000, costoFinalRenglon: 10000 };
  const sembrada = { id: 2, cantidad: 10, precioCosto: 750, unidad: "UNIDAD", productoBaseId: 2, factorPack: 2, cantidadRecibida: null, unidadesFisicas: null, kgRecibidos: null, costoMaestroHoy: 1500 };
  const elegida = fila({ linea, producto: PACK2, detalle: sembrada, unidadElegida: "POR_UNIDAD" });
  // Sin rehacer, la tarjeta comparaba el bulto del papel contra la unidad de la línea.
  assert.notEqual(motivoSinComparacion(elegida), null);

  const [dictado] = loQueHayQueSembrar({ filas: [elegida], detalles: [{ id: 2, productoBaseId: 2 }] }).dictadoDeLasExistentes;
  assert.deepEqual([dictado.cantidad, dictado.unidad], [5, "BULTO"]);
  const visto = comoLoVeLaSiembra(PACK2);
  const rehecha = lineaSembradaQueRehacer({
    detalle: sembrada,
    dictado,
    precioEnSuUnidad: costoParaUnidad({ costoMaestro: 1500, unidad: sembrada.unidad, producto: visto }),
    precioDictado: costoParaUnidad({ costoMaestro: 1500, unidad: dictado.unidad, producto: visto }),
    base: visto,
  });
  assert.deepEqual(rehecha, { cantidad: 5, unidad: "BULTO", precioCosto: 1500 });

  const despues = fila({ linea, producto: PACK2, detalle: { ...sembrada, ...rehecha }, unidadElegida: "POR_UNIDAD" });
  assert.equal(motivoSinComparacion(despues), null);
  assert.equal(hayDiferenciaDePrecio(despues), true, "+33 %: se ofrece decidir");

  // Y la elección corre la siembra, como vincular.
  const correccion = codigoDe("app/api/compras-proveedor/recepcion/correccion/route.js");
  assert.match(correccion, /if \(unidadGuardadaEn != null \|\| presentacionGuardada != null\) \{/);
  assert.match(correccion, /sembrarPedidoDesdeFactura\(prisma, \{ pedidoId, grupoId, localId \}\)/);
  // Leyendo la elección, igual que la pantalla.
  assert.match(codigoDe("lib/compras-proveedor/sembrarPedidoDesdeFactura.js"), /unidadElegida: true/);
});

test("CONTRAPRUEBA: UN PRODUCTO POR UNIDAD, SIN PACK, SE SIEMBRA COMO SIEMPRE", () => {
  const SUELTO = { id: 3, precio_costo: 1500, es_combo: false, factor_pack: null, unidad_medida: "unidad", modoCompraProveedor: "BULTO", sueltos_por_unidad: null };
  const linea = { orden: 1, textoCrudo: "Z", cantidad: 12, netoUnitario: 1550, subtotalImpreso: 18600, costoFinalRenglon: 18600 };
  const detalle = { id: 3, cantidad: 12, precioCosto: 1500, unidad: "BULTO", productoBaseId: 3, factorPack: null, cantidadRecibida: null, unidadesFisicas: null, kgRecibidos: null };
  const f = fila({ linea, producto: SUELTO, detalle });
  // 12 en la escala del pedido, al costo del producto tal cual: sin pack no hay
  // nada que dividir, en ninguna unidad.
  assert.deepEqual(cantidadParaElPedido(f), { cantidad: 12, unidad: "BULTO" });
  const visto = comoLoVeLaSiembra(SUELTO);
  assert.equal(costoParaUnidad({ costoMaestro: 1500, unidad: "BULTO", producto: visto }), 1500);
  assert.equal(costoParaUnidad({ costoMaestro: 1500, unidad: "UNIDAD", producto: visto }), 1500);
  // Y la línea, que coincide con el papel, no se rehace.
  const [dictado] = loQueHayQueSembrar({ filas: [f], detalles: [{ id: 3, productoBaseId: 3 }] }).dictadoDeLasExistentes;
  assert.equal(
    lineaSembradaQueRehacer({ detalle, dictado, precioEnSuUnidad: 1500, precioDictado: 1500, base: visto }),
    null
  );
});

test("CONTRAPRUEBA: LA ESCALA QUE CAMBIÓ NO TOCA UNA LÍNEA CON PRECIO ACEPTADO NI UNA YA CONTADA", () => {
  const visto = comoLoVeLaSiembra(PACK12);
  const sembrada = { cantidad: 12, unidad: "UNIDAD", precioCosto: 3200, cantidadRecibida: null, unidadesFisicas: null, kgRecibidos: null };
  const dictado = { cantidad: 1, unidad: "BULTO", escalasMezcladas: false };
  const base = { dictado, precioEnSuUnidad: 3200, precioDictado: 38400, base: visto };
  assert.deepEqual(lineaSembradaQueRehacer({ detalle: sembrada, ...base }), { cantidad: 1, unidad: "BULTO", precioCosto: 38400 });
  assert.equal(lineaSembradaQueRehacer({ detalle: sembrada, ...base, conPrecioAceptado: true }), null);
  assert.equal(lineaSembradaQueRehacer({ detalle: { ...sembrada, cantidadRecibida: 12 }, ...base }), null);
  // Un precio puesto a mano se convierte, no se pisa: $3.100 la unidad son $37.200 el bulto.
  assert.equal(lineaSembradaQueRehacer({ detalle: { ...sembrada, precioCosto: 3100 }, ...base }).precioCosto, 37200);
});
