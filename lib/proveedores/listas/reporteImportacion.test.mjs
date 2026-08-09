// El reporte de una importación: que los números cierren y que un producto
// tocado por dos filas aparezca una sola vez.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TIPO_REPORTE,
  encabezadoDeReporte,
  totalesDeReporte,
  lineasDeActualizados,
  lineasDePendientes,
  lineasDeAusentes,
  paginar,
  seccionesDeReporte,
  nombreArchivo,
} from "@/lib/proveedores/listas/reporteImportacion";

// El sistema real de la importación 3.
const SISTEMA = {
  universo: 375,
  metricas: [
    { clave: "ACTUALIZADO", valor: 279 },
    { clave: "PENDIENTE", valor: 7 },
    { clave: "AUSENTE", valor: 89 },
  ],
  filasAplicadas: 281,
};

const CABECERA = {
  id: 3,
  archivoNombre: "lista de precios agosto 2026.xls.xlsx",
  createdAt: "2026-08-05T12:00:00Z",
  estado: "PARCIALMENTE_APLICADA",
  recargoPct: 5,
  aumentoEsperadoMinPct: 10,
  aumentoEsperadoMaxPct: 20,
};

// ── El encabezado ───────────────────────────────────────────────────────────

test("el encabezado trae los diez datos de la importación", () => {
  const h = encabezadoDeReporte({
    cabecera: CABECERA,
    proveedor: { nombre: "Arcor" },
    usuario: "Administrador",
    generadoEn: "2026-08-06T18:00:00Z",
  });
  const etiquetas = h.map((x) => x.etiqueta);
  for (const e of ["Sistema", "Proveedor", "Archivo", "Importación", "Fecha de carga", "Generado", "Usuario", "Estado", "Recargo aplicado", "Rango esperado"]) {
    assert.ok(etiquetas.includes(e), `falta ${e}`);
  }
  assert.equal(h.find((x) => x.etiqueta === "Sistema").valor, "ERP Azul");
  assert.equal(h.find((x) => x.etiqueta === "Proveedor").valor, "Arcor");
  assert.equal(h.find((x) => x.etiqueta === "Importación").valor, "#3");
  assert.equal(h.find((x) => x.etiqueta === "Recargo aplicado").valor, "5 %");
  assert.equal(h.find((x) => x.etiqueta === "Rango esperado").valor, "10 % a 20 %");
});

test("sin rango configurado no se inventa uno", () => {
  const h = encabezadoDeReporte({ cabecera: { ...CABECERA, aumentoEsperadoMinPct: null } });
  assert.equal(h.find((x) => x.etiqueta === "Rango esperado").valor, "—");
});

// ── Los totales tienen que cerrar ───────────────────────────────────────────

test("279 + 7 + 89 = 375", () => {
  const t = totalesDeReporte(SISTEMA);
  assert.equal(t.universo, 375);
  assert.equal(t.actualizados, 279);
  assert.equal(t.pendientes, 7);
  assert.equal(t.ausentes, 89);
  assert.equal(t.suma, 375);
  assert.equal(t.cierra, true);
});

test("las filas aplicadas se informan aparte de los productos", () => {
  assert.equal(totalesDeReporte(SISTEMA).filasAplicadas, 281);
});

test("si no cierran, el reporte lo sabe", () => {
  const t = totalesDeReporte({ ...SISTEMA, universo: 400 });
  assert.equal(t.cierra, false);
});

// ── UN PRODUCTO, UNA LÍNEA ──────────────────────────────────────────────────

const itemActualizado = (extra = {}) => ({
  id: 10,
  nombre: "Jugo Arcor Naranja X Caja",
  codigosProveedor: ["1014429"],
  filas: [
    { id: 1, filaExcel: 167, aplicada: true, costoPrevioAplicacion: 5010, costoAplicado: 5962.16, aplicadaEn: "2026-08-06T12:00:00Z" },
  ],
  ...extra,
});

test("un producto actualizado sale con su recorrido y su fila", () => {
  const [l] = lineasDeActualizados([itemActualizado()]);
  assert.equal(l.nombre, "Jugo Arcor Naranja X Caja");
  assert.equal(l.codigoArcor, "1014429");
  assert.equal(l.costoAnterior, 5010);
  assert.equal(l.costoAplicado, 5962.16);
  assert.ok(Math.abs(l.variacionPct - 19) < 0.1);
  assert.deepEqual(l.filas, [167]);
  assert.equal(l.variasFilas, false);
});

test("EL CASO DE LAS DOS FILAS: un producto, una línea, dos filas listadas", () => {
  const [l] = lineasDeActualizados([
    itemActualizado({
      filas: [
        { id: 1, filaExcel: 162, aplicada: true, costoPrevioAplicacion: 1000, costoAplicado: 1200, aplicadaEn: "2026-08-06T12:00:00Z" },
        { id: 2, filaExcel: 432, aplicada: true, costoPrevioAplicacion: 1200, costoAplicado: 1500, aplicadaEn: "2026-08-06T12:00:05Z" },
      ],
    }),
  ]);
  assert.equal(l.costoAnterior, 1000, "el punto de partida es el de la primera");
  assert.equal(l.costoAplicado, 1500, "y el final el de la última");
  assert.deepEqual(l.filas, [162, 432], "las dos filas quedan listadas");
  assert.equal(l.variasFilas, true);
});

test("281 filas sobre 279 productos: la lista tiene 279 líneas", () => {
  // Dos productos con dos filas cada uno, uno con una: 5 filas, 3 líneas.
  const items = [
    itemActualizado({ id: 1, filas: [{ filaExcel: 1, aplicada: true, costoAplicado: 10 }, { filaExcel: 2, aplicada: true, costoAplicado: 12 }] }),
    itemActualizado({ id: 2, filas: [{ filaExcel: 3, aplicada: true, costoAplicado: 10 }, { filaExcel: 4, aplicada: true, costoAplicado: 12 }] }),
    itemActualizado({ id: 3, filas: [{ filaExcel: 5, aplicada: true, costoAplicado: 10 }] }),
  ];
  const lineas = lineasDeActualizados(items);
  assert.equal(lineas.length, 3);
  assert.equal(lineas.flatMap((l) => l.filas).length, 5);
});

test("sin código de proveedor la línea lo deja en null y no inventa", () => {
  const [l] = lineasDeActualizados([itemActualizado({ codigosProveedor: [] })]);
  assert.equal(l.codigoArcor, null);
});

// ── Pendientes ──────────────────────────────────────────────────────────────

test("un pendiente sale con su motivo y sus filas", () => {
  const items = [
    {
      id: 20, nombre: "MOGUL CONITOS", codigosProveedor: ["1003113"], costoActual: 11601,
      filas: [{ id: 9, filaExcel: 355, aplicada: false, estado: "FACTOR_DUDOSO" }],
    },
  ];
  const analizar = () => ({
    resultado: "RECOMENDADA", recomendada: "A",
    evaluadas: [{ clave: "A", estado: "DISMINUCION", costoNuevo: 5611.14, variacionPct: -51.6 }],
  });
  const [l] = lineasDePendientes(items, analizar);
  assert.equal(l.nombre, "MOGUL CONITOS");
  assert.equal(l.costoActual, 11601);
  assert.equal(l.costoPropuesto, 5611.14);
  assert.equal(l.motivo, "La interpretación baja el costo");
  assert.deepEqual(l.filas, [355]);
});

test("un pendiente sin costo propuesto lo deja vacío", () => {
  const items = [{ id: 21, nombre: "X", codigosProveedor: [], costoActual: 100, filas: [{ filaExcel: 1, aplicada: false, estado: "FACTOR_DUDOSO" }] }];
  const [l] = lineasDePendientes(items, () => ({ resultado: "REVISAR", evaluadas: [] }));
  assert.equal(l.costoPropuesto, null);
  assert.equal(l.motivo, "Ninguna interpretación da un costo creíble");
});

// ── No informados ───────────────────────────────────────────────────────────

test("un no informado lleva su motivo fijo", () => {
  const [l] = lineasDeAusentes([
    { id: 30, nombre: "AGUILA 150gr", codigosProveedor: ["1012903"], costoActual: 44800, actualizadoEn: "2026-07-01T00:00:00Z" },
  ]);
  assert.equal(l.costoActual, 44800);
  assert.equal(l.motivo, "Arcor no informó este producto en esta lista");
  assert.equal(l.actualizadoEn, "2026-07-01T00:00:00Z");
});

// ── Paginado sin cortar filas ───────────────────────────────────────────────

test("las líneas se reparten enteras, sin cortar ninguna", () => {
  const lineas = Array.from({ length: 70 }, (_, i) => ({ i }));
  const p = paginar(lineas, { porPagina: 30, primeraPagina: 20 });
  assert.deepEqual(p.map((x) => x.length), [20, 30, 20]);
  assert.equal(p.flat().length, 70, "no se pierde ni se duplica ninguna");
});

test("una sola página cuando entran todas", () => {
  assert.deepEqual(paginar([1, 2, 3], { porPagina: 30 }).map((x) => x.length), [3]);
});

test("sin líneas no hay páginas", () => {
  assert.deepEqual(paginar([]), []);
});

// ── Qué lleva cada reporte ──────────────────────────────────────────────────

test("el completo lleva las cuatro secciones", () => {
  assert.deepEqual(seccionesDeReporte(TIPO_REPORTE.COMPLETO), ["RESUMEN", "ACTUALIZADOS", "PENDIENTES", "AUSENTES"]);
});

test("el de actualizados lleva solo esa", () => {
  assert.deepEqual(seccionesDeReporte(TIPO_REPORTE.ACTUALIZADOS), ["ACTUALIZADOS"]);
});

test("el de NO actualizados lleva pendientes Y no informados", () => {
  assert.deepEqual(seccionesDeReporte(TIPO_REPORTE.NO_ACTUALIZADOS), ["PENDIENTES", "AUSENTES"]);
});

// ── El archivo ──────────────────────────────────────────────────────────────

test("el nombre del archivo dice qué es, de qué importación y de cuándo", () => {
  const nombre = nombreArchivo({ tipo: TIPO_REPORTE.COMPLETO, importacionId: 3, generadoEn: "2026-08-06T18:00:00Z" });
  assert.equal(nombre, "reporte-completo-importacion-3-20260806.pdf");
});

test("cada tipo tiene su nombre", () => {
  assert.match(nombreArchivo({ tipo: TIPO_REPORTE.ACTUALIZADOS, importacionId: 3, generadoEn: "2026-08-06T18:00:00Z" }), /^productos-actualizados-/);
  assert.match(nombreArchivo({ tipo: TIPO_REPORTE.NO_ACTUALIZADOS, importacionId: 3, generadoEn: "2026-08-06T18:00:00Z" }), /^productos-no-actualizados-/);
});
