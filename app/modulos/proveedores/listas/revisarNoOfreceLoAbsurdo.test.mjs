// LA PANTALLA DE REVISAR NO PUEDE OFRECER UN COSTO FUERA DE RANGO DE UN TOQUE.
//
// ── EL DEFECTO, QUE APARECIÓ DOS VECES ──────────────────────────────────────
//
// La primera fue la pantalla vieja: un botón que decía "Usar $ 11.083,72" y
// nada más. Un toque y el producto de $1.000 quedaba listo a +1.008 %.
//
// La segunda fue ACÁ, en la pantalla nueva, y se encontró abriéndola con la
// lista real: el botón principal se armaba con
//
//     fila.lecturas.find((l) => l.recomendada) ?? fila.lecturas[0]
//
// y ese `??` es todo el problema. Una fila está en esta cola JUSTAMENTE cuando
// ninguna lectura cae en el rango, así que `find` devuelve `undefined` en el
// caso normal y la caída agarraba la primera. Resultado: sobre un producto de
// $ 661,70 el botón principal —cian, ancho completo, negrita— decía "Usar
// $ 1.320,09 y seguir", que es +99,5 % en un proveedor que aumenta entre 2 y 15.
//
// Y el veto de `aplicacion.js` no lo ataja, que es lo peor: ese veto deja pasar
// lo que una persona eligió sabiendo, y tocar el botón principal CONTABA como
// haberlo elegido sabiendo. La defensa estaba escrita y no llegaba a actuar.
//
// ── POR QUÉ ESTE CANDADO MIRA EL TEXTO ──────────────────────────────────────
//
// Porque el defecto vive en una pantalla que no se puede ejecutar sin DOM ni sin
// datos, y lo que falla no es una función: es qué se le pasa al botón. El
// candado saca los comentarios antes de mirar —este archivo nombra el patrón que
// prohíbe, así que sin eso se pondría verde leyendo su propia prosa— y falla si
// deja de encontrar el botón, para que renombrarlo cueste tanto como romperlo.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test app/modulos/proveedores/listas/revisarNoOfreceLoAbsurdo.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../../../..");
const PANTALLA = "app/modulos/proveedores/listas/[id]/revisar/page.jsx";

const sinComentarios = (t) =>
  t
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const fuente = sinComentarios(fs.readFileSync(path.join(RAIZ, PANTALLA), "utf8"));

test("la pantalla sigue existiendo y sigue teniendo su botón principal", () => {
  // Sin esto, borrar o renombrar la pantalla dejaría los tres candados de abajo
  // en verde sobre un archivo que no dice nada.
  assert.ok(fuente.length > 500, "la pantalla quedó vacía");
  assert.match(fuente, /textoBoton/, "ya no se dibuja el botón que dice el precio");
  assert.match(fuente, /recomendada/, "la pantalla dejó de mirar cuál es la lectura creíble");
});

test("NO HAY CAÍDA A `lecturas[0]`: sin lectura creíble no hay botón principal", () => {
  // ÉSTA ES LA AFIRMACIÓN. Cualquier `?? fila.lecturas[0]` o `|| lecturas[0]`
  // detrás de un `find(recomendada)` reconstruye el defecto exacto.
  assert.ok(
    !/recomendada\s*\)?\s*(\?\?|\|\|)\s*(fila\.)?lecturas\s*\[\s*0\s*\]/.test(fuente),
    "volvió la caída a la primera lectura: el botón principal puede ofrecer un costo fuera de rango"
  );
  // Y el botón principal cuelga de que HAYA recomendada, no de que haya lecturas.
  assert.match(
    fuente,
    /!fila\.sinProducto\s*&&\s*recomendada\s*&&/,
    "el botón principal dejó de exigir una lectura creíble"
  );
});

test("elegir una lectura fuera de rango PREGUNTA antes de guardar", () => {
  // El `aceptarFueraDeRango` no puede salir del mismo toque que elige: eso es
  // lo que convertía un toque en "una persona lo eligió sabiendo".
  assert.match(fuente, /fueraDeRango\s*\?\s*setConfirmandoFuera/,
    "tocar una lectura fuera de rango volvió a confirmar directo");
  assert.match(fuente, /ConfirmarFueraDeRango/, "se fue la hoja que hace la pregunta");
});

test("el `true` de aceptar fuera de rango sale de UN SOLO lugar, y es la respuesta", () => {
  // Se cuentan las apariciones: si mañana aparece un segundo camino que lo
  // manda en `true`, este candado obliga a mirarlo. Hoy el único es el
  // `onConfirmar` de la hoja.
  const veces = [...fuente.matchAll(/aceptarFueraDeRango:\s*true/g)].length;
  assert.equal(
    veces,
    1,
    `hay ${veces} lugares que aceptan un costo fuera de rango; tiene que haber uno solo y ser la respuesta a la pregunta`
  );
});

test("CONTRAPRUEBA: el analizador ve el patrón que prohíbe", () => {
  // Un `assert.ok(!regex.test(...))` con la expresión mal escrita pasa en verde
  // sobre cualquier cosa. Acá se comprueba que la expresión encuentra las tres
  // formas del defecto, incluida la que estaba escrita de verdad.
  const malo = "const e = fila.lecturas.find((l) => l.recomendada) ?? fila.lecturas[0];";
  assert.ok(/recomendada\s*\)?\s*(\?\?|\|\|)\s*(fila\.)?lecturas\s*\[\s*0\s*\]/.test(malo));
  assert.ok(/recomendada\s*\)?\s*(\?\?|\|\|)\s*(fila\.)?lecturas\s*\[\s*0\s*\]/.test(
    "x = l.recomendada) || lecturas[0]"
  ));
  // Y que los comentarios NO cuentan, que es la trampa que este repo ya pisó
  // tres veces: sin esto, la prosa de arriba de este archivo pondría en verde
  // un candado que no mira nada.
  assert.equal(sinComentarios("// recomendada) ?? lecturas[0]\nconst x = 1;").includes("recomendada"), false);
});
