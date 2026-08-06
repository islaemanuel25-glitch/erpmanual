// El rango de aumento esperado: evidencia de coherencia, nunca confirmación.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ESTADO_VARIACION,
  TONO_ESTADO_VARIACION,
  RANGO_POR_DEFECTO,
  esAlertaFuerte,
  exigeConfirmacionExplicita,
  rangoValido,
  clasificarVariacion,
  distanciaAlRango,
  esAbsurda,
  recomendarHipotesis,
} from "@/lib/proveedores/listas/rangoAumento";

const RANGO = { minPct: 10, maxPct: 20 };
const clas = (actual, nuevo) => clasificarVariacion({ costoActual: actual, costoNuevo: nuevo, ...RANGO });

// ── EL RANGO NO SE SUMA AL RECARGO ──────────────────────────────────────────

test("el rango de Arcor arranca en 10 a 20, no en 15 a 25", () => {
  assert.deepEqual(RANGO_POR_DEFECTO, { minPct: 10, maxPct: 20 });
});

test("un costo que ya trae el recargo se compara contra el rango tal cual", () => {
  // 1000 con 5 % de recargo y sin multiplicar es 1050. Contra un costo de 1000
  // eso es +5 %: aumento bajo, no "esperado porque el recargo es 5".
  assert.equal(clas(1000, 1050).estado, ESTADO_VARIACION.AUMENTO_BAJO);
});

// ── LAS CINCO CLASIFICACIONES ───────────────────────────────────────────────

test("dentro del rango es aumento esperado, con los bordes incluidos", () => {
  assert.equal(clas(1000, 1100).estado, ESTADO_VARIACION.ESPERADO, "+10 %");
  assert.equal(clas(1000, 1150).estado, ESTADO_VARIACION.ESPERADO, "+15 %");
  assert.equal(clas(1000, 1200).estado, ESTADO_VARIACION.ESPERADO, "+20 %");
});

test("entre 0 y el mínimo es aumento bajo", () => {
  assert.equal(clas(1000, 1001).estado, ESTADO_VARIACION.AUMENTO_BAJO);
  assert.equal(clas(1000, 1099).estado, ESTADO_VARIACION.AUMENTO_BAJO);
});

test("por encima del máximo es aumento alto", () => {
  assert.equal(clas(1000, 1201).estado, ESTADO_VARIACION.AUMENTO_ALTO);
  assert.equal(clas(1000, 2000).estado, ESTADO_VARIACION.AUMENTO_ALTO);
});

test("el jugo real cae dentro del rango nuevo", () => {
  // 5010 → 5962,16 es +19,0 %, que con 10–20 es esperado.
  const r = clas(5010, 5962.16);
  assert.ok(r.variacionPct > 18.9 && r.variacionPct < 19.1, `dio ${r.variacionPct}`);
  assert.equal(r.estado, ESTADO_VARIACION.ESPERADO);
});

test("el costo que no se mueve es SIN_AUMENTO, medido en centavos", () => {
  assert.equal(clas(1000, 1000).estado, ESTADO_VARIACION.SIN_AUMENTO);
  assert.equal(clas(5962.16, 5962.160001).estado, ESTADO_VARIACION.SIN_AUMENTO);
});

test("bajar es DISMINUCION", () => {
  assert.equal(clas(1000, 999).estado, ESTADO_VARIACION.DISMINUCION);
  assert.equal(clas(21000, 1050).estado, ESTADO_VARIACION.DISMINUCION);
});

test("sin costo anterior no se inventa una comparación", () => {
  assert.equal(clas(0, 1000).estado, ESTADO_VARIACION.SIN_REFERENCIA);
  assert.equal(clas(null, 1000).estado, ESTADO_VARIACION.SIN_REFERENCIA);
  assert.equal(clas(1000, 0).estado, ESTADO_VARIACION.SIN_REFERENCIA);
});

// ── ALERTAS Y CONFIRMACIÓN ──────────────────────────────────────────────────

test("disminución y costo igual llevan alerta fuerte", () => {
  assert.equal(esAlertaFuerte(ESTADO_VARIACION.DISMINUCION), true);
  assert.equal(esAlertaFuerte(ESTADO_VARIACION.SIN_AUMENTO), true);
  assert.equal(esAlertaFuerte(ESTADO_VARIACION.AUMENTO_BAJO), false);
  assert.equal(esAlertaFuerte(ESTADO_VARIACION.ESPERADO), false);
});

test("todo lo que no es esperado exige confirmación explícita", () => {
  for (const e of ["AUMENTO_BAJO", "AUMENTO_ALTO", "SIN_AUMENTO", "DISMINUCION", "SIN_REFERENCIA"]) {
    assert.equal(exigeConfirmacionExplicita(e), true, e);
  }
  assert.equal(exigeConfirmacionExplicita(ESTADO_VARIACION.ESPERADO), false);
});

test("cada estado tiene su token semántico, sin colores sueltos", () => {
  for (const e of Object.values(ESTADO_VARIACION)) {
    assert.match(TONO_ESTADO_VARIACION[e], /^sunmi-text-/, e);
  }
});

// ── EL RANGO CONFIGURABLE ───────────────────────────────────────────────────

test("un rango válido tiene el mínimo por debajo del máximo", () => {
  assert.equal(rangoValido({ minPct: 10, maxPct: 20 }), true);
  assert.equal(rangoValido({ minPct: 20, maxPct: 20 }), true);
  assert.equal(rangoValido({ minPct: 21, maxPct: 20 }), false);
  assert.equal(rangoValido({ minPct: "diez", maxPct: 20 }), false);
  assert.equal(rangoValido({ minPct: -5, maxPct: 20 }), false);
});

test("cambiar el rango cambia la clasificación, no el costo", () => {
  const conAncho = clasificarVariacion({ costoActual: 1000, costoNuevo: 1250, minPct: 10, maxPct: 30 });
  const conAngosto = clasificarVariacion({ costoActual: 1000, costoNuevo: 1250, minPct: 10, maxPct: 20 });
  assert.equal(conAncho.estado, ESTADO_VARIACION.ESPERADO);
  assert.equal(conAngosto.estado, ESTADO_VARIACION.AUMENTO_ALTO);
  assert.equal(conAncho.variacionPct, conAngosto.variacionPct, "la variación es la misma");
});

test("la distancia al rango ordena sin elegir", () => {
  assert.equal(distanciaAlRango({ variacionPct: 15, ...RANGO }), 0);
  assert.equal(distanciaAlRango({ variacionPct: 5, ...RANGO }), 5);
  assert.equal(distanciaAlRango({ variacionPct: 25, ...RANGO }), 5);
});

// ── LO ABSURDO ──────────────────────────────────────────────────────────────

test("absurdo es cambiar de orden de magnitud, no ser caro", () => {
  assert.equal(esAbsurda(25), false);
  assert.equal(esAbsurda(150), false, "caro pero posible");
  assert.equal(esAbsurda(201), true);
  assert.equal(esAbsurda(-50), false);
  assert.equal(esAbsurda(-95), true);
});

// ── LA RECOMENDACIÓN ────────────────────────────────────────────────────────

const hip = (clave, costoNuevo, multiplicador = 1) => ({ clave, costoNuevo, multiplicador });

test("la caja de alfajores: se recomienda el pack porque la unidad es imposible", () => {
  // Precio $1.000 por unidad, caja de 21 que hoy vale $21.000.
  const r = recomendarHipotesis({
    hipotesis: [hip("UNIDAD", 1050), hip("PACK_21", 22050, 21)],
    costoActual: 21000, ...RANGO,
  });
  assert.equal(r.resultado, "RECOMENDADA");
  assert.equal(r.recomendada, "PACK_21");
  const unidad = r.evaluadas.find((h) => h.clave === "UNIDAD");
  assert.equal(unidad.absurda, true, "una caída del 95 % no puede ser");
  const pack = r.evaluadas.find((h) => h.clave === "PACK_21");
  assert.equal(pack.estado, ESTADO_VARIACION.AUMENTO_BAJO, "+5 % queda por debajo del rango");
  assert.equal(exigeConfirmacionExplicita(pack.estado), true, "y aun así hay que confirmarla");
});

test("dos hipótesis creíbles dejan la fila ambigua aunque una esté en rango", () => {
  const r = recomendarHipotesis({
    hipotesis: [hip("A", 1050), hip("B", 1150)],
    costoActual: 1000, ...RANGO,
  });
  assert.equal(r.resultado, "AMBIGUA");
  assert.equal(r.recomendada, null);
});

test("si ninguna es creíble, queda para revisión", () => {
  const r = recomendarHipotesis({
    hipotesis: [hip("A", 100), hip("B", 900000)],
    costoActual: 5000, ...RANGO,
  });
  assert.equal(r.resultado, "REVISAR");
  assert.equal(r.recomendada, null);
});

test("las absurdas siguen visibles y explicadas, no se borran", () => {
  // El caso MOGUL real: la bolsa a $11.601,86 y multiplicar por 208 da millones.
  const r = recomendarHipotesis({
    hipotesis: [hip("UNIDAD", 11601.86), hip("PACK_208", 2413187.81, 208)],
    costoActual: 9700, ...RANGO,
  });
  assert.equal(r.evaluadas.length, 2, "las dos quedan en la lista");
  assert.equal(r.evaluadas.find((h) => h.clave === "PACK_208").absurda, true);
  assert.equal(r.recomendada, "UNIDAD");
});

test("estar dentro del rango NO alcanza para recomendar", () => {
  // Las dos creíbles, una en rango: igual queda ambigua.
  const r = recomendarHipotesis({
    hipotesis: [hip("EN_RANGO", 1150), hip("BAJA", 1020)],
    costoActual: 1000, ...RANGO,
  });
  assert.equal(r.resultado, "AMBIGUA");
});

test("una fila fuera de rango nunca desaparece del análisis", () => {
  const r = recomendarHipotesis({ hipotesis: [hip("A", 800)], costoActual: 1000, ...RANGO });
  assert.equal(r.evaluadas.length, 1);
  assert.equal(r.evaluadas[0].estado, ESTADO_VARIACION.DISMINUCION);
  assert.equal(r.recomendada, "A", "se recomienda igual: bajar no es imposible");
});
