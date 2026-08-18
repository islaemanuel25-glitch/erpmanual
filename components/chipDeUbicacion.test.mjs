// CANDADOS DEL CHIP DE UBICACIÓN DEL ENCABEZADO.
//
// ── POR QUÉ IMPORTA QUE SE VEA ────────────────────────────────────────────
//
// **El precio depende de la ubicación**: la fila de `ProductoLocal` puede tener
// otro valor en cada local, así que el catálogo muestra un número que solo
// significa algo si se sabe dónde estás parado. El chip llevaba `hidden sm:flex`
// y desaparecía por debajo de 640 px: desde el celular el número no tenía
// contexto.
//
// ── Y POR QUÉ IMPORTA EL TECHO ────────────────────────────────────────────
//
// Sacar el `hidden` no alcanzaba. Medido a 390 px: con `min-w-0` y `truncate`
// solos, un nombre de local de 63 letras llevaba el chip a **450 px y sacaba
// trece elementos fuera de la barra**. Con el techo puesto quedan en 126 px,
// recortados con puntos y cero desbordes, y la barra sigue midiendo 56.
//
// Los tres van juntos: sin `max-w` el chip crece, sin `min-w-0` no puede
// achicarse dentro del flex, y sin `truncate` el texto se sale igual.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SRC = fs
  .readFileSync(path.join(RAIZ, "components/Header.jsx"), "utf8")
  // Los comentarios se sacan antes de mirar: si no, la prosa que explica por qué
  // se sacó el `hidden` haría que el candado lo "encuentre" y dé rojo para
  // siempre. Es el falso positivo que este repo ya tuvo tres veces.
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

/** El bloque del botón del contexto activo, que es el que se defiende. */
function bloqueDelChip() {
  const i = SRC.indexOf("contexto.esDeposito");
  assert.ok(i > 0, "no encontré el chip de contexto en el encabezado");
  // Desde el `{esAdmin && contexto &&` que lo abre hasta un poco después.
  const desde = SRC.lastIndexOf("esAdmin && contexto", i);
  return SRC.slice(desde, i + 400);
}

test("el chip NO se oculta en angosto", () => {
  const bloque = bloqueDelChip();
  assert.doesNotMatch(
    bloque,
    /hidden\s+sm:flex/,
    "volvió el `hidden sm:flex`: desde el celular no se sabría en qué ubicación estás, " +
      "y el precio que muestra el catálogo depende de eso"
  );
});

test("y no rompe la barra con un nombre largo: techo, encogible y recortado", () => {
  const bloque = bloqueDelChip();
  assert.match(bloque, /max-w-36/, "sin techo el chip crece con el texto");
  assert.match(bloque, /sm:max-w-none/, "el techo tiene que soltarse donde sobra lugar");
  assert.match(bloque, /min-w-0/, "sin esto no puede achicarse dentro del flex");
  assert.match(bloque, /truncate/, "sin esto el texto se sale igual");
});

test("el ícono no se deforma cuando el texto se achica", () => {
  const bloque = bloqueDelChip();
  const iconos = bloque.match(/<(Warehouse|Store)[^>]*>/g) || [];
  assert.equal(iconos.length, 2, "tienen que estar los dos íconos, depósito y local");
  for (const i of iconos) {
    assert.match(i, /shrink-0/, `${i.slice(0, 20)}… se va a aplastar al truncar el texto`);
  }
});
