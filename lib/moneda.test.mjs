// CANDADOS DEL FORMATEADOR Y DE LA LÍNEA DE EQUIVALENCIA.
//
// El archivo no tenía ninguno. Se escriben ahora porque la línea de equivalencia
// acaba de cambiar de contrato —antes podía devolver `null`, ahora nunca— y ese
// contrato es el que sostiene que las tarjetas del catálogo queden todas del
// mismo alto. Un `null` que vuelva por descuido no rompe nada visible en el
// código: rompe la lista, en el celular, y solo se ve abriéndola.

import test from "node:test";
import assert from "node:assert/strict";

import { formatearMoneda, formatearKg, lineaDeEquivalencia, SIN_VALOR } from "./moneda.js";

// ── EL FORMATO ────────────────────────────────────────────────────────────

test("dos decimales SIEMPRE, arriba y abajo", () => {
  assert.equal(formatearMoneda(24980), "$24.980,00");
  // El máximo también se fija: sin eso el default lo lleva a tres y un costo de
  // 166860.005 sale con un decimal de más que nadie puede comparar de un vistazo.
  assert.equal(formatearMoneda(166860.005), "$166.860,01");
  assert.equal(formatearMoneda(128864.36), "$128.864,36");
});

test("el nulo NO es cero: devuelve una raya", () => {
  // Regla de negocio, no de estilo: un producto sin costo mostrando $0,00 se lee
  // como que vale cero, y alguien lo vende a pérdida.
  for (const v of [null, undefined, ""]) assert.equal(formatearMoneda(v), SIN_VALOR);
  assert.equal(formatearMoneda("no es un número"), SIN_VALOR);
  // Y el cero SÍ es cero: es un valor cargado, no una ausencia.
  assert.equal(formatearMoneda(0), "$0,00");
});

test("los kilos llevan un decimal, no dos", () => {
  assert.equal(formatearKg(8.4), "8,4 kg");
  assert.equal(formatearKg(null), SIN_VALOR);
});

// ── LA LÍNEA DE EQUIVALENCIA ──────────────────────────────────────────────

test("NUNCA devuelve vacío, y de eso depende que las tarjetas queden parejas", () => {
  // Este es el candado que importa. Devolvía `null` para los sueltos, la tarjeta
  // omitía el bloque entero, y en una lista de veinticinco esas quedaban más
  // bajas que las vecinas.
  const casos = [
    { precio: 31900, factor: 24, unidad: "pack" },
    { precio: 2000, factor: null, unidad: "unidad" },
    { precio: 1298, factor: null, unidad: "kg" },
    { precio: null, factor: 24, unidad: "pack" },
    { precio: null, factor: null, unidad: "unidad" },
    { precio: 0, factor: 1, unidad: "pack" },
    {},
  ];
  for (const c of casos) {
    const t = lineaDeEquivalencia(c);
    assert.equal(typeof t, "string", `devolvió ${t} para ${JSON.stringify(c)}`);
    assert.ok(t.length > 0, `devolvió vacío para ${JSON.stringify(c)}`);
  }
});

test("los cinco casos dicen lo que corresponde", () => {
  assert.equal(
    lineaDeEquivalencia({ precio: 31900, factor: 24, unidad: "pack" }),
    "1 pack = 24 un · $1.329,17 por unidad"
  );
  assert.equal(
    lineaDeEquivalencia({ precio: 1298, factor: null, unidad: "kg" }),
    "Se vende por kilo · $129,80 cada 100 g"
  );
  assert.equal(
    lineaDeEquivalencia({ precio: 2000, factor: null, unidad: "unidad" }),
    "Se vende por unidad"
  );
  // Sin precio se dice la escala igual: es lo que SÍ se sabe. Antes se perdía la
  // línea entera y con ella el dato que no dependía del precio.
  assert.equal(lineaDeEquivalencia({ precio: null, factor: 24, unidad: "pack" }), "1 pack = 24 un");
  assert.equal(lineaDeEquivalencia({ precio: null, factor: null, unidad: "kg" }), "Se vende por kilo");
});

test('"1 pack = 1 un" no se muestra nunca: ése sí era ruido', () => {
  // El argumento viejo era correcto y la conclusión estaba mal. El caso que no
  // hay que mostrar es éste, no "no hay equivalencia".
  for (const f of [1, 0, null, undefined, -3, NaN]) {
    assert.equal(
      lineaDeEquivalencia({ precio: 500, factor: f, unidad: "pack" }),
      "Se vende por unidad",
      `factor ${f}`
    );
  }
});

// ── EL COMBO ──────────────────────────────────────────────────────────────

test("un combo lo DICE, y se compone con la escala en vez de reemplazarla", () => {
  // Los 142 combos de producción no se distinguían de un producto común en
  // ninguna parte de la tarjeta.
  assert.equal(
    lineaDeEquivalencia({ precio: 5000, factor: null, unidad: "unidad", esCombo: true }),
    "Combo · se vende por unidad"
  );
  assert.equal(
    lineaDeEquivalencia({ precio: 1298, factor: null, unidad: "kg", esCombo: true }),
    "Combo · se vende por kilo · $129,80 cada 100 g"
  );
  assert.equal(
    lineaDeEquivalencia({ precio: 3499, factor: 6, unidad: "pack", esCombo: true }),
    "Combo · 1 pack = 6 un · $583,17 por unidad"
  );
});

test("la palabra baja a minúscula al dejar de empezar la oración", () => {
  // "Combo · Se vende" se lee como dos títulos pegados. Y las frases que
  // arrancan con un número no se tienen que ver afectadas.
  assert.match(lineaDeEquivalencia({ precio: 100, unidad: "unidad", esCombo: true }), /· se vende/);
  assert.match(lineaDeEquivalencia({ precio: 100, factor: 6, unidad: "pack", esCombo: true }), /· 1 pack/);
});

test("sin combo no aparece la palabra por ningún lado", () => {
  for (const c of [
    { precio: 5000, factor: null, unidad: "unidad" },
    { precio: 1298, factor: null, unidad: "kg" },
    { precio: 3499, factor: 6, unidad: "pack" },
  ]) {
    assert.doesNotMatch(lineaDeEquivalencia(c), /Combo/, JSON.stringify(c));
    // Y la frase sigue empezando con mayúscula cuando no lleva prefijo.
    if (!c.factor) assert.match(lineaDeEquivalencia(c), /^Se vende/);
  }
});

test("el combo sigue sin devolver vacío nunca", () => {
  // La franja tiene que estar siempre: si desaparece, esa tarjeta queda más baja
  // que las vecinas.
  for (const c of [{}, { esCombo: true }, { precio: null, esCombo: true }]) {
    const t = lineaDeEquivalencia(c);
    assert.equal(typeof t, "string");
    assert.ok(t.length > 0, JSON.stringify(c));
  }
});

test("el nulo del precio no se cuela como cero", () => {
  // `Number(null)` es 0 y es finito, así que una guarda que sólo mira isFinite
  // deja pasar un producto sin precio y le arma "$0,00 por unidad". Ya pasó.
  const t = lineaDeEquivalencia({ precio: null, factor: 6, unidad: "pack" });
  assert.doesNotMatch(t, /\$0,00/);
});
