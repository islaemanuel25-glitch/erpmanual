// LAS DIFERENCIAS DE CAJA NO SE NETEAN EN LA AUDITORÍA POS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/auditoria-pos-ventas/diferenciasSinNetear.test.mjs
//
// Un −$5.000 de la caja de A y un +$5.000 de la de B son dos hechos. Sumarlos
// da $0 y esconde a los dos. El reporte de operadores lo hacía: agrupaba por
// CUENTA y devolvía `diferenciaTotal`, la suma de las diferencias de todas las
// cajas de esa cuenta. (La pantalla de Cajas de la auditoría, que mostraba una
// "Dif. acumulada", se borró el 2026-11-01: las cajas viven en
// /modulos/turnos-y-cierres.)
//
// El comportamiento del reporte —dos operadores con la misma cuenta, A −5.000 y
// B +5.000, dos filas— lo ejerce contra PostgreSQL
// scripts/pruebas-db/cajaPorOperador.mjs. Acá se cuida que el neto no vuelva.
// Se lee SIN comentarios: explica en prosa el neto que ya no hace, y un candado
// que busca texto lo encontraría.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/[^\n]*/g, "");

const REPORTE = "app/api/auditoria-pos-ventas/operadores/route.js";

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
