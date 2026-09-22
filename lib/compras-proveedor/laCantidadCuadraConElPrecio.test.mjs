// EL PRECIO DELATA LA ESCALA, CON LOS NÚMEROS REALES DE LA HAMBURGUESA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/laCantidadCuadraConElPrecio.test.mjs
//
// El renglón de la Hamburguesa Paty Clásica del pedido 242, medido contra
// producción: el papel factura 90 unidades por $185.110,67, o sea $2.056,79
// cada una. La hoja de Corregir ofrecía 3 y decía "Entra al stock 3 unidades".
// Tres por $2.056,79 son $6.170,36 — treinta veces menos.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  laCantidadCuadraConElPrecio,
  textoDeLaEscalaQueNoCuadra,
  PISO_DE_TOLERANCIA,
} from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";

/** El renglón real, como está guardado. */
const HAMBURGUESA = { subtotal: 185110.67, cantidad: 90 };

test("TRES UNIDADES NO CUADRAN, NOVENTA SÍ", () => {
  const mal = laCantidadCuadraConElPrecio({ ...HAMBURGUESA, fisicas: 3 });
  assert.equal(mal.aplica, true);
  assert.equal(mal.cuadra, false, "la escala equivocada pasó como buena");
  assert.equal(Math.round(mal.valuado * 100) / 100, 6170.36);
  assert.equal(mal.esperado, 90, "dice cuántas tendrían que ser, no solo que está mal");
  assert.equal(Math.round(mal.precioUnitario * 100) / 100, 2056.79);

  const bien = laCantidadCuadraConElPrecio({ ...HAMBURGUESA, fisicas: 90 });
  assert.equal(bien.cuadra, true);
  assert.equal(Math.round(bien.valuado * 100) / 100, 185110.67);
});

test("EL REDONDEO DEL PAPEL NO SE ACUSA", () => {
  // El precio unitario impreso se multiplica y deja centavos sueltos. La
  // tolerancia es un peso de piso más medio por ciento, que sobre este renglón
  // son $925: nada al lado de un error de escala, que es de un factor entero.
  for (const fisicas of [90, 89.999, 90.0001]) {
    assert.equal(laCantidadCuadraConElPrecio({ ...HAMBURGUESA, fisicas }).cuadra, true);
  }
  // Y sobre un renglón chico manda el piso de un peso.
  const chico = { subtotal: 100, cantidad: 10 };
  assert.equal(PISO_DE_TOLERANCIA, 1);
  assert.equal(laCantidadCuadraConElPrecio({ ...chico, fisicas: 10 }).cuadra, true);
  assert.equal(laCantidadCuadraConElPrecio({ ...chico, fisicas: 11 }).cuadra, false);
});

test("LO QUE NO SE PUEDE COMPROBAR NO SE ACUSA", () => {
  // Sin subtotal impreso o sin cantidad del papel no hay igualdad que mirar.
  // Un papel sin total —el de Mauro— tiene igual sus dos números por renglón,
  // así que ese caso sí se mira; el que no se mira es el renglón incompleto.
  for (const falta of [
    { subtotal: null, cantidad: 90, fisicas: 3 },
    { subtotal: 185110.67, cantidad: null, fisicas: 3 },
    { subtotal: 185110.67, cantidad: 90, fisicas: null },
    { subtotal: 185110.67, cantidad: 0, fisicas: 3 },
  ]) {
    const r = laCantidadCuadraConElPrecio(falta);
    assert.equal(r.aplica, false);
    assert.equal(r.cuadra, true, "se acusó un renglón sobre el que no se puede afirmar nada");
  }
});

test("UN PRODUCTO POR KILO NO SE MIRA, Y ES A PROPÓSITO", () => {
  // Lo que entra al stock son kilos y lo que el papel cuenta son piezas: son
  // dos magnitudes distintas. Mirarlas juntas daría un falso positivo en cada
  // fiambre — el danbo del 242 son 3 piezas y 11,685 kg.
  const danbo = { subtotal: 128751.11, cantidad: 3, fisicas: 11.685, porKilo: true };
  const r = laCantidadCuadraConElPrecio(danbo);
  assert.equal(r.aplica, false);
  assert.equal(r.cuadra, true);
  // CONTRAPRUEBA: sin la marca de por kilo, ese mismo renglón se acusaría.
  assert.equal(laCantidadCuadraConElPrecio({ ...danbo, porKilo: false }).cuadra, false);
});

test("EL AVISO DICE LOS DOS IMPORTES Y CUÁNTAS TENDRÍAN QUE SER", () => {
  const r = laCantidadCuadraConElPrecio({ ...HAMBURGUESA, fisicas: 3 });
  const texto = textoDeLaEscalaQueNoCuadra(r, { moneda: (v) => `$${Math.round(v)}` });
  assert.match(texto, /no cuadra con el precio del papel/);
  assert.match(texto, /\$2057/); // el precio por unidad
  assert.match(texto, /\$6170/); // lo que daría
  assert.match(texto, /\$185111/); // lo que el papel cobra
  assert.match(texto, /Tendrían que ser 90/);
  assert.match(texto, /bultos o unidades sueltas/);
  // Cuando cuadra no hay nada que decir.
  assert.equal(textoDeLaEscalaQueNoCuadra(laCantidadCuadraConElPrecio({ ...HAMBURGUESA, fisicas: 90 })), null);
  assert.equal(textoDeLaEscalaQueNoCuadra(null), null);
});

test("UN PAPEL QUE FACTURA POR BULTO NO ES UN ERROR DE ESCALA", () => {
  // ── EL FALSO POSITIVO QUE FRENÓ EL CIERRE DEL 242 ───────────────────
  //
  // Medido en producción el 2026-09-22 a las 10:22 y a las 10:23: el Queso
  // Rallado se factura POR BULTO —el papel dice 6 por $122.714,07— y al stock
  // entran 120, porque el bulto trae 20. Valuar 120 al precio POR BULTO da
  // $2.454.281 contra $122.714 y el control acusaba un renglón perfecto:
  // "entrarían 120 unidades al stock y el papel factura 6".
  const queso = { subtotal: 122714.07, cantidad: 6, fisicas: 120, factorPack: 20 };
  const r = laCantidadCuadraConElPrecio(queso);
  assert.equal(r.aplica, true);
  assert.equal(r.cuadra, true, "se sigue acusando un renglón que está bien");
  // Y dice el número en la escala del stock, que es la que se va a escribir.
  assert.equal(r.esperado, 120);

  // CONTRAPRUEBA: sin el factor, el mismo renglón se acusa — que es lo que
  // pasaba antes de esta tanda.
  const { factorPack, ...sinFactor } = queso;
  assert.equal(laCantidadCuadraConElPrecio(sinFactor).cuadra, false);
});

test("Y LA HAMBURGUESA SE SIGUE ACUSANDO, QUE ES PARA LO QUE ESTO EXISTE", () => {
  // 3 contra 90 no es ninguna de las dos escalas: ni lo que el papel contó ni
  // bultos de 30. El control tiene que seguir frenándolo.
  const mal = laCantidadCuadraConElPrecio({ ...HAMBURGUESA, fisicas: 3, factorPack: 30 });
  assert.equal(mal.cuadra, false);
  // Y las dos escalas buenas pasan: 90 unidades sueltas, o 3 bultos de 30 que
  // entran como 90.
  assert.equal(laCantidadCuadraConElPrecio({ ...HAMBURGUESA, fisicas: 90, factorPack: 30 }).cuadra, true);
});

test("EL FACTOR EN UNO NO CAMBIA NADA", () => {
  // Un producto sin bulto: la única escala posible es la del papel.
  const chico = { subtotal: 100, cantidad: 10, factorPack: 1 };
  assert.equal(laCantidadCuadraConElPrecio({ ...chico, fisicas: 10 }).cuadra, true);
  assert.equal(laCantidadCuadraConElPrecio({ ...chico, fisicas: 11 }).cuadra, false);
  assert.equal(laCantidadCuadraConElPrecio({ ...chico, fisicas: 10 }).esperado, 10);
});
