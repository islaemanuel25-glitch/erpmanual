// LAS DIFERENCIAS DE CAJA NO SE NETEAN EN LA AUDITORÍA POS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/auditoria-pos-ventas/diferenciasSinNetear.test.mjs
//
// Un −$5.000 de la caja de A y un +$5.000 de la de B son dos hechos. Sumarlos
// da $0 y esconde a los dos. Había dos lugares que lo hacían:
//
//   · el reporte de operadores agrupaba por CUENTA y devolvía `diferenciaTotal`,
//     la suma de las diferencias de todas las cajas de esa cuenta;
//   · la pantalla de Cajas mostraba una "Dif. acumulada" que, además, se
//     ocultaba cuando daba cero.
//
// El comportamiento del reporte —dos operadores con la misma cuenta, A −5.000 y
// B +5.000, dos filas— lo ejerce contra PostgreSQL
// scripts/pruebas-db/cajaPorOperador.mjs. Acá se cuida que el neto no vuelva en
// ninguno de los dos archivos. Se leen SIN comentarios: los dos explican en
// prosa el neto que ya no hacen, y un candado que busca texto los encontraría.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/[^\n]*/g, "");

const REPORTE = "app/api/auditoria-pos-ventas/operadores/route.js";
const PANTALLA_CAJAS = "app/modulos/auditoria-pos-ventas/cajas/page.jsx";

test("el reporte de operadores agrupa por responsable de caja, no por cuenta", () => {
  const src = sinComentarios(REPORTE);
  assert.match(src, /responsableDeCaja\(/);
  assert.doesNotMatch(src, /by:\s*\[\s*"vendedorId"\s*\]/, "volvió a agrupar las ventas solo por cuenta");
});

test("el reporte separa faltante y sobrante y no devuelve un neto por fila", () => {
  const src = sinComentarios(REPORTE);
  assert.match(src, /faltante:/);
  assert.match(src, /sobrante:/);
  assert.doesNotMatch(src, /diferenciaTotal/, "volvió la diferencia neta por fila");
  // El neto del local existe solo como agregado ROTULADO estadístico.
  assert.match(src, /esEstadistico: true/);
  assert.match(src, /netoEstadistico:/);
});

test("la pantalla de Cajas muestra faltantes y sobrantes, no una diferencia acumulada", () => {
  const src = sinComentarios(PANTALLA_CAJAS);
  assert.doesNotMatch(src, /Dif\. acumulada/);
  assert.doesNotMatch(src, /diferenciaTotal/);
  // Ningún reduce que sume las diferencias tal cual: solo por signo.
  assert.doesNotMatch(src, /reduce\(\(acc, c\) => acc \+ \(c\.diferencia \|\| 0\)/);
  assert.match(src, /Math\.min\(c\.diferencia \|\| 0, 0\)/);
  assert.match(src, /Math\.max\(c\.diferencia \|\| 0, 0\)/);
  assert.match(src, /"Faltantes"/);
  assert.match(src, /"Sobrantes"/);
});
