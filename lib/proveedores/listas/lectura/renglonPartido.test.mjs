// EL RENGLÓN QUE EL PDF IMPRIME EN DOS ALTURAS, Y EL PRECIO BUSCADO POR POSICIÓN.
//
// ── DE DÓNDE SALEN ESTOS FRAGMENTOS ─────────────────────────────────────────
//
// De la hoja 2 de la lista de vinos de Carozo ("VINOS CONTADO 19.10.pdf"),
// volcados con pdfjs y pegados acá con sus coordenadas y anchos TAL CUAL —desde
// el título "KILLKA" hasta el título "NATIVO" y sus dos renglones—, en el orden
// en que pdfjs los entrega. Ninguno está escrito a mano: las trampas son de
// décimas de punto y un fixture plausible las tendría a distancias redondas.
//
// Las cuatro formas de renglón que hay en esa porción, y que el lector anterior
// no sabía leer:
//
//   1. KIL483**: código, bodega y variedad en la Y 219,2; el precio en la 216,1.
//   2. KIL496**: código y presentación en la 161,2; nombre y precio en la 157,7.
//   3. 84779**: el "$" suelto y su número separados ("$" … "2.769,13").
//   4. 2354: código, presentación y precio arriba; el nombre 3,5 puntos abajo.
//
// El archivo entero se prueba en `listaVinosCarozo.test.mjs`, que necesita la
// carpeta de fixtures; éste corre siempre.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  tablaDeFragmentos,
  importeEnLaColumna,
  ultimoImporte,
  esImporte,
} from "@/lib/proveedores/listas/lectura/tablaDeArchivo";
import { filasDelArchivo } from "@/lib/proveedores/listas/importacionGenerica";

const KILLKA_A_NATIVO = [
  { x: 303.12, y: 219.24, ancho: 21.72, texto: "6X750" },
  { x: 353.88, y: 216.12, ancho: 47.84, texto: "$ 4.775,70" },
  { x: 303.12, y: 204.72, ancho: 21.72, texto: "6X750" },
  { x: 353.88, y: 201.6, ancho: 47.84, texto: "$ 4.775,70" },
  { x: 303.12, y: 190.2, ancho: 21.72, texto: "6X750" },
  { x: 353.88, y: 187.08, ancho: 47.84, texto: "$ 4.775,70" },
  { x: 303.12, y: 175.68, ancho: 21.72, texto: "6X750" },
  { x: 353.88, y: 172.56, ancho: 47.84, texto: "$ 4.775,70" },
  { x: 44.4, y: 161.16, ancho: 29.93, texto: "KIL496**" },
  { x: 88.08, y: 157.68, ancho: 110.15, texto: "KILLKA MALBEC BLANCO" },
  { x: 303.12, y: 161.16, ancho: 21.72, texto: "6X750" },
  { x: 353.88, y: 158.04, ancho: 47.84, texto: "$ 4.775,70" },
  { x: 44.4, y: 146.64, ancho: 29.93, texto: "KIL497**" },
  { x: 88.08, y: 143.16, ancho: 111.87, texto: "KILLKA CORTES DE TINTA" },
  { x: 303.12, y: 146.64, ancho: 21.72, texto: "6X750" },
  { x: 353.88, y: 143.52, ancho: 47.84, texto: "$ 4.775,70" },
  { x: 303.12, y: 117.6, ancho: 21.72, texto: "6X750" },
  { x: 358.68, y: 114.48, ancho: 39.68, texto: "2.769,13" },
  { x: 340.08, y: 114.48, ancho: 5.6, texto: "$" },
  { x: 51.24, y: 88.56, ancho: 16.8, texto: "2353" },
  { x: 88.08, y: 85.08, ancho: 99.69, texto: "NATIVO TINTO TETRA" },
  { x: 298.92, y: 88.56, ancho: 30.12, texto: "12X1000" },
  { x: 353.88, y: 85.44, ancho: 47.84, texto: "$ 1.170,54" },
  { x: 51.24, y: 74.04, ancho: 16.8, texto: "2354" },
  { x: 88.08, y: 70.56, ancho: 106.11, texto: "NATIVO BLANCO TETRA" },
  { x: 298.92, y: 74.04, ancho: 30.12, texto: "12X1000" },
  { x: 353.88, y: 72.12, ancho: 47.84, texto: "$ 1.064,60" },
  { x: 87.84, y: 130.68, ancho: 67.94, texto: "NACIDO Y CRIADO" },
  { x: 44.64, y: 190.2, ancho: 29.93, texto: "KIL436**" },
  { x: 88.08, y: 190.08, ancho: 27.53, texto: "KILLKA" },
  { x: 117.72, y: 190.08, ancho: 53.39, texto: "CHARDONNAY" },
  { x: 44.64, y: 175.68, ancho: 29.93, texto: "KIL457**" },
  { x: 88.08, y: 175.56, ancho: 27.53, texto: "KILLKA" },
  { x: 117.72, y: 175.56, ancho: 49.99, texto: "SAUV. BLANC" },
  { x: 87.84, y: 232.32, ancho: 25.38, texto: "KILLKA" },
  { x: 44.64, y: 219.24, ancho: 29.93, texto: "KIL483**" },
  { x: 88.08, y: 219.12, ancho: 27.53, texto: "KILLKA" },
  { x: 117.72, y: 219.12, ancho: 31.15, texto: "MALBEC" },
  { x: 44.64, y: 204.72, ancho: 29.93, texto: "KIL478**" },
  { x: 88.08, y: 204.6, ancho: 27.53, texto: "KILLKA" },
  { x: 117.72, y: 204.6, ancho: 40.99, texto: "CABERNET" },
  { x: 46.44, y: 117.6, ancho: 26.93, texto: "84779**" },
  { x: 88.08, y: 117.48, ancho: 68.63, texto: "NACIDO Y CRIADO" },
  { x: 158.87, y: 117.48, ancho: 63.95, texto: "BLANCO DUCLCE" },
  { x: 87.84, y: 101.64, ancho: 29.41, texto: "NATIVO" },
];

const PAGINA = [{ ancho: 612, alto: 792, fragmentos: KILLKA_A_NATIVO }];
const MAPEO = { codigo: 0, codigoBarra: null, descripcion: 1, cantidad: null, descuento: null, precios: [4] };

test("cada renglón partido en dos alturas sale como UNA fila", () => {
  const tabla = tablaDeFragmentos(PAGINA);
  assert.equal(tabla.filas.length, 9, "son nueve productos");
  assert.deepEqual(
    tabla.filas.map((f) => f.valores[0]),
    ["KIL483**", "KIL478**", "KIL436**", "KIL457**", "KIL496**", "KIL497**", "84779**", "2353", "2354"]
  );
  // Los títulos de marca siguen descartados, solos, como antes.
  assert.deepEqual(
    tabla.filasDescartadas.map((d) => d.texto),
    ["KILLKA", "NACIDO Y CRIADO", "NATIVO"]
  );
});

test("con el mapa confirmado: descripción completa, presentación y precio en cada fila", () => {
  const { filas, descartadas } = filasDelArchivo({ tabla: tablaDeFragmentos(PAGINA), mapeo: MAPEO });
  assert.deepEqual(descartadas, []);
  const resumen = filas.map((f) => [f.codigoNormalizado, f.descripcionProveedor, f.unidadesPorBulto, f.preciosPorColumna[4]]);
  assert.deepEqual(resumen, [
    ["KIL483", "KILLKA MALBEC", 6, 4775.7],
    ["KIL478", "KILLKA CABERNET", 6, 4775.7],
    ["KIL436", "KILLKA CHARDONNAY", 6, 4775.7],
    ["KIL457", "KILLKA SAUV. BLANC", 6, 4775.7],
    ["KIL496", "KILLKA MALBEC BLANCO", 6, 4775.7],
    ["KIL497", "KILLKA CORTES DE TINTA", 6, 4775.7],
    ["84779", "NACIDO Y CRIADO BLANCO DUCLCE", 6, 2769.13],
    ["2353", "NATIVO TINTO TETRA", 12, 1170.54],
    ["2354", "NATIVO BLANCO TETRA", 12, 1064.6],
  ]);
});

test("dos renglones de verdad no se unen aunque estén cerca, si sus celdas se pisan", () => {
  // CONTRAPRUEBA DE LA SEGUNDA CONDICIÓN: los mismos dos productos de M Y F a 4
  // puntos —menos que la distancia de un renglón partido— siguen siendo dos,
  // porque los dos tienen código, nombre y precio en las mismas X.
  const dos = [
    { x: 39.59, y: 736.37, ancho: 13.34, texto: "2034" },
    { x: 65.58, y: 736.37, ancho: 114.61, texto: "AGUA BAGGIO VIDA MANZANA 6 X 1500" },
    { x: 268.69, y: 736.37, ancho: 23.34, texto: "1.135,65" },
    { x: 39.59, y: 732.37, ancho: 13.34, texto: "5486" },
    { x: 65.58, y: 732.37, ancho: 104.94, texto: "FID. MOLTO SPAGUETTI 20X500 GR" },
    { x: 268.69, y: 732.37, ancho: 23.34, texto: "737,84" },
    { x: 39.59, y: 720.37, ancho: 13.34, texto: "360" },
    { x: 65.58, y: 720.37, ancho: 75.77, texto: "BAGGIO +MANZANA ROJA" },
    { x: 268.69, y: 720.37, ancho: 23.34, texto: "457,68" },
  ];
  const tabla = tablaDeFragmentos([{ ancho: 612, alto: 792, fragmentos: dos }]);
  assert.deepEqual(tabla.filas.map((f) => f.valores[0]), ["2034", "5486", "360"]);
});

test("un importe se reconoce con el $ pegado o separado y en formato argentino", () => {
  assert.equal(esImporte("$ 2.769,13"), true);
  assert.equal(esImporte("$2.769,13"), true);
  assert.equal(esImporte("2.769,13"), true);
  assert.equal(esImporte("1.064,60"), true);
  // Un código numérico no es un importe, ni un porcentaje, ni una presentación.
  assert.equal(esImporte("2353"), false);
  assert.equal(esImporte("21%"), false);
  assert.equal(esImporte("6X750"), false);
});

test("el precio se busca por posición, y si no hay ninguno ahí, el último importe del renglón", () => {
  const columna = { desde: 340.08, hasta: 354.24 };
  // Corrido seis puntos a la derecha de la franja: sigue estando debajo de ella.
  assert.equal(
    importeEnLaColumna([{ x: 51, texto: "2353" }, { x: 360, texto: "$ 1.170,54" }], columna),
    1170.54
  );
  // Nada en la franja: no se inventa.
  assert.equal(importeEnLaColumna([{ x: 51, texto: "2353" }, { x: 250, texto: "$ 1.170,54" }], columna), null);
  // El respaldo toma el último importe, nunca el código.
  assert.equal(ultimoImporte([{ x: 51, texto: "2353" }, { x: 250, texto: "$ 1.170,54" }]), 1170.54);
  assert.equal(ultimoImporte([{ x: 51, texto: "89194" }, { x: 303, texto: "6X750" }]), null);
});

test("un renglón sin importe en la franja de precio toma el último importe del renglón", () => {
  // El precio de 2354 corrido a la izquierda, fuera de la franja de la columna
  // de precio: sin el respaldo, la fila se descartaba "sin precio".
  const corrido = KILLKA_A_NATIVO.map((f) => (f.texto === "$ 1.064,60" ? { ...f, x: 250 } : f));
  const { filas } = filasDelArchivo({ tabla: tablaDeFragmentos([{ ...PAGINA[0], fragmentos: corrido }]), mapeo: MAPEO });
  const f = filas.find((x) => x.codigoNormalizado === "2354");
  assert.ok(f, "2354 se descartó");
  assert.equal(f.preciosPorColumna[4], 1064.6);
});
