// El resumen visto desde el sistema, no desde el Excel.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SITUACION,
  TONO_SITUACION,
  resumenDelSistema,
  resumenDelArchivo,
} from "@/lib/proveedores/listas/resumenSistema";

// Los números reales de la importación 3 de Arcor.
const REAL = { universo: 375, actualizados: 279, pendientes: 7, ausentes: 89, sinCodigo: 58, conAlerta: 0, filasAplicadas: 281 };

test("las tres situaciones suman el universo", () => {
  const r = resumenDelSistema(REAL);
  assert.equal(r.universo, 375);
  assert.equal(r.cierra, true);
  assert.equal(r.faltante, 0);
});

test("cuando no suman, lo dice en vez de esconderlo", () => {
  const r = resumenDelSistema({ universo: 375, actualizados: 279, pendientes: 7, ausentes: 80 });
  assert.equal(r.cierra, false);
  assert.equal(r.faltante, 9);
});

test("el avance se mide sobre los que vinieron en el archivo", () => {
  // 279 de 286 participantes es 98 %. Contra las 917 filas del Excel daría 30 %,
  // que es la lectura que confunde.
  const r = resumenDelSistema(REAL);
  assert.equal(r.participantes, 286);
  assert.equal(r.avancePct, 98);
});

test("los ausentes no cuentan como trabajo pendiente", () => {
  // Sin pendientes, está terminado aunque haya 89 productos que no vinieron.
  const r = resumenDelSistema({ universo: 375, actualizados: 286, pendientes: 0, ausentes: 89 });
  assert.equal(r.terminado, true);
  assert.equal(r.avancePct, 100);
});

test("con pendientes no está terminado", () => {
  assert.equal(resumenDelSistema(REAL).terminado, false);
});

test("las tres métricas salen en orden de lectura y con su explicación", () => {
  const r = resumenDelSistema(REAL);
  assert.deepEqual(r.metricas.map((m) => m.clave), [SITUACION.ACTUALIZADO, SITUACION.PENDIENTE, SITUACION.AUSENTE]);
  assert.deepEqual(r.metricas.map((m) => m.valor), [279, 7, 89]);
  for (const m of r.metricas) {
    assert.ok(m.etiqueta.length > 0, m.clave);
    assert.ok(m.detalle.length > 0, m.clave);
  }
});

test("cada situación tiene su token semántico, sin colores sueltos", () => {
  for (const s of Object.values(SITUACION)) assert.match(TONO_SITUACION[s], /^sunmi-text-/);
});

test("un universo vacío no inventa porcentajes", () => {
  const r = resumenDelSistema({ universo: 0, actualizados: 0, pendientes: 0, ausentes: 0 });
  assert.equal(r.avancePct, null);
  assert.equal(r.terminado, false);
  assert.equal(r.cierra, false);
});

test("las filas aplicadas se informan aparte de los productos", () => {
  // 281 filas sobre 279 productos: dos productos recibieron dos filas.
  const r = resumenDelSistema(REAL);
  assert.equal(r.filasAplicadas, 281);
  assert.equal(r.metricas[0].valor, 279);
  assert.notEqual(r.filasAplicadas, r.metricas[0].valor);
});

test("los datos que pueden faltar quedan en null y no en cero", () => {
  const r = resumenDelSistema({ universo: 10, actualizados: 10, pendientes: 0, ausentes: 0 });
  assert.equal(r.sinCodigo, null);
  assert.equal(r.filasAplicadas, null);
  assert.equal(r.conAlerta, null);
});

// ── El archivo, como bloque secundario ──────────────────────────────────────

test("el resumen del archivo describe el Excel, no el trabajo", () => {
  const r = resumenDelArchivo({ totalFilas: 917, sinVincular: 625, ambiguas: 1, duplicadas: 1 });
  assert.equal(r.totalFilas, 917);
  assert.equal(r.sinVincular, 625);
  assert.equal(r.conProducto, 292);
  assert.equal(r.porcentajeAprovechado, 32);
});

test("un archivo sin filas no divide por cero", () => {
  assert.equal(resumenDelArchivo({ totalFilas: 0 }).porcentajeAprovechado, null);
});
