// Leer un número de una lista argentina, sin inventar magnitudes.
//
// Los valores de este archivo están COPIADOS de las cuatro listas reales, no
// escritos de memoria: "4.337,1" con un solo decimal, "5.590" sin coma y
// "-12,0" en negativo son formas que aparecen en el papel, y cada una rompe una
// lectura ingenua distinta.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  numeroDeLista,
  pareceNumero,
  descuentoDeLista,
  cantidadDeLista,
  cantidadEnNombre,
} from "@/lib/proveedores/listas/lectura/numeroDeLista";

// ── LA COMA MANDA ───────────────────────────────────────────────────────────

test("con coma, el punto es de miles", () => {
  assert.equal(numeroDeLista("1.430,19"), 1430.19); // lista de M Y F
  assert.equal(numeroDeLista("4.337,1"), 4337.1); // lista de bebidas: UN decimal
  assert.equal(numeroDeLista("$ 6.314,05"), 6314.05); // lista de AASS
  assert.equal(numeroDeLista("114.797,39 $"), 114797.39); // el signo también va detrás
});

test("el archivo en formato inglés también se lee bien", () => {
  // CONTRAPRUEBA DE LA REGLA, y el caso es el que más caro salía: el Excel de
  // Arcor —el que el módulo ya viene importando— escribe "$1,253.69". Con la
  // regla de que la coma siempre es el decimal, eso se leía 1,25369. Mil veces
  // menos, sin fallar, y con cara de precio.
  assert.equal(numeroDeLista("$1,253.69"), 1253.69);
  assert.equal(numeroDeLista("$982.33"), 982.33);
  assert.equal(numeroDeLista("$1,188.62"), 1188.62);
  assert.equal(numeroDeLista("1,234,567"), 1234567);
  // Y el mismo número escrito de las dos maneras da lo mismo.
  assert.equal(numeroDeLista("1,253.69"), numeroDeLista("1.253,69"));
});

test("lo que no es ninguna de las dos formas se rechaza en vez de adivinarse", () => {
  // El mismo carácter no puede ser decimal y de miles a la vez.
  assert.equal(numeroDeLista("1.234.5"), null);
  assert.equal(numeroDeLista("1,2,3"), null);
  // Y los dos caracteres mezclados con tres dígitos al final tampoco: "1.234,567"
  // podría ser mil doscientos treinta y cuatro con quinientos setenta y seis
  // milésimos, y un precio no tiene tres decimales.
  assert.equal(numeroDeLista("1.234,567"), null);
  // Los grupos de miles son de tres exactos.
  assert.equal(numeroDeLista("1.23.456"), null);
});

test("sin coma, TRES dígitos después del punto son miles", () => {
  // CONTRAPRUEBA DE LA REGLA: `Number("5.590")` da 5,59. Mil veces menos, y sin
  // fallar. Si esta afirmación se rompe, un precio de lista entra al motor con
  // la magnitud de un centavo y la conciliación lo compara contra un costo real.
  assert.equal(numeroDeLista("5.590"), 5590);
  assert.notEqual(numeroDeLista("5.590"), Number("5.590"));
  assert.equal(numeroDeLista("1.234.567"), 1234567);
});

test("sin coma, uno o dos dígitos después del punto son decimales", () => {
  assert.equal(numeroDeLista("12.5"), 12.5);
  assert.equal(numeroDeLista("12.50"), 12.5);
  // Cuatro dígitos no es ninguna de las dos formas conocidas: no se adivina.
  assert.equal(numeroDeLista("12.5000"), null);
  // "1.234.5" tampoco: mezcla las dos formas.
  assert.equal(numeroDeLista("1.234.5"), null);
});

test("lo que el archivo escribe para decir que no hay número da null, no cero", () => {
  // Un cero ES un precio; "no hay precio" no lo es. Confundirlos metería una
  // fila sin precio al motor como una fila de precio cero.
  for (const v of ["", "-", "$ -", "  ", "s/d", "n/a"]) {
    assert.equal(numeroDeLista(v), null, `"${v}" tendría que dar null`);
  }
  assert.equal(numeroDeLista("0"), 0);
  assert.equal(pareceNumero("$ -"), false);
  assert.equal(pareceNumero("0"), true);
});

test("dos comas no son un número", () => {
  assert.equal(numeroDeLista("1,2,3"), null);
});

// ── EL DESCUENTO ────────────────────────────────────────────────────────────

test("el descuento escrito en negativo es el mismo descuento", () => {
  // La lista de M Y F escribe TODA su columna "Desc%" en negativo. Devolverlo
  // negativo haría que aplicar el descuento SUBIERA el precio.
  assert.equal(descuentoDeLista("-12,0"), 12);
  assert.equal(descuentoDeLista("39%"), 39); // lista de DREAMCO
  assert.equal(descuentoDeLista("12"), 12);
  assert.equal(descuentoDeLista("-12,0"), descuentoDeLista("12"));
});

test("un descuento de más de 100 no se acepta", () => {
  // Aceptarlo daría un precio negativo sin que nada avise.
  assert.equal(descuentoDeLista("900"), null);
  assert.equal(descuentoDeLista("-900"), null);
  assert.equal(descuentoDeLista("100"), 100);
});

// ── LA CANTIDAD ─────────────────────────────────────────────────────────────

test("la cantidad por bulto es un entero de uno en adelante", () => {
  assert.equal(cantidadDeLista("12"), 12); // "UxB" de DREAMCO
  assert.equal(cantidadDeLista("6"), 6); // "UND" de la lista de bebidas
  assert.equal(cantidadDeLista("0"), null);
  assert.equal(cantidadDeLista("1,5"), null); // redondear multiplicaría un precio
  assert.equal(cantidadDeLista("-3"), null);
});

test("del nombre sale el PRIMER número del par, no el segundo", () => {
  // "6 X 1500" son seis botellas de litro y medio. Al revés, el precio del
  // bulto se dividiría por mil quinientos.
  assert.equal(cantidadEnNombre("AGUA BAGGIO VIDA MANZANA 6 X 1500"), 6);
  assert.equal(cantidadEnNombre("TOSTEX CHIPS COLORES BOLSA 10 X 270 G."), 10);
  assert.equal(cantidadEnNombre("PB SH BRILLO 12X1 CORAZÓN"), 12);
  assert.equal(cantidadEnNombre("FID. MOLTO SPAGUETTI 20X500 GR"), 20);
  assert.equal(cantidadEnNombre("LIVRA MANZANA 500 c.c"), null); // no hay par
});

test("la cantidad del nombre es una CANDIDATA y el módulo no la mezcla con la del archivo", () => {
  // Son dos preguntas distintas y se responden con dos funciones distintas: la
  // del catálogo manda sobre las dos, y eso lo decide el motor, no este módulo.
  assert.equal(cantidadDeLista("AGUA BAGGIO VIDA MANZANA 6 X 1500"), null);
});
