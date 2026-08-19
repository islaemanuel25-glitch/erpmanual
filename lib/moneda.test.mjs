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

// ── ESTE CANDADO CAMBIÓ DE CONTRATO EL 2026-08-19, Y NO ES UN AFLOJE ──────
//
// Decía "NUNCA devuelve vacío, y de eso depende que las tarjetas queden
// parejas", y su motivo era un defecto MEDIDO: devolvía `null` para los sueltos,
// la tarjeta omitía el bloque y en una lista de veinticinco ésas quedaban más
// bajas que las vecinas.
//
// El peligro era real; lo que cambió es que ya no existe. La lista iguala los
// altos con `auto-rows-fr`, así que la más alta manda y las demás la acompañan
// aunque les falte un bloque. **Eso NO se dio por sabido: se volvió a medir en
// la pantalla antes de tocar este archivo.**
//
// Y el motivo para cambiarlo: la línea decía la escala con palabras —"Se vende
// por unidad"— dos centímetros abajo de un rótulo que decía "por unidad". En los
// sueltos era la misma frase dos veces. Ahora queda SOLO la conversión, que es
// lo que el número grande no puede decir solo.

test("devuelve la CONVERSIÓN, y null cuando no hay ninguna", () => {
  // Con conversión: el tamaño del bulto y cuánto sale la unidad.
  assert.equal(
    lineaDeEquivalencia({ precio: 31900, factor: 24, unidad: "pack" }),
    "1 pack = 24 un · $1.329,17 por unidad"
  );
  // Kilo: se va el "Se vende por kilo" que repetía el rótulo, queda la fracción.
  assert.equal(
    lineaDeEquivalencia({ precio: 1298, factor: null, unidad: "kg" }),
    "$129,80 cada 100 g"
  );
  // Suelto: no hay nada que convertir.
  assert.equal(lineaDeEquivalencia({ precio: 2000, factor: null, unidad: "unidad" }), null);

  // Sin precio se dice lo que SÍ se sabe: el tamaño del bulto.
  assert.equal(lineaDeEquivalencia({ precio: null, factor: 24, unidad: "pack" }), "1 pack = 24 un");
  // Sin precio y por kilo no queda nada: la fracción necesitaba el número.
  assert.equal(lineaDeEquivalencia({ precio: null, factor: null, unidad: "kg" }), null);
});

test('"1 pack = 1 un" no se muestra nunca: ése sí era ruido', () => {
  // El caso que no hay que mostrar sigue siendo éste. Antes se reemplazaba por
  // "Se vende por unidad"; ahora directamente no hay línea, porque un pack de 1
  // no tiene ninguna conversión que aportar.
  for (const f of [1, 0, null, undefined, -3, NaN]) {
    assert.equal(
      lineaDeEquivalencia({ precio: 500, factor: f, unidad: "pack" }),
      null,
      `factor ${f}`
    );
  }
});

test("LA PIEZA ES EL PACK CON KILOS: misma forma, otra unidad", () => {
  // Un fiambre de pieza fija se vende por pieza en el depósito y la pieza pesa
  // siempre lo mismo. El valor guardado es por KILO, así que la conversión es la
  // que deja controlar el número de arriba.
  assert.equal(
    lineaDeEquivalencia({
      precio: 1000, unidad: "kg", escala: "por pieza", pesoReferenciaKg: 6,
    }),
    "1 pieza = 6 kg · $1.000,00 por kilo"
  );
  // Sin precio queda el peso, que es lo que no depende del número.
  assert.equal(
    lineaDeEquivalencia({ precio: null, unidad: "kg", escala: "por pieza", pesoReferenciaKg: 6 }),
    "1 pieza = 6 kg"
  );

  // ── EL PESO TIENE QUE PODER MULTIPLICARSE ──────────────────────────────
  //
  // Con el formateo de un decimal —el de las cantidades de stock— una pieza de
  // 0,265 kg salía "0,3 kg", y 0,3 × $1.000 no da los $265 de arriba: la línea
  // diría lo contrario de lo que viene a probar. Es un producto real,
  // `PEHUAMAR CHISITOS 265G`.
  assert.equal(
    lineaDeEquivalencia({
      precio: 1000, unidad: "kg", escala: "por pieza", pesoReferenciaKg: 0.265,
    }),
    "1 pieza = 0,265 kg · $1.000,00 por kilo"
  );
  assert.equal(
    lineaDeEquivalencia({
      precio: 1000, unidad: "kg", escala: "por pieza", pesoReferenciaKg: 1.9,
    }),
    "1 pieza = 1,9 kg · $1.000,00 por kilo"
  );
  // Sin peso no se puede decir nada: no se inventa.
  assert.equal(
    lineaDeEquivalencia({ precio: 1000, unidad: "kg", escala: "por pieza", pesoReferenciaKg: null }),
    null
  );
});

test("EL MISMO PRODUCTO, según en qué escala se venda", () => {
  const pack = { precio: 31900, factor: 24, unidad: "pack" };
  // Se vende por bulto: hace falta saber cuánto sale la unidad.
  assert.equal(
    lineaDeEquivalencia({ ...pack, escala: "por bulto" }),
    "1 pack = 24 un · $1.329,17 por unidad"
  );
  // Se vende por unidad: el número grande YA es el unitario, repetirlo sobra.
  // Queda el tamaño del bulto, que es lo que ese número no dice.
  assert.equal(lineaDeEquivalencia({ ...pack, escala: "por unidad" }), "1 pack = 24 un");
});

// ── EL COMBO ──────────────────────────────────────────────────────────────

test("un combo lo DICE, y se compone con la conversión en vez de reemplazarla", () => {
  assert.equal(
    lineaDeEquivalencia({ precio: 1298, factor: null, unidad: "kg", esCombo: true }),
    "Combo · $129,80 cada 100 g"
  );
  assert.equal(
    lineaDeEquivalencia({ precio: 3499, factor: 6, unidad: "pack", esCombo: true }),
    "Combo · 1 pack = 6 un · $583,17 por unidad"
  );
});

test("EL COMBO SUELTO NO PIERDE SU MARCA AL DESAPARECER LA CONVERSIÓN", () => {
  // Éste es el que impide una regresión silenciosa. La franja es la ÚNICA marca
  // que distingue un combo de un producto común en toda la tarjeta. Al hacer que
  // la línea desaparezca para los sueltos, los combos sueltos se habrían quedado
  // sin marca sin que nadie lo pidiera — 113 combos, medidos.
  assert.equal(
    lineaDeEquivalencia({ precio: 5000, factor: null, unidad: "unidad", esCombo: true }),
    "Combo"
  );
  assert.equal(lineaDeEquivalencia({ esCombo: true }), "Combo");
  assert.equal(lineaDeEquivalencia({ precio: null, esCombo: true }), "Combo");
  // Y el mismo caso SIN combo sí desaparece: la marca es lo único que lo sostiene.
  assert.equal(lineaDeEquivalencia({ precio: 5000, factor: null, unidad: "unidad" }), null);
});

test("la palabra baja a minúscula al dejar de empezar la oración", () => {
  // "Combo · Se vende" se lee como dos títulos pegados. Y las frases que
  // arrancan con un número no se tienen que ver afectadas.
  assert.match(
    lineaDeEquivalencia({ precio: 100, unidad: "kg", esCombo: true }), /^Combo · \$/
  );
  assert.match(lineaDeEquivalencia({ precio: 100, factor: 6, unidad: "pack", esCombo: true }), /· 1 pack/);
});

test("sin combo no aparece la palabra por ningún lado", () => {
  for (const c of [
    { precio: 1298, factor: null, unidad: "kg" },
    { precio: 3499, factor: 6, unidad: "pack" },
  ]) {
    assert.doesNotMatch(lineaDeEquivalencia(c), /Combo/, JSON.stringify(c));
  }
  assert.equal(lineaDeEquivalencia({ precio: 5000, factor: null, unidad: "unidad" }), null);
});

test("el nulo del precio no se cuela como cero", () => {
  // `Number(null)` es 0 y es finito, así que una guarda que sólo mira isFinite
  // deja pasar un producto sin precio y le arma "$0,00 por unidad". Ya pasó.
  const t = lineaDeEquivalencia({ precio: null, factor: 6, unidad: "pack" });
  assert.doesNotMatch(t, /\$0,00/);
});
