// LA REGLA ÚNICA DE UNIDADES, TANDA 3: LA IMPORTACIÓN DE PEDIDOS PREGUNTA A LA PIEZA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/unidades/importacionConLaPieza.test.mjs
//
// ── LA CONTRADICCIÓN ───────────────────────────────────────────────────────
//
// Relevamiento del 2026-11-04, corrido con las funciones reales: un papel a
// $4.416 la unidad contra un pack de 12 a $38.400 (+38 % sobre los $3.200 de la
// unidad). La importación, con su 40 % propio y su distancia logarítmica,
// contestaba "es por unidad"; la recepción, con `deducirUnidad` y su 35 %, lo
// leía como un pack intermedio. Mismo papel, dos respuestas.
//
// Las líneas se arman con `prepararLineasImportadas`, el camino que usa la
// pantalla de importar, con un producto en la forma en que lo entrega el
// catálogo de Compras (`modoCompra`, no `modoCompraProveedor`).

import { test } from "node:test";
import assert from "node:assert/strict";

import { escalaDelPrecio } from "./reglaDeUnidades.js";
import { deducirUnidad, UNIDAD } from "../compras-proveedor/comprobante/unidadPorPrecio.js";
import { prepararLineasImportadas } from "../compras-proveedor/importacion/prepararLineas.js";
import { ORIGEN_UNIDAD_PAPEL, resolverUnidadDelPapel } from "../compras-proveedor/importacion/unidadDelPapel.js";
import { baseDeProducto } from "../compras-proveedor/importacion/merge.js";

/** Un pack de 12 a $38.400, como lo entrega el catálogo de Compras. */
const PACK12 = Object.freeze({
  productoLocalId: 1,
  baseId: 101,
  nombre: "DURAZNO EN MITADES X 12",
  codigoInterno: "D12",
  codigosInternos: ["D12"],
  aliasesProveedor: [],
  factor_pack: 12,
  modoCompra: "BULTO",
  unidad_medida: "pack",
  precio_costo: 38400,
});
const FICHA = baseDeProducto(PACK12);

/** Una línea del archivo importada contra el pack de 12. */
function importar({ cantidad, precio, facturaPor = "UNIDAD" }) {
  return prepararLineasImportadas({
    lineas: [{ codigo: "D12", descripcion: "DURAZNO EN MITADES X 12", cantidad, precioUnitario: precio, subtotal: cantidad * precio, unidad: null }],
    productos: [PACK12],
    facturaPor,
    hayColumnaSubtotal: true,
  })[0];
}

test("$4.416 LA UNIDAD: LA IMPORTACIÓN Y LA RECEPCIÓN YA NO DICEN COSAS DISTINTAS", () => {
  // La pieza: no es la unidad (+38 %) ni el bulto; lo explica un pack intermedio.
  const pieza = escalaDelPrecio({ precio: 4416, base: FICHA, costoActual: 38400 });
  assert.equal(pieza.unidad, null);
  assert.equal(pieza.veredicto, UNIDAD.POR_PRESENTACION);
  // La recepción, con su decisor de siempre: lo mismo.
  assert.equal(deducirUnidad({ costoAnteriorFinal: 38400, precioFacturaFinal: 4416, factorPack: 12 }).unidad, UNIDAD.POR_PRESENTACION);
  // La importación: ya no "es por unidad". Pregunta, con el número del papel.
  const l = importar({ cantidad: 12, precio: 4416 });
  assert.equal(l.unidadCantidadPapel, pieza.unidad, "decía UNIDAD con un 40 % propio");
  assert.equal(l.origenUnidadPapel, ORIGEN_UNIDAD_PAPEL.PREGUNTA);
  assert.equal(l.preguntaUnidadPapel?.titulo, "La factura dice 12. ¿Está expresado en?");
});

test("UN PAPEL NORMAL POR UNIDAD SE IMPORTA COMO SIEMPRE", () => {
  // 12 a $3.300: la unidad, +3,1 %. Se sugiere —no se confirma— y cierra.
  const l = importar({ cantidad: 12, precio: 3300 });
  assert.equal(l.unidadCantidadPapel, "UNIDAD");
  assert.equal(l.origenUnidadPapel, ORIGEN_UNIDAD_PAPEL.EVIDENCIA_PRECIO);
  assert.equal(l.unidadPapelConfirmada, false);
  assert.equal(l.cantidadBaseUnidades, 12);
  assert.equal(l.coherencia.bloquea, false);
});

test("UN PAPEL NORMAL POR BULTO SE IMPORTA COMO SIEMPRE", () => {
  // 1 a $39.600: el bulto de 12, +3,1 %. Son 12 unidades y cierra. Un papel que
  // cobra por bulto lo dice su receta (`facturaPor`): con "por unidad" el
  // candado aritmético frena, y frenaba igual antes de esta tanda.
  const l = importar({ cantidad: 1, precio: 39600, facturaPor: "BULTO" });
  assert.equal(l.unidadCantidadPapel, "BULTO");
  assert.equal(l.origenUnidadPapel, ORIGEN_UNIDAD_PAPEL.EVIDENCIA_PRECIO);
  assert.equal(l.cantidadBaseUnidades, 12);
  assert.equal(l.coherencia.bloquea, false);
});

test("EN TODO EL RANGO DE PRECIOS, LA IMPORTACIÓN CONTESTA LO MISMO QUE LA PIEZA", () => {
  // De $500 a $600.000, cada precio por el camino real de la importación: la
  // unidad del papel es la que dice la pieza, y la pieza es `deducirUnidad`.
  let preguntas = 0;
  for (let precio = 500; precio <= 600000; precio = Math.round(precio * 1.07)) {
    const pieza = escalaDelPrecio({ precio, base: FICHA, costoActual: 38400 });
    const l = importar({ cantidad: 12, precio });
    assert.equal(l.unidadCantidadPapel, pieza.unidad, `$${precio}`);
    assert.equal(resolverUnidadDelPapel({ precioPapel: precio, base: FICHA, costoErp: 38400 }).unidad, pieza.unidad, `$${precio}`);
    const d = deducirUnidad({ costoAnteriorFinal: 38400, precioFacturaFinal: precio, factorPack: 12 });
    const recepcion = d.unidad === UNIDAD.POR_UNIDAD ? "UNIDAD" : d.unidad === UNIDAD.POR_BULTO ? "BULTO" : null;
    assert.equal(pieza.unidad, recepcion, `$${precio}`);
    if (pieza.unidad === null) preguntas += 1;
  }
  // Y el rango tiene de las tres respuestas: si no, no prueba nada.
  assert.ok(preguntas > 0);
});
