// LOS CANDADOS DE LA REGLA DE GANANCIA.
//
// Lo que defienden, en una línea cada uno: que "falta" signifique falta de
// verdad, que el cero no se confunda con una ausencia, que el recargo fijo no
// entre en la bolsa de los que faltan, y que la marca no le agregue un renglón a
// la tarjeta.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  reglaDeGananciaDe,
  textoDeGanancia,
  GANANCIA_PORCENTAJE,
  GANANCIA_RECARGO,
  GANANCIA_FALTA,
} from "./reglaDeGanancia.js";
import { REGLA_MARGEN, REGLA_RECARGO } from "./recargoFijoUnidad.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// ══ 1 · QUÉ ES "FALTA" ════════════════════════════════════════════════════

test("sin margen y sin recargo: falta", () => {
  assert.equal(
    reglaDeGananciaDe({ margen: null, reglaPrecio: REGLA_MARGEN }).tipo,
    GANANCIA_FALTA
  );
  assert.equal(reglaDeGananciaDe({}).tipo, GANANCIA_FALTA);
  assert.equal(reglaDeGananciaDe().tipo, GANANCIA_FALTA);
});

test("UN CERO NO ES UNA AUSENCIA: margen 0 tiene porcentaje, y dice 0 %", () => {
  // Éste es el que separa esta función de `hayReglaAutomatica`, que para un 0
  // devuelve false. Aquélla contesta "¿hay que recalcular el precio?" y para eso
  // un 0 no alcanza; ésta contesta "¿alguien decidió un porcentaje?", y un 0 es
  // una decisión: vender al costo. Mandar a "falta" las 76 filas en cero sería
  // mandarlas a corregir algo que ya está decidido.
  const r = reglaDeGananciaDe({ margen: 0, reglaPrecio: REGLA_MARGEN });
  assert.equal(r.tipo, GANANCIA_PORCENTAJE);
  assert.equal(r.porcentaje, 0);
  assert.equal(textoDeGanancia(r), "0 %");
});

test("una cadena vacía sí es una ausencia", () => {
  assert.equal(reglaDeGananciaDe({ margen: "" }).tipo, GANANCIA_FALTA);
});

test("un margen negativo es un valor, no una falta", () => {
  const r = reglaDeGananciaDe({ margen: -5, reglaPrecio: REGLA_MARGEN });
  assert.equal(r.tipo, GANANCIA_PORCENTAJE);
  assert.equal(textoDeGanancia(r), "-5 %");
});

// ══ 2 · EL RECARGO FIJO NO ESTÁ "SIN PORCENTAJE" ══════════════════════════

test("recargo fijo con valor: tiene regla, y NO es falta", () => {
  const r = reglaDeGananciaDe({
    margen: null, reglaPrecio: REGLA_RECARGO, recargoFijoUnidad: 100,
  });
  assert.equal(r.tipo, GANANCIA_RECARGO);
  assert.equal(textoDeGanancia(r), "+$100/un");
});

test("un recargo de CERO también es una regla: vender al costo unitario", () => {
  // `hayRecargoConfigurado` acepta el 0 a propósito y acá se hereda esa decisión
  // en vez de volver a tomarla.
  assert.equal(
    reglaDeGananciaDe({ reglaPrecio: REGLA_RECARGO, recargoFijoUnidad: 0 }).tipo,
    GANANCIA_RECARGO
  );
});

test("regla de recargo SIN recargo cargado: eso sí falta", () => {
  assert.equal(
    reglaDeGananciaDe({ margen: null, reglaPrecio: REGLA_RECARGO, recargoFijoUnidad: null }).tipo,
    GANANCIA_FALTA
  );
});

test("EL RECARGO GANA sobre un margen viejo que quedó guardado", () => {
  // Cambiar de regla no borra el margen anterior —el schema lo conserva para
  // poder volver—, así que una fila en modo recargo puede tener los dos campos.
  // Mirar el margen primero mostraría un porcentaje que NO se está aplicando.
  const r = reglaDeGananciaDe({
    margen: 30, reglaPrecio: REGLA_RECARGO, recargoFijoUnidad: 250,
  });
  assert.equal(r.tipo, GANANCIA_RECARGO, "mostró el margen viejo en vez de la regla vigente");
  assert.equal(textoDeGanancia(r), "+$250/un");
});

// ══ 3 · CÓMO SE ESCRIBE ═══════════════════════════════════════════════════

test("el porcentaje va redondeado a entero", () => {
  assert.equal(textoDeGanancia(reglaDeGananciaDe({ margen: 30.43 })), "30 %");
  assert.equal(textoDeGanancia(reglaDeGananciaDe({ margen: 40.63 })), "41 %");
  assert.equal(textoDeGanancia(reglaDeGananciaDe({ margen: 33.33 })), "33 %");
});

test("UN MARGEN CHICO PERO REAL NO SE REDONDEA A CERO", () => {
  // Es la única mentira que el redondeo podría decir: "0 %" ya significa otra
  // cosa —vender al costo— y tiene su propio aviso. Un 0,4 % es poco, no es
  // ninguna de las dos.
  assert.equal(textoDeGanancia(reglaDeGananciaDe({ margen: 0.4 })), "<1 %");
  assert.equal(textoDeGanancia(reglaDeGananciaDe({ margen: -0.4 })), ">-1 %");
  // Y el cero de verdad sigue diciendo 0 %.
  assert.equal(textoDeGanancia(reglaDeGananciaDe({ margen: 0 })), "0 %");
});

test("los porcentajes grandes llevan separador de miles", () => {
  assert.equal(textoDeGanancia(reglaDeGananciaDe({ margen: 1386.77 })), "1.387 %");
});

test("el que falta dice que falta, con palabras", () => {
  // Ni vacío ni un cero: los dos se leen como otra cosa.
  const t = textoDeGanancia(reglaDeGananciaDe({ margen: null }));
  assert.equal(t, "falta %");
  assert.notEqual(t, "");
  assert.notEqual(t, "0 %");
});

// ══ 4 · LA TARJETA NO CRECE ═══════════════════════════════════════════════

test("la marca entra en la fila del valor, que ya existía", () => {
  // El alto de la tarjeta es la restricción dura: a 390 px entran tres y la
  // tercera se pierde con cualquier bloque nuevo. Por eso la marca va DENTRO de
  // la fila del valor —que tiene `min-h-[30px]` y sobra— y no como un div
  // aparte. Medido: 235,2 px con la marca y 235,2 sin ella, en el peor caso.
  const card = leer("components/sunmi/SunmiProductoCard.jsx");
  const fila = card.match(/min-h-\[30px\][^]*?<\/div>/);
  assert.ok(fila, "desapareció la fila del valor");
  assert.match(
    fila[0], /\{marca &&/,
    "la marca ya no se dibuja dentro de la fila del valor: si salió a un bloque propio, la tarjeta crece"
  );
});

test("la pieza del kit no decide QUÉ significa la marca", () => {
  // Misma regla que `aviso`: la tarjeta sabe dibujar, no sabe de negocio. Si
  // acá aparecieran las palabras del catálogo, la próxima pantalla que use la
  // tarjeta heredaría un texto que no es suyo.
  const card = leer("components/sunmi/SunmiProductoCard.jsx");
  for (const palabra of ["falta %", "reglaDeGananciaDe", "margen", "recargo"]) {
    assert.doesNotMatch(
      card, new RegExp(palabra),
      `el kit se enteró del negocio del catálogo: aparece "${palabra}"`
    );
  }
});

test("y los servicios NO llevan marca", () => {
  // Un importe variable no tiene precio fijo, así que no le falta un porcentaje:
  // no le corresponde. Son 12 filas que dirían "falta %" mintiendo.
  const pagina = leer("app/modulos/productos/page.jsx");
  const bloque = pagina.match(/marca=\{[^]*?\n                    \}/);
  assert.ok(bloque, "desapareció la ranura de la marca en el catálogo");
  assert.match(
    bloque[0], /esProductoServicio\(p\)\s*\?\s*null/,
    "los servicios volvieron a mostrar una regla de ganancia que no tienen"
  );
});
