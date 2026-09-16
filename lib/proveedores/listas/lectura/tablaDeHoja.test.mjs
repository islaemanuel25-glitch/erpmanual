// De una planilla a la misma tabla que sale de un PDF.
//
// La matriz de este archivo tiene la forma del Excel real de Arcor: el
// encabezado en la primera fila, una columna vacía al final que el que exportó
// nunca borró, y entre los productos los títulos de rubro —"03- ALIMENTOS 91-
// COMESTIBLES LA CAMPAGNOLA 0123- ADEREZOS"— con un "$0.00" en la columna de
// precio, que es lo que los vuelve difíciles de descartar.

import { test } from "node:test";
import assert from "node:assert/strict";

import { tablaDeHoja, matrizDeCsv } from "@/lib/proveedores/listas/lectura/tablaDeHoja";
import { proponerMapeo } from "@/lib/proveedores/listas/lectura/deteccionDeColumnas";

// ── LA PROPORCIÓN DE TÍTULOS DE RUBRO ES LA DEL ARCHIVO ─────────────────────
//
// Uno cada treinta productos, que es lo que trae el Excel real: unos treinta
// rubros sobre 1.052 filas. La primera versión de este fixture puso uno cada
// seis y el candado dio rojo porque el título de rubro —una cadena de sesenta
// caracteres— le subía el largo medio a la columna de códigos lo bastante como
// para que dejara de parecer un código. Un fixture con la proporción inventada
// informa un defecto del módulo donde el defecto es del fixture.
const NOMBRES = [
  "AZUCAR ARCOR  x 1kg", "KETCHUP DOYP.  LC X250G", "KETCHUP PICANTE DP. LC X250",
  "MOSTAZA DOYP. LC X250G", "MAYONESA DOYP. LC X250G", "MERMELADA DURAZNO LC X390",
];
const ARCOR = [["Producto", "Descripción", "U.M.", "UxBU", "Precio S/IVA", "Precio C/IVA", "uni"]];
for (let i = 0; i < 30; i++) {
  if (i === 1) {
    // El título de rubro trae un "$0.00" en la columna de precio, y eso es lo que
    // lo vuelve difícil de descartar: tiene dos celdas llenas, como una fila.
    ARCOR.push(["03- ALIMENTOS   91- COMESTIBLES LA CAMPAGNOLA   0123- ADEREZOS", "", "", "", "$0.00", "", ""]);
  }
  const neto = 982.33 + i * 37.5;
  const conIva = Math.round(neto * 1.21 * 100) / 100;
  const miles = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  ARCOR.push([
    String(12753 + i), NOMBRES[i % NOMBRES.length], "UN", "24", `$${miles(neto)}`, `$${miles(conIva)}`, "",
  ]);
}

test("la planilla da la misma forma que el PDF: títulos, filas y descartes con motivo", () => {
  const t = tablaDeHoja(ARCOR);
  assert.deepEqual(t.titulos, ["Producto", "Descripción", "U.M.", "UxBU", "Precio S/IVA", "Precio C/IVA", "uni"]);
  assert.ok(Array.isArray(t.filas));
  assert.ok(Array.isArray(t.filasDescartadas));
  assert.ok(t.filasDescartadas.every((d) => typeof d.motivo === "string" && d.motivo !== ""));
  assert.ok(
    t.filasDescartadas.some((d) => d.motivo === "ENCABEZADO"),
    "el renglón de títulos no puede entrar como producto"
  );
});

test("cada fila conserva el número de renglón de la planilla", () => {
  // Sin eso, la pantalla puede decir "revisá esta fila" y no puede decir CUÁL.
  const t = tablaDeHoja(ARCOR);
  const azucar = t.filas.find((f) => f.valores[0] === "12753");
  assert.equal(azucar.y, 2, "el azúcar está en el renglón 2 de la planilla");
});

test("el mapeo sale igual que desde un PDF, sin que el motor sepa de dónde vino", () => {
  const t = tablaDeHoja(ARCOR);
  const columnas = t.titulos.map((titulo, indice) => ({
    indice, titulo, valores: t.filas.map((f) => f.valores[indice]),
  }));
  const p = proponerMapeo(columnas);
  assert.equal(p.mapeo.codigo, 0);
  assert.equal(p.mapeo.descripcion, 1);
  assert.equal(p.mapeo.cantidad, 3);
  assert.deepEqual([...p.mapeo.precios].sort((a, b) => a - b), [4, 5]);
});

test("las filas de arriba de la tabla no entran", () => {
  // Una exportación con el nombre de la empresa y la fecha arriba del encabezado.
  const conMembrete = [
    ["ARCOR S.A.I.C.", "", "", "", "", "", ""],
    ["Lista de precios agosto 2026", "", "", "04/08/2026", "", "", ""],
    ["", "", "", "", "", "", ""],
    ...ARCOR,
  ];
  const t = tablaDeHoja(conMembrete);
  assert.deepEqual(t.titulos.slice(0, 2), ["Producto", "Descripción"]);
  const textos = t.filas.map((f) => f.valores.join(" "));
  assert.equal(textos.some((x) => x.includes("ARCOR S.A.I.C.")), false);
});

// ── EL CSV ──────────────────────────────────────────────────────────────────

test("el separador del CSV se detecta: la coma es el decimal, no el separador", () => {
  // CONTRAPRUEBA DE LA REGLA: separando por coma, "1.234,56" se parte al medio y
  // cada mitad entra en una columna distinta. El precio desaparece y en su lugar
  // quedan dos números que parecen precios.
  const csv = 'Codigo;Descripcion;UxB;Precio Final\r\n1001;GALLETITA SURTIDA 12X200;12;"1.234,56"\r\n1002;AGUA MINERAL 6X1500;6;"987,10"\r\n1003;FIDEO LARGO 20X500;20;"2.345,00"\r\n';
  const m = matrizDeCsv(csv);
  assert.equal(m.length, 4);
  assert.deepEqual(m[1], ["1001", "GALLETITA SURTIDA 12X200", "12", "1.234,56"]);
});

test("un CSV separado por comas también se lee", () => {
  const csv = "Codigo,Descripcion,UxB,Precio\n1001,GALLETITA SURTIDA,12,1234.56\n1002,AGUA MINERAL,6,987.10\n";
  const m = matrizDeCsv(csv);
  assert.deepEqual(m[1], ["1001", "GALLETITA SURTIDA", "12", "1234.56"]);
});

test("las comillas protegen el separador que está adentro del texto", () => {
  const csv = 'Codigo;Descripcion;Precio\n1001;"FIDEO LARGO, TIPO 500";1.234,56\n';
  const m = matrizDeCsv(csv);
  assert.deepEqual(m[1], ["1001", "FIDEO LARGO, TIPO 500", "1.234,56"]);
});

test("el BOM del Excel no se cuela en el primer título", () => {
  const m = matrizDeCsv("﻿Codigo;Descripcion\n1001;AZUCAR\n");
  assert.equal(m[0][0], "Codigo");
});
