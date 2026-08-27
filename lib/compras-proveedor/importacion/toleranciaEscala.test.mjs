// EL PORCENTAJE ES EVIDENCIA, Y LA TOLERANCIA SE CONFIGURA.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  MARGEN_EVIDENCIA,
  TOLERANCIA_ESCALA_POR_DEFECTO_PCT,
  desvioPct,
  evidenciaAlcanza,
  evidenciaDeEscala,
  toleranciaEscalaPct,
} from "./toleranciaEscala.js";

// Un producto que el ERP compra por bulto de 10 a $50.000: $5.000 la unidad.
const COSTOS = Object.freeze({ costoUnidadErp: 5000, costoBultoErp: 50000 });

test("un precio de $5.050 se explica por la escala de UNIDAD", () => {
  const e = evidenciaDeEscala({ precioPapel: 5050, ...COSTOS });
  assert.equal(e.masCercana, "UNIDAD");
  assert.equal(e.distingue, true);
  assert.equal(e.dentroDeTolerancia, true);
  assert.equal(evidenciaAlcanza(e), true);
});

test("las dos diferencias se informan en porcentaje, no solo la ganadora", () => {
  const e = evidenciaDeEscala({ precioPapel: 5050, ...COSTOS });
  // +1 % contra la unidad, −89,9 % contra el bulto.
  assert.equal(Math.round(e.pctContraUnidad * 10) / 10, 1);
  assert.equal(Math.round(e.pctContraBulto * 10) / 10, -89.9);
  assert.equal(e.desvioDeLaMasCercanaPct, e.pctContraUnidad);
});

test("un precio de $50.500 se explica por la escala de BULTO", () => {
  const e = evidenciaDeEscala({ precioPapel: 50500, ...COSTOS });
  assert.equal(e.masCercana, "BULTO");
  assert.equal(evidenciaAlcanza(e), true);
});

test("EL PORCENTAJE NO DECIDE: decide la distancia, que es simétrica", () => {
  // Diez veces más caro y diez veces más barato están a la MISMA distancia, y
  // tienen que tratarse igual. En porcentaje serían +900 % y −90 %, o sea que
  // usar el porcentaje para elegir favorecería siempre al que está por debajo.
  const arriba = evidenciaDeEscala({ precioPapel: 50000, costoUnidadErp: 5000, costoBultoErp: null });
  const abajo = evidenciaDeEscala({ precioPapel: 500, costoUnidadErp: 5000, costoBultoErp: null });
  assert.equal(Math.round(arriba.separacion * 1000), Math.round(abajo.separacion * 1000));
  // Y los dos quedan FUERA de la tolerancia por defecto, que es lo importante:
  // ninguno se interpreta solo.
  assert.equal(arriba.dentroDeTolerancia, false);
  assert.equal(abajo.dentroDeTolerancia, false);
});

test("si la ganadora queda fuera de la tolerancia, no se interpreta: se pregunta", () => {
  // Un precio a mitad de camino entre las dos referencias: distingue mal Y está
  // lejos de las dos. Las dos condiciones fallan.
  const e = evidenciaDeEscala({ precioPapel: 16000, ...COSTOS });
  assert.equal(evidenciaAlcanza(e), false);
});

test("DISTINGUIR NO ALCANZA: dos referencias igual de malas se distinguen entre sí", () => {
  // $12.000 está 2,4 veces por encima del costo unitario y 4,17 por debajo del
  // costo del bulto. La distancia logarítmica distingue con holgura —margen
  // 0,55— y gana la unidad; pero la unidad queda a +140 %, muy afuera del 40 %.
  const e = evidenciaDeEscala({ precioPapel: 12000, ...COSTOS });
  assert.equal(e.distingue, true, "el margen distingue");
  assert.equal(Math.round(e.desvioDeLaMasCercanaPct), 140);
  assert.equal(e.dentroDeTolerancia, false, "y aun así ninguna es creíble");
  assert.equal(evidenciaAlcanza(e), false);

  // CONTRAPRUEBA: con la tolerancia ensanchada a mano, la misma evidencia
  // alcanza. O sea que la condición nueva es la que está frenando, y no otra.
  const ancha = evidenciaDeEscala({ precioPapel: 12000, ...COSTOS, toleranciaPct: 150 });
  assert.equal(evidenciaAlcanza(ancha), true);
});

test("la tolerancia es configurable y tiene UN default", () => {
  assert.equal(toleranciaEscalaPct(null), TOLERANCIA_ESCALA_POR_DEFECTO_PCT);
  assert.equal(toleranciaEscalaPct(undefined), TOLERANCIA_ESCALA_POR_DEFECTO_PCT);
  assert.equal(toleranciaEscalaPct(15), 15);
  assert.equal(toleranciaEscalaPct(0), 0);
  // Valores imposibles caen al default en vez de romper la interpretación.
  assert.equal(toleranciaEscalaPct(-5), TOLERANCIA_ESCALA_POR_DEFECTO_PCT);
  assert.equal(toleranciaEscalaPct("cualquier cosa"), TOLERANCIA_ESCALA_POR_DEFECTO_PCT);

  const e = evidenciaDeEscala({ precioPapel: 5050, ...COSTOS, toleranciaPct: 0.5 });
  assert.equal(e.toleranciaPct, 0.5);
  assert.equal(e.dentroDeTolerancia, false, "+1 % no entra en una tolerancia de 0,5 %");
});

test("NO HAY NINGÚN 10 % ESCRITO A MANO EN EL MÓDULO", () => {
  // El pedido lo dice expresamente: no hardcodear un margen comercial del 10 %.
  // Se comprueba sobre el archivo, SIN los comentarios: un candado que busca
  // texto encuentra la prosa, y ya dio verde tres veces por eso.
  const codigo = readFileSync(new URL("./toleranciaEscala.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const numeros = [...codigo.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((m) => m[0]);
  // Los únicos números que pueden aparecer en el código son el default —una
  // constante con nombre— y los límites de validación. Un 10 suelto no.
  assert.ok(!numeros.includes("10"), `apareció un 10 en el código: ${numeros.join(", ")}`);
});

test("no se devuelve NINGÚN número para persistir", () => {
  const e = evidenciaDeEscala({ precioPapel: 5050, ...COSTOS });
  // Lo que se persistiría de acá sería `precioSistema ÷ precioPapel`, o sea un
  // factor. Este candado comprueba que ese cociente no está en la respuesta bajo
  // ningún nombre: la evidencia devuelve escalas y distancias, no factores.
  const cociente = COSTOS.costoBultoErp / 5050; // ≈ 9,90
  for (const [clave, valor] of Object.entries(e)) {
    if (typeof valor !== "number") continue;
    assert.ok(
      Math.abs(valor - cociente) > 0.01,
      `el campo "${clave}" vale ${valor}, que es precioSistema ÷ precioPapel`
    );
    assert.ok(
      Math.abs(valor - 1 / cociente) > 0.001,
      `el campo "${clave}" vale ${valor}, que es el cociente invertido`
    );
  }
});

test("sin ninguna referencia no hay evidencia: null, no una corazonada", () => {
  assert.equal(evidenciaDeEscala({ precioPapel: 5050 }), null);
  assert.equal(evidenciaDeEscala({ precioPapel: null, ...COSTOS }), null);
  assert.equal(evidenciaDeEscala({ precioPapel: 0, ...COSTOS }), null);
  assert.equal(evidenciaAlcanza(null), false);
});

test("con una sola referencia se contesta cuál, y sin margen que medir", () => {
  const e = evidenciaDeEscala({ precioPapel: 5050, costoUnidadErp: 5000, costoBultoErp: null });
  assert.equal(e.masCercana, "UNIDAD");
  assert.equal(e.margen, null);
  assert.equal(e.distingue, false);
  // No alcanza para interpretar sola: hay una candidata y ninguna alternativa
  // contra la cual haberla comparado.
  assert.equal(evidenciaAlcanza(e), false);
});

test("desvioPct no divide por cero ni inventa una referencia", () => {
  assert.equal(desvioPct(100, 0), null);
  assert.equal(desvioPct(100, null), null);
  assert.equal(desvioPct(null, 100), null);
  assert.equal(desvioPct(110, 100), 10);
});

test("el margen mínimo tiene nombre y no está escrito adentro de la cuenta", () => {
  assert.equal(typeof MARGEN_EVIDENCIA, "number");
  const codigo = readFileSync(new URL("./toleranciaEscala.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(codigo, /margen >= MARGEN_EVIDENCIA/);
});

test("LAS DOS TOLERANCIAS NO SE TOCAN", () => {
  // La aritmética no puede importar la comercial ni al revés: si fueran un solo
  // número, ensanchar el criterio comercial aflojaría la aritmética en silencio.
  const comercial = readFileSync(new URL("./toleranciaEscala.js", import.meta.url), "utf8");
  const aritmetica = readFileSync(new URL("./coherenciaDeLinea.js", import.meta.url), "utf8");
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!sinComentarios(comercial).includes("coherenciaDeLinea"));
  assert.ok(!sinComentarios(aritmetica).includes("toleranciaEscala"));
});
