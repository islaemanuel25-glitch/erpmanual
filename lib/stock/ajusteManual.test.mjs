// CANDADOS DE LAS REGLAS DEL AJUSTE MANUAL DE STOCK LOCALES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/ajusteManual.test.mjs
//
// Las reglas puras. Que la ruta las aplique en el orden correcto —bloqueo,
// auditoría, origen, cambio— y contra la cantidad REAL lo prueba
// `scripts/pruebas-db/ajusteStockTrazable.mjs`, contra PostgreSQL.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACCION_AUDITORIA_AJUSTE,
  TIPO_AJUSTE,
  calcularNuevoStock,
  validarCausaContraElStockReal,
  validarPedidoDeAjuste,
} from "./ajusteManual.js";
import { MOTIVO_DIFERENCIA } from "./motivosDeDiferencia.js";
import { UNIDAD_FISICA_STOCK } from "./escalaFisica.js";

const { FALTANTE, PRODUCTO_DANADO, SOBRANTE, OTRO } = MOTIVO_DIFERENCIA;
const U = UNIDAD_FISICA_STOCK.UNIDAD;
const pedido = (o) => validarPedidoDeAjuste({ unidadFisica: U, ...o });

// ── EL PEDIDO, ANTES DE MIRAR EL STOCK ─────────────────────────────────────

test("un tipo desconocido o ausente es 400: ya no se trata como sumar", () => {
  for (const tipo of [undefined, null, "", "SUMAR", "agregar", "restarr"]) {
    const r = pedido({ tipo, cantidad: 2 });
    assert.equal(r.ok, false, `aceptó ${JSON.stringify(tipo)}`);
    assert.equal(r.status, 400);
  }
  for (const tipo of Object.values(TIPO_AJUSTE)) assert.equal(pedido({ tipo, cantidad: 2 }).ok, true);
});

test("sumar y restar piden más de cero; fijar admite cero y rechaza negativos", () => {
  for (const tipo of [TIPO_AJUSTE.SUMAR, TIPO_AJUSTE.RESTAR]) {
    for (const cantidad of [0, -1]) assert.equal(pedido({ tipo, cantidad }).status, 400, `${tipo} ${cantidad}`);
  }
  assert.equal(pedido({ tipo: TIPO_AJUSTE.FIJAR, cantidad: 0 }).ok, true);
  assert.equal(pedido({ tipo: TIPO_AJUSTE.FIJAR, cantidad: -1 }).status, 400);
});

test("una cantidad que no es un número es 400, y null o vacío no se leen como cero", () => {
  for (const cantidad of [undefined, null, "", "abc", Number.NaN, Infinity]) {
    assert.equal(pedido({ tipo: TIPO_AJUSTE.FIJAR, cantidad }).status, 400, JSON.stringify(cantidad));
  }
});

test("una fila en PIEZAS no acepta media pieza; una en kilos sí", () => {
  assert.equal(validarPedidoDeAjuste({ tipo: "restar", cantidad: 1.5, unidadFisica: UNIDAD_FISICA_STOCK.PIEZA }).status, 400);
  assert.equal(validarPedidoDeAjuste({ tipo: "restar", cantidad: 1.5, unidadFisica: UNIDAD_FISICA_STOCK.KG }).ok, true);
});

test("la causa tiene que ser un valor del vocabulario; 'Roto' o 'MERMA' no lo son", () => {
  for (const motivoPrincipal of ["Roto", "Dañado", "MERMA", "producto dañado"]) {
    assert.equal(pedido({ tipo: "restar", cantidad: 1, motivoPrincipal }).status, 400, motivoPrincipal);
  }
  assert.equal(pedido({ tipo: "restar", cantidad: 1, motivoPrincipal: PRODUCTO_DANADO }).motivoPrincipal, PRODUCTO_DANADO);
});

test("Otro exige detalle; las demás causas no, y el detalle queda como texto", () => {
  assert.equal(pedido({ tipo: "restar", cantidad: 1, motivoPrincipal: OTRO }).status, 400);
  assert.equal(pedido({ tipo: "restar", cantidad: 1, motivoPrincipal: OTRO, motivo: "   " }).status, 400);
  const conDetalle = pedido({ tipo: "restar", cantidad: 1, motivoPrincipal: OTRO, motivo: "  se lo llevó el camión " });
  assert.equal(conDetalle.ok, true);
  assert.equal(conDetalle.motivo, "se lo llevó el camión");
  assert.equal(pedido({ tipo: "restar", cantidad: 1, motivoPrincipal: FALTANTE }).ok, true);
});

test("sin causa y sin detalle el pedido pasa: la obligatoriedad se decide contra el stock real", () => {
  const r = pedido({ tipo: "restar", cantidad: 1, motivoPrincipal: "", motivo: "" });
  assert.equal(r.ok, true);
  assert.equal(r.motivoPrincipal, null);
  assert.equal(r.motivo, null);
});

// ── EL CÁLCULO, DESDE LA CANTIDAD REAL ─────────────────────────────────────

test("sumar, restar y fijar parten de la cantidad real; el piso en cero es el de siempre", () => {
  assert.equal(calcularNuevoStock({ actual: 9, tipo: "restar", cantidad: 3, allowNegativeStock: false }), 6);
  assert.equal(calcularNuevoStock({ actual: 9, tipo: "sumar", cantidad: 3, allowNegativeStock: false }), 12);
  assert.equal(calcularNuevoStock({ actual: 9, tipo: "fijar", cantidad: 7, allowNegativeStock: false }), 7);
  assert.equal(calcularNuevoStock({ actual: 2, tipo: "restar", cantidad: 5, allowNegativeStock: false }), 0);
  assert.equal(calcularNuevoStock({ actual: 2, tipo: "restar", cantidad: 5, allowNegativeStock: true }), -3);
});

test("cada tipo queda auditado con su acción de siempre", () => {
  assert.deepEqual(ACCION_AUDITORIA_AJUSTE, {
    sumar: "AJUSTE_SUMAR",
    restar: "AJUSTE_RESTAR",
    fijar: "AJUSTE_FIJAR",
  });
});

// ── LA CAUSA CONTRA LO QUE PASA DE VERDAD ──────────────────────────────────

const contraReal = (o) => validarCausaContraElStockReal({ requireMotivo: false, ...o });

test("Producto dañado y Faltante solo explican una baja; Sobrante solo una suba", () => {
  assert.equal(contraReal({ actual: 10, nuevo: 8, motivoPrincipal: PRODUCTO_DANADO }).ok, true);
  assert.equal(contraReal({ actual: 10, nuevo: 8, motivoPrincipal: FALTANTE }).ok, true);
  assert.equal(contraReal({ actual: 8, nuevo: 10, motivoPrincipal: PRODUCTO_DANADO }).status, 409);
  assert.equal(contraReal({ actual: 8, nuevo: 10, motivoPrincipal: FALTANTE }).status, 409);
  assert.equal(contraReal({ actual: 8, nuevo: 10, motivoPrincipal: SOBRANTE }).ok, true);
  assert.equal(contraReal({ actual: 10, nuevo: 8, motivoPrincipal: SOBRANTE }).status, 409);
  for (const [a, n] of [[10, 8], [8, 10]]) assert.equal(contraReal({ actual: a, nuevo: n, motivoPrincipal: OTRO }).ok, true);
});

test("fijar se juzga por la dirección REAL: 7 sobre 9 es una baja, 7 sobre 5 una suba", () => {
  assert.equal(contraReal({ actual: 9, nuevo: 7, motivoPrincipal: PRODUCTO_DANADO }).ok, true);
  assert.equal(contraReal({ actual: 5, nuevo: 7, motivoPrincipal: PRODUCTO_DANADO }).status, 409);
  assert.equal(contraReal({ actual: 5, nuevo: 7, motivoPrincipal: SOBRANTE }).ok, true);
});

test("el rechazo por dirección dice el stock real, para que se entienda por qué", () => {
  const r = contraReal({ actual: 5, nuevo: 7, motivoPrincipal: PRODUCTO_DANADO });
  assert.match(r.error, /stock real es 5/);
  assert.match(r.error, /deja en 7/);
});

test("con el motivo obligatorio, sin causa es 400; sin obligatoriedad pasa", () => {
  assert.equal(validarCausaContraElStockReal({ actual: 10, nuevo: 8, motivoPrincipal: null, requireMotivo: true }).status, 400);
  assert.equal(validarCausaContraElStockReal({ actual: 10, nuevo: 8, motivoPrincipal: null, requireMotivo: false }).ok, true);
  assert.equal(validarCausaContraElStockReal({ actual: 10, nuevo: 8, motivoPrincipal: FALTANTE, requireMotivo: true }).ok, true);
});

test("sin diferencia real no se pide causa, y una elegida mirando otro número se rechaza", () => {
  assert.equal(validarCausaContraElStockReal({ actual: 7, nuevo: 7, motivoPrincipal: null, requireMotivo: true }).ok, true);
  const r = contraReal({ actual: 7, nuevo: 7, motivoPrincipal: FALTANTE });
  assert.equal(r.status, 409);
  assert.match(r.error, /stock real es 7/);
});
