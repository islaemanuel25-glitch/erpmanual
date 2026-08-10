// Candados de quién gana el ancho en SunmiInput.
//
// Afirman COMPORTAMIENTO —con qué ancho termina el input— y no la forma del
// archivo. Por eso miran la cadena de clases resultante y no si el componente
// escribe tal o cual literal: el día que alguien reordene, renombre la base o
// cambie el mecanismo, estos candados siguen valiendo mientras el ancho pedido
// siga ganando.
//
// El caso que originó todo: `w-full` iba siempre, empataba en especificidad con
// el ancho pedido y le ganaba por orden de hoja de estilos. Medido: 75 de 77
// inputs de una pantalla tenían width 100 % pese a pedir un ancho fijo.

import { test } from "node:test";
import assert from "node:assert/strict";

import { componerClaseInput, declaraAncho } from "./claseAncho.js";

const BASE = "sunmi-input disabled:opacity-60";
const tieneFull = (s) => s.split(/\s+/).includes("w-full");

test("sin ancho pedido, el input sigue siendo w-full", () => {
  // Los 193 usos que no piden ancho dependen de esto. Si se rompe, la ficha de
  // producto, los modales de caja y el login quedan con el ancho por defecto del
  // navegador.
  assert.equal(tieneFull(componerClaseInput("", BASE)), true);
  assert.equal(tieneFull(componerClaseInput(undefined, BASE)), true);
  assert.equal(tieneFull(componerClaseInput("text-center !py-0.5", BASE)), true);
});

test("con un ancho pedido, w-full NO se agrega: gana el ancho pedido", () => {
  // El corazón del arreglo. Si vuelve a aparecer w-full acá, el ancho pedido
  // vuelve a ser decorativo y los anchos escritos dejan de aplicarse.
  for (const pedido of ["w-[46px]", "w-24", "w-1/2", "w-px", "w-auto", "!w-[104px]"]) {
    const r = componerClaseInput(`${pedido} text-center`, BASE);
    assert.equal(tieneFull(r), false, `w-full no debería estar con "${pedido}": ${r}`);
    assert.ok(r.split(/\s+/).includes(pedido), `falta el ancho pedido en: ${r}`);
  }
});

test("el ancho pedido puede estar en cualquier posición de la cadena", () => {
  // Nadie escribe el ancho siempre primero. Si el reconocimiento dependiera de
  // la posición, funcionaría en unos sitios y en otros no.
  assert.equal(tieneFull(componerClaseInput("text-right tabular-nums w-[90px]", BASE)), false);
  assert.equal(tieneFull(componerClaseInput("w-[90px]", BASE)), false);
  assert.equal(tieneFull(componerClaseInput("  text-right   w-16   !py-1  ", BASE)), false);
});

test("min-w- y max-w- NO son un ancho: w-full se conserva", () => {
  // Son otras propiedades CSS. `max-w-sm` acota un input que igual tiene que
  // estirarse; si w-full se fuera, el input quedaría sin ancho y solo con tope.
  for (const pedido of ["max-w-sm", "min-w-0", "min-w-[120px]", "max-w-[40ch] text-center"]) {
    assert.equal(tieneFull(componerClaseInput(pedido, BASE)), true, `w-full debería seguir con "${pedido}"`);
  }
  assert.equal(declaraAncho("min-w-24"), false);
  assert.equal(declaraAncho("max-w-24"), false);
});

test("un ancho con variante NO alcanza para sacar w-full", () => {
  // `sm:w-40` solo vale de sm para arriba. Sacar w-full por él dejaría al input
  // sin ancho por debajo del breakpoint, que es justamente el teléfono.
  assert.equal(tieneFull(componerClaseInput("sm:w-40", BASE)), true);
  assert.equal(tieneFull(componerClaseInput("hover:w-1/2", BASE)), true);
  assert.equal(tieneFull(componerClaseInput("md:w-[200px] text-center", BASE)), true);
});

test("variante Y ancho base juntos: manda el base, w-full se va", () => {
  // Acá el input sí tiene ancho en todos los casos, así que w-full sobra.
  const r = componerClaseInput("w-16 sm:w-40", BASE);
  assert.equal(tieneFull(r), false, r);
});

test("la base del componente nunca se pierde", () => {
  // Si `sunmi-input` desapareciera, el input perdería tipografía, borde y
  // padding, y el cálculo de cuánto texto entra dejaría de valer.
  for (const pedido of ["", "w-[46px]", "max-w-sm"]) {
    assert.ok(componerClaseInput(pedido, BASE).startsWith("sunmi-input"), `base perdida con "${pedido}"`);
  }
});

test("lo que pide quien usa el componente va DESPUÉS de la base", () => {
  // No decide especificidad, pero sí legibilidad al inspeccionar el DOM: la
  // última clase escrita es la que alguien puso a mano.
  const r = componerClaseInput("text-center", BASE);
  assert.ok(r.indexOf("text-center") > r.indexOf("sunmi-input"), r);
});

test("entradas basura no rompen ni cuelan un ancho", () => {
  assert.equal(tieneFull(componerClaseInput(null, BASE)), true);
  assert.equal(tieneFull(componerClaseInput(123, BASE)), true);
  assert.equal(declaraAncho("w-"), false, "'w-' pelado no es un ancho");
  assert.equal(declaraAncho("wide"), false);
  assert.equal(declaraAncho("shadow-[0_0_0_1px]"), false);
});
