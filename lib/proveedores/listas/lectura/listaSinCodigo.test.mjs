// UNA LISTA SIN COLUMNA DE CÓDIGO: PRODUCTO, CANTIDAD Y PRECIO, POR SEPARADO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/lectura/listaSinCodigo.test.mjs
//
// ── EL CASO (Mauro, 2026-11-06) ─────────────────────────────────────────────
//
// Un PDF de 3 páginas y 68 renglones con tres columnas —PRODUCTO, CANTIDAD y
// PRECIO ($), "precio total de la presentación"— y ningún código. Medido con
// `leerArchivoDeLista` sobre el PDF real (fuera de esta sesión: el archivo
// lleva precios de compra y el repo es público):
//
//   · los títulos salían «PRODUCTO CANTIDAD» · «PRECIO ($)» · «»: están
//     alineados a la izquierda de su celda y los números a la derecha, y
//     `columnaDe` reparte por la X izquierda;
//   · `proponerMapeo` daba el código en la columna del PRECIO: corta y casi
//     siempre distinta, puntuaba como código. El alta precargaba 3139,92 como
//     "Código del proveedor" y el Factor pack vacío.
//
// ── DE DÓNDE SALEN LAS POSICIONES ──────────────────────────────────────────
//
// Las cinco filas nombradas y el encabezado son las X, los anchos y las Y del
// PDF real (A4, 595,28 × 841,89). Las demás completan hasta veinte renglones en
// las MISMAS X, cada 26 puntos de Y, con nombres y precios distintos: una
// columna se arma por cuántas celdas caen en la misma X, y con cinco solas no
// se ejercería el mínimo de apariciones.

import { test } from "node:test";
import assert from "node:assert/strict";

import { tablaDeFragmentos } from "./tablaDeArchivo.js";
import { proponerMapeo } from "./deteccionDeColumnas.js";
import { filasDelArchivo } from "../importacionGenerica.js";

// Las X de cada columna, como las imprime el PDF.
const X_PRODUCTO = 53.64;
/** La cantidad va alineada a la derecha: la X depende de cuántos dígitos tiene. */
const cantidad = (texto) =>
  texto === "—" ? { x: 427.64, ancho: 9 } : texto.length === 1 ? { x: 431.63, ancho: 5 } : { x: 426.63, ancho: 10.01 };
/** El precio también: "3.139,92" arranca en 506,61 y "771,42" en 514,12. */
const precio = (texto) => (texto.length >= 8 ? { x: 506.61, ancho: 35.03 } : { x: 514.12, ancho: 27.52 });

const ENCABEZADO_Y = 728.89;
const RENGLONES = [
  // [producto, cantidad, precio] — las de los comentarios son las del PDF real.
  ["ACTRON 400", "10", "3.139,92"], // y 702.89
  ["ACTRON 600", "10", "3.512,40"],
  ["ACTRON MUJER", "8", "2.987,55"],
  ["ACTRON PLUS", "8", "3.874,08"], // y 624.89
  ["ALIKAL", "30", "771,42"], // y 598.89
  ["ALIKAL LIMON", "30", "798,10"],
  ["AMOXIDAL 500", "16", "5.218,77"],
  ["BACTRIM FORTE", "10", "4.402,61"],
  ['BAYASPIRINA "C" CALIENTE', "—", "1.404,15"], // y 494.89
  ["BAYASPIRINA 500", "20", "1.186,30"],
  ["BUSCAPINA", "20", "2.655,49"],
  ["CAFIASPIRINA", "—", "1.322,08"],
  ["CURITAS X 10", "10", "915,64"],
  ["DICLOFENAC 75", "10", "1.743,25"],
  ["GASA ESTERIL 10X10", "50", "2.019,90"],
  ["IBUPIRAC 400", "10", "1.588,74"],
  ["IBUPIRAC 600", "10", "1.965,03"],
  ["MEJORAL", "—", "834,56"],
  ["SERTAL COMPUESTO", "10", "3.276,12"],
  ["TAFIROL 1G", "8", "1.457,81"],
];

function paginaDeMauro() {
  const fragmentos = [
    { x: X_PRODUCTO, y: ENCABEZADO_Y, texto: "PRODUCTO", ancho: 51.5 },
    { x: 353.64, y: ENCABEZADO_Y, texto: "CANTIDAD", ancho: 46.99 },
    { x: 448.64, y: ENCABEZADO_Y, texto: "PRECIO ($)", ancho: 48.01 },
  ];
  RENGLONES.forEach(([nombre, cant, prec], i) => {
    const y = 702.89 - 26 * i;
    fragmentos.push({ x: X_PRODUCTO, y, texto: nombre, ancho: nombre.length * 5.5 });
    fragmentos.push({ y, texto: cant, ...cantidad(cant) });
    fragmentos.push({ y, texto: prec, ...precio(prec) });
  });
  return { ancho: 595.28, alto: 841.89, fragmentos };
}

/** Como lo arman `importar` y `proponer`: una columna por título, con sus valores. */
function columnasDe(tabla) {
  return tabla.titulos.map((titulo, indice) => ({ indice, titulo, valores: tabla.filas.map((f) => f.valores[indice]) }));
}

test("las posiciones del caso son las del PDF real", () => {
  // Contra el fixture escrito a mano que no ocurre: las cinco filas medidas
  // están donde las midió el PDF.
  const p = paginaDeMauro();
  const en = (texto) => p.fragmentos.find((f) => f.texto === texto);
  assert.deepEqual([en("ACTRON 400").y, en("ACTRON PLUS").y, en("ALIKAL").y, en('BAYASPIRINA "C" CALIENTE').y], [702.89, 624.89, 598.89, 494.89]);
  assert.deepEqual([en("3.139,92").x, en("771,42").x, en("—").x], [506.61, 514.12, 427.64]);
});

test("ARREGLO 1 · los títulos salen uno por columna: PRODUCTO, CANTIDAD, PRECIO ($)", () => {
  const tabla = tablaDeFragmentos([paginaDeMauro()]);
  assert.deepEqual(tabla.titulos, ["PRODUCTO", "CANTIDAD", "PRECIO ($)"]);
  const actron = tabla.filas.find((f) => f.valores[0] === "ACTRON 400");
  assert.deepEqual(actron.valores, ["ACTRON 400", "10", "3.139,92"]);
});

test("ARREGLO 2 · el mapeo no tiene código: producto 0, cantidad 1, precio 2", () => {
  const { mapeo } = proponerMapeo(columnasDe(tablaDeFragmentos([paginaDeMauro()])));
  assert.equal(mapeo.codigo, null, "una columna de importes con centavos se tomó como código");
  assert.equal(mapeo.descripcion, 0);
  assert.equal(mapeo.cantidad, 1);
  assert.deepEqual(mapeo.precios, [2]);
});

test("ARREGLO 2, SOLO · con los títulos ya bien, el precio igual no es código", () => {
  // Aísla el segundo arreglo del primero: el diagnóstico midió que aun con los
  // títulos correctos el código caía en la columna 2.
  const tabla = tablaDeFragmentos([paginaDeMauro()]);
  const columnas = columnasDe(tabla).map((c, i) => ({ ...c, titulo: ["PRODUCTO", "CANTIDAD", "PRECIO ($)"][i] }));
  const { mapeo } = proponerMapeo(columnas);
  assert.equal(mapeo.codigo, null);
  assert.deepEqual(mapeo.precios, [2]);
});

test("LOS VEINTE SON PRODUCTOS: ACTRON 400 con cantidad 10 y precio 3139,92, y ningún código", () => {
  const tabla = tablaDeFragmentos([paginaDeMauro()]);
  const { mapeo } = proponerMapeo(columnasDe(tabla));
  const { filas, descartadas } = filasDelArchivo({ tabla, mapeo });
  assert.equal(filas.length, RENGLONES.length, `se descartaron: ${JSON.stringify(descartadas)}`);
  const actron = filas.find((f) => f.descripcionProveedor === "ACTRON 400");
  assert.equal(actron.unidadesPorBulto, 10);
  assert.equal(actron.preciosPorColumna[2], 3139.92);
  // Ningún renglón tiene código, y menos uno sacado del precio o la cantidad.
  for (const f of filas) assert.equal(f.codigoCrudo, "", `${f.descripcionProveedor} salió con código ${f.codigoCrudo}`);
  // Con "—" la cantidad queda vacía.
  assert.equal(filas.find((f) => f.descripcionProveedor === "MEJORAL").unidadesPorBulto, null);
});
