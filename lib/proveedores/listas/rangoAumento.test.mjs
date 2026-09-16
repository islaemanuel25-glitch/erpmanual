// El rango de aumento esperado: evidencia de coherencia, nunca confirmación.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ESTADO_VARIACION,
  TONO_ESTADO_VARIACION,
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

test("NO hay rango por defecto: el módulo no exporta ninguno", async () => {
  // Acá vivía `RANGO_POR_DEFECTO = { minPct: 10, maxPct: 20 }` y este candado
  // afirmaba su valor. Se fue el 2026-09-16 y lo que se afirma ahora es lo
  // contrario: que no vuelva.
  //
  // El motivo no es prolijidad. El default era 10 a 20 y los aumentos reales
  // andan por el 5 a 8: con ese default puesto, TODAS las filas de una lista
  // real caen fuera del rango y se marcan "aumento bajo". Un valor de fábrica
  // que decide costos es una respuesta inventada, y se ve igual que una
  // contestada.
  const modulo = await import("@/lib/proveedores/listas/rangoAumento");
  assert.equal(
    "RANGO_POR_DEFECTO" in modulo,
    false,
    "volvió un rango de fábrica: el rango se carga por proveedor"
  );

  // Y que no haya vuelto por otra puerta, con otro nombre.
  const fuente = fs.readFileSync(
    path.join(import.meta.dirname, "rangoAumento.js"),
    "utf8"
  ).replace(/\/\/[^\n]*/g, "");
  assert.ok(
    !/minPct:\s*\d/.test(fuente),
    "hay un mínimo de rango escrito a mano en el módulo"
  );
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

test("NULL NO ES CERO: un rango sin cargar no es un rango de 0 a 0", () => {
  // `Number(null)` da 0, así que sin este chequeo un rango vacío pasaba como
  // válido y toda subida caía en "aumento alto" con cara de veredicto. Mientras
  // existió el default el caso no se alcanzaba; al sacarlo, empezó a llegar.
  assert.equal(rangoValido({ minPct: null, maxPct: null }), false);
  assert.equal(rangoValido({ minPct: 5, maxPct: null }), false);
  assert.equal(rangoValido({ minPct: null, maxPct: 8 }), false);
  assert.equal(rangoValido({ minPct: undefined, maxPct: undefined }), false);
  assert.equal(rangoValido({ minPct: "", maxPct: "" }), false);
  // CONTRAPRUEBA: un cero ESCRITO sí es un rango.
  assert.equal(rangoValido({ minPct: 0, maxPct: 0 }), true);
});

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

test("la caja de alfajores: el pack cae en el rango y la unidad no", () => {
  // Precio $1.000 por unidad, caja de 21 que hoy vale $18.000. Por unidad da
  // −94 %; por 21 da +22,5 %, que entra en el rango 10-20… no: da 22,5 y se
  // pasa. Se usa un costo actual que deje al pack adentro, que es el caso real.
  const r = recomendarHipotesis({
    hipotesis: [hip("UNIDAD", 1050), hip("PACK_21", 22050, 21)],
    costoActual: 19000, ...RANGO,
  });
  assert.equal(r.resultado, "RECOMENDADA");
  assert.equal(r.recomendada, "PACK_21", "+16 % entra en 10-20; −94 % no");

  // Las dos siguen visibles y explicadas: no saber cuál es no es motivo para
  // esconderlas, y la que se descartó es lo que explica por qué la otra es la
  // buena.
  const unidad = r.evaluadas.find((h) => h.clave === "UNIDAD");
  assert.equal(unidad.absurda, true, "una caída del 94 % no puede ser");
  assert.equal(unidad.estado, ESTADO_VARIACION.DISMINUCION);
});

test("dos lecturas creíbles pero una sola EN RANGO: se elige esa", () => {
  // Éste es el candado que da vuelta el criterio viejo. Antes esto devolvía
  // AMBIGUA con este comentario al lado: "El porcentaje descarta lo imposible;
  // NO elige entre lo posible". Emanuel pidió el 16/9 que sí elija.
  //
  // +5 % y +15 % son las dos creíbles; con el rango 10-20 solo la segunda entra.
  const r = recomendarHipotesis({
    hipotesis: [hip("A", 1050), hip("B", 1150)],
    costoActual: 1000, ...RANGO,
  });
  assert.equal(r.resultado, "RECOMENDADA");
  assert.equal(r.recomendada, "B");
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

test("estar dentro del rango ES lo que alcanza para recomendar", () => {
  // La contracara del anterior, con las lecturas al revés para que no sea el
  // orden lo que decide.
  const r = recomendarHipotesis({
    hipotesis: [hip("EN_RANGO", 1150), hip("BAJA", 1020)],
    costoActual: 1000, ...RANGO,
  });
  assert.equal(r.resultado, "RECOMENDADA");
  assert.equal(r.recomendada, "EN_RANGO");
});

test("si NINGUNA cae en el rango, la fila se marca para revisar", () => {
  // Las dos creíbles, ninguna adentro: +2 % y +5 % contra un rango de 10 a 20.
  // Antes esto era AMBIGUA —dos creíbles— y ahora es REVISAR, que es lo que el
  // usuario tiene que hacer: mirarla.
  const r = recomendarHipotesis({
    hipotesis: [hip("A", 1020), hip("B", 1050)],
    costoActual: 1000, ...RANGO,
  });
  assert.equal(r.resultado, "REVISAR");
  assert.equal(r.recomendada, null);
});

test("sin rango no se recomienda nada, y las lecturas igual se devuelven", () => {
  const r = recomendarHipotesis({
    hipotesis: [hip("A", 1150)], costoActual: 1000, minPct: null, maxPct: null,
  });
  assert.equal(r.resultado, "REVISAR");
  assert.equal(r.recomendada, null);
  assert.equal(r.evaluadas.length, 1, "no saber cuál es no es motivo para esconderla");
  assert.equal(r.evaluadas[0].estado, ESTADO_VARIACION.SIN_RANGO);
  assert.equal(Math.round(r.evaluadas[0].variacionPct), 15, "el porcentaje sí se puede afirmar");
});

test("una fila fuera de rango nunca desaparece del análisis, pero tampoco se recomienda", () => {
  const r = recomendarHipotesis({ hipotesis: [hip("A", 800)], costoActual: 1000, ...RANGO });
  assert.equal(r.evaluadas.length, 1, "sigue visible con su número");
  assert.equal(r.evaluadas[0].estado, ESTADO_VARIACION.DISMINUCION);
  // Antes se recomendaba igual —"bajar no es imposible"—. Ahora no: una lectura
  // fuera del rango se marca para revisar, que es lo que pidió Emanuel. Bajar
  // sigue sin ser imposible; lo que cambió es que ya no se aplica sola.
  assert.equal(r.recomendada, null);
  assert.equal(r.resultado, "REVISAR");
});
