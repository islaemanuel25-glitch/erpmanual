// Candados del tope de largo del código de barra.
//
// Afirman COMPORTAMIENTO —qué queda en el campo después de intentar escribir—
// y no la forma del archivo. El día que alguien cambie el mecanismo, estos
// siguen valiendo mientras el resultado sea el mismo.
//
// Las dos cosas que protegen son de distinta naturaleza y conviene no
// confundirlas:
//
//   1. Que no entre basura nueva. Es lo que se pidió.
//   2. Que la basura vieja NO SE TOQUE. Es lo que puede romper datos, y es más
//      fácil de romper sin querer: alcanza con "aprovechar" el tope para
//      normalizar al mostrar.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_CODIGO_BARRA,
  alEscribirCodigoBarra,
  paraMostrarCodigoBarra,
} from "./codigoBarra.js";

const rep = (n, c = "A") => c.repeat(n);

test("16 caracteres entran", () => {
  assert.equal(alEscribirCodigoBarra(rep(16), ""), rep(16));
  assert.equal(alEscribirCodigoBarra("0117798091030524", ""), "0117798091030524");
});

test("17 caracteres NO entran: el campo queda como estaba", () => {
  // El corazón del tope. Si esto se rompe, vuelve a poder escribirse un nombre
  // de producto en la columna del código.
  assert.equal(alEscribirCodigoBarra(rep(17), ""), "");
  assert.equal(alEscribirCodigoBarra("LIVRA POMELO 1.5 GAS", ""), "");
  assert.equal(alEscribirCodigoBarra(rep(17), "7790639003536"), "7790639003536");
});

test("el límite es el LARGO, no el tipo: letras y espacios cuentan igual", () => {
  assert.equal(alEscribirCodigoBarra("ESCOBILLON CURVO", ""), "ESCOBILLON CURVO"); // 16
  assert.equal(alEscribirCodigoBarra("bocadito fantoche", ""), ""); // 17
  assert.equal(alEscribirCodigoBarra(rep(16, "9"), ""), rep(16, "9"));
  assert.equal(alEscribirCodigoBarra(rep(17, "9"), ""), "");
});

test("los tres códigos GS1 de 16 dígitos siguen entrando", () => {
  // Es la decisión de negocio que fijó el tope en 16 y no en 14: son etiquetas
  // de bulto emitidas por un lector —el 01 es el identificador GS1 de GTIN— y
  // dos de esos productos se venden. Si alguien baja el tope a 14, este candado
  // se pone rojo antes de que un escaneo real deje de poder guardarse.
  for (const cb of ["0117798091030524", "0147798397440011", "0147798397444200"]) {
    assert.equal(alEscribirCodigoBarra(cb, ""), cb, `debería entrar ${cb}`);
  }
});

test("un código de 14 —el ITF-14 de la caja— sigue entrando", () => {
  assert.equal(alEscribirCodigoBarra("17798091030524", ""), "17798091030524");
});

// ── Lo guardado no se toca ─────────────────────────────────────────────────

test("un producto con 20 caracteres guardados se muestra COMPLETO", () => {
  // Si esto se rompe, abrir la ficha para mirar otra cosa y guardar recorta el
  // código a 16 sin que nadie lo pida. Es una migración de datos disparada por
  // abrir una pantalla.
  const guardado = "LIVRA POMELO 1.5 GAS";
  assert.equal(paraMostrarCodigoBarra(guardado), guardado);
  assert.equal(paraMostrarCodigoBarra(guardado).length, 20);
});

test("un código de 20 guardado se puede acortar, letra por letra", () => {
  let v = "LIVRA POMELO 1.5 GAS";
  // Borrar de a una tiene que funcionar en todo el recorrido, también mientras
  // sigue estando por encima del tope.
  while (v.length > 0) {
    const propuesto = v.slice(0, -1);
    const resultado = alEscribirCodigoBarra(propuesto, v);
    assert.equal(resultado, propuesto, `no dejó borrar en largo ${v.length}`);
    v = resultado;
  }
  assert.equal(v, "");
});

test("un código de 20 guardado se puede editar sin cambiar de largo", () => {
  const guardado = "LIVRA POMELO 1.5 GAS";
  const editado = "LIVRA POMELO 2.5 GAS";
  assert.equal(alEscribirCodigoBarra(editado, guardado), editado);
});

test("un código de 20 guardado NO puede crecer", () => {
  const guardado = "LIVRA POMELO 1.5 GAS";
  assert.equal(alEscribirCodigoBarra(guardado + "X", guardado), guardado);
});

test("el tope no depende del valor anterior cuando el nuevo entra", () => {
  // Reemplazar un código viejo de 20 por uno bueno de 13 tiene que funcionar.
  assert.equal(alEscribirCodigoBarra("7790639003536", "LIVRA POMELO 1.5 GAS"), "7790639003536");
});

test("vaciar el campo siempre se puede", () => {
  assert.equal(alEscribirCodigoBarra("", "LIVRA POMELO 1.5 GAS"), "");
  assert.equal(alEscribirCodigoBarra("", "7790639003536"), "");
});

test("entradas nulas no rompen ni inventan valor", () => {
  assert.equal(alEscribirCodigoBarra(null, "abc"), "");
  assert.equal(alEscribirCodigoBarra(undefined, "abc"), "");
  assert.equal(paraMostrarCodigoBarra(null), "");
  assert.equal(paraMostrarCodigoBarra(undefined), "");
});

test("el tope está en 16", () => {
  // El número lo usa el `maxLength` de cinco campos. Vive en un solo lugar; si
  // alguien lo cambia, que sea a la vista.
  assert.equal(MAX_CODIGO_BARRA, 16);
});
