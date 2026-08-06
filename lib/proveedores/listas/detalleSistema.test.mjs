// El detalle de cada métrica, organizado por producto y no por fila.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SITUACION_DETALLE,
  MOTIVO_PENDIENTE,
  TEXTO_MOTIVO_PENDIENTE,
  TONO_MOTIVO_PENDIENTE,
  ACCION,
  motivoDePendiente,
  agruparPorProducto,
  resumenDeActualizado,
  pendienteEnAlerta,
} from "@/lib/proveedores/listas/detalleSistema";

const fila = (extra = {}) => ({
  id: 1, filaExcel: 167, productoBaseId: 10, estado: "FACTOR_DUDOSO",
  aplicada: false, excluidaManual: false, ...extra,
});

// ── UN PRODUCTO SE MUESTRA UNA VEZ ──────────────────────────────────────────

test("dos filas del mismo producto dan UN producto con dos filas", () => {
  const g = agruparPorProducto([
    fila({ id: 1, filaExcel: 300, productoBaseId: 81 }),
    fila({ id: 2, filaExcel: 120, productoBaseId: 81 }),
    fila({ id: 3, filaExcel: 400, productoBaseId: 99 }),
  ]);
  assert.equal(g.size, 2, "dos productos, no tres filas");
  assert.equal(g.get(81).length, 2);
  assert.deepEqual(g.get(81).map((f) => f.filaExcel), [120, 300], "ordenadas por fila");
});

test("las filas sin producto no entran en el agrupado", () => {
  const g = agruparPorProducto([fila({ productoBaseId: null }), fila({ productoBaseId: 10 })]);
  assert.equal(g.size, 1);
});

test("sin filas, no hay productos", () => {
  assert.equal(agruparPorProducto([]).size, 0);
  assert.equal(agruparPorProducto().size, 0);
});

// ── EL RECORRIDO DE UN PRODUCTO ACTUALIZADO ─────────────────────────────────

test("un producto actualizado por una fila", () => {
  const r = resumenDeActualizado([
    fila({ aplicada: true, costoPrevioAplicacion: 5010, costoAplicado: 5962.16, aplicadaEn: "2026-08-06T12:00:00Z" }),
  ]);
  assert.equal(r.costoAnterior, 5010);
  assert.equal(r.costoAplicado, 5962.16);
  assert.ok(Math.abs(r.variacionPct - 19) < 0.1, `dio ${r.variacionPct}`);
  assert.equal(r.variasFilas, false);
  assert.equal(r.cantidadFilas, 1);
});

test("EL CASO DE LAS DOS FILAS: el recorrido va del primer costo al último", () => {
  // El producto 81 recibió dos filas en la misma tanda. El costo real hoy es el
  // de la última, y el punto de partida el de la primera.
  const r = resumenDeActualizado([
    fila({ aplicada: true, costoPrevioAplicacion: 1000, costoAplicado: 1200, aplicadaEn: "2026-08-06T12:00:00Z" }),
    fila({ aplicada: true, costoPrevioAplicacion: 1200, costoAplicado: 1500, aplicadaEn: "2026-08-06T12:00:05Z" }),
  ]);
  assert.equal(r.costoAnterior, 1000);
  assert.equal(r.costoAplicado, 1500);
  assert.equal(r.cantidadFilas, 2);
  assert.equal(r.variasFilas, true, "se marca para que se pueda mirar");
});

test("sin filas aplicadas no hay resumen", () => {
  assert.equal(resumenDeActualizado([fila({ aplicada: false })]), null);
  assert.equal(resumenDeActualizado([]), null);
});

test("sin costo anterior no se inventa una variación", () => {
  const r = resumenDeActualizado([fila({ aplicada: true, costoPrevioAplicacion: null, costoAplicado: 100 })]);
  assert.equal(r.variacionPct, null);
});

// ── POR QUÉ SIGUE PENDIENTE ─────────────────────────────────────────────────

test("un excluido a mano no ofrece acciones", () => {
  const r = motivoDePendiente({ fila: fila({ excluidaManual: true }) });
  assert.equal(r.motivo, MOTIVO_PENDIENTE.EXCLUIDO);
  assert.deepEqual(r.acciones, []);
});

test("un código duplicado se resuelve cambiando el producto", () => {
  const r = motivoDePendiente({ fila: fila({ estado: "CODIGO_DUPLICADO" }) });
  assert.equal(r.motivo, MOTIVO_PENDIENTE.DUPLICADO);
  assert.deepEqual(r.acciones, [ACCION.CAMBIAR]);
});

test("una fila lista pero sin aplicar lo dice así", () => {
  const r = motivoDePendiente({ fila: fila({ estado: "LISTO_PARA_ACTUALIZAR" }) });
  assert.equal(r.motivo, MOTIVO_PENDIENTE.LISTO_SIN_APLICAR);
});

test("sin producto vinculado, el motivo es el producto", () => {
  const r = motivoDePendiente({ fila: fila({ estado: "NO_MACHEADO", productoBaseId: null }) });
  assert.equal(r.motivo, MOTIVO_PENDIENTE.PRODUCTO_INCORRECTO);
  assert.deepEqual(r.acciones, [ACCION.CAMBIAR]);
});

test("sin interpretación razonable, se cambia el producto", () => {
  const r = motivoDePendiente({ fila: fila(), analisis: { resultado: "REVISAR", evaluadas: [] } });
  assert.equal(r.motivo, MOTIVO_PENDIENTE.SIN_OPCION_RAZONABLE);
  assert.deepEqual(r.acciones, [ACCION.CAMBIAR]);
});

test("con varias interpretaciones, hay que ver opciones", () => {
  const r = motivoDePendiente({ fila: fila(), analisis: { resultado: "AMBIGUA", evaluadas: [] } });
  assert.equal(r.motivo, MOTIVO_PENDIENTE.VARIAS_INTERPRETACIONES);
  assert.ok(r.acciones.includes(ACCION.VER_OPCIONES));
});

test("una recomendación que BAJA el costo se marca aparte", () => {
  const analisis = { resultado: "RECOMENDADA", recomendada: "A", evaluadas: [{ clave: "A", estado: "DISMINUCION" }] };
  const r = motivoDePendiente({ fila: fila(), analisis });
  assert.equal(r.motivo, MOTIVO_PENDIENTE.DISMINUCION);
  assert.ok(!r.acciones.includes(ACCION.CONFIRMAR), "no se confirma de un clic");
});

test("un costo que no se mueve también se marca", () => {
  const analisis = { resultado: "RECOMENDADA", recomendada: "A", evaluadas: [{ clave: "A", estado: "SIN_AUMENTO" }] };
  assert.equal(motivoDePendiente({ fila: fila(), analisis }).motivo, MOTIVO_PENDIENTE.DISMINUCION);
});

test("el caso normal: presentación dudosa, se puede confirmar", () => {
  const analisis = { resultado: "RECOMENDADA", recomendada: "A", evaluadas: [{ clave: "A", estado: "ESPERADO" }] };
  const r = motivoDePendiente({ fila: fila(), analisis });
  assert.equal(r.motivo, MOTIVO_PENDIENTE.PRESENTACION_DUDOSA);
  assert.deepEqual(r.acciones, [ACCION.CONFIRMAR, ACCION.CAMBIAR]);
});

test("cada motivo tiene texto entendible y token semántico", () => {
  for (const m of Object.values(MOTIVO_PENDIENTE)) {
    assert.ok(TEXTO_MOTIVO_PENDIENTE[m]?.length > 0, m);
    assert.match(TONO_MOTIVO_PENDIENTE[m], /^sunmi-text-/, m);
  }
});

test("las cuatro situaciones tienen clave propia", () => {
  assert.deepEqual(Object.keys(SITUACION_DETALLE), ["ACTUALIZADOS", "PENDIENTES", "AUSENTES", "SIN_CODIGO"]);
});

// ── La alerta de los pendientes ─────────────────────────────────────────────
//
// El contador viejo usaba `variacionAlta`, que en una fila por revisar siempre
// es false: decía "0 fuera de lo esperado" mientras el detalle mostraba
// disminuciones. Estas pruebas fijan qué cuenta como alerta.

test("una disminución es alerta", () => {
  assert.equal(pendienteEnAlerta(MOTIVO_PENDIENTE.DISMINUCION), true);
});

test("no tener interpretación creíble es alerta", () => {
  assert.equal(pendienteEnAlerta(MOTIVO_PENDIENTE.SIN_OPCION_RAZONABLE), true);
});

test("la ambigüedad, el duplicado y el producto equivocado también", () => {
  assert.equal(pendienteEnAlerta(MOTIVO_PENDIENTE.VARIAS_INTERPRETACIONES), true);
  assert.equal(pendienteEnAlerta(MOTIVO_PENDIENTE.DUPLICADO), true);
  assert.equal(pendienteEnAlerta(MOTIVO_PENDIENTE.PRODUCTO_INCORRECTO), true);
});

test("una presentación dudosa que se puede confirmar NO es alerta", () => {
  assert.equal(pendienteEnAlerta(MOTIVO_PENDIENTE.PRESENTACION_DUDOSA), false);
});

test("lo listo sin aplicar y lo excluido tampoco", () => {
  assert.equal(pendienteEnAlerta(MOTIVO_PENDIENTE.LISTO_SIN_APLICAR), false);
  assert.equal(pendienteEnAlerta(MOTIVO_PENDIENTE.EXCLUIDO), false);
});

test("el caso real: una disminución cuenta como alerta de punta a punta", () => {
  const analisis = { resultado: "RECOMENDADA", recomendada: "A", evaluadas: [{ clave: "A", estado: "DISMINUCION" }] };
  const { motivo } = motivoDePendiente({ fila: fila(), analisis });
  assert.equal(pendienteEnAlerta(motivo), true, "el resumen y el detalle tienen que decir lo mismo");
});
