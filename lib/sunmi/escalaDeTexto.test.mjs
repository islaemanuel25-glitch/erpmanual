// LA ESCALA DE TAMAÑOS NO SE MANTIENE A MANO: ESTE CANDADO LA MANTIENE.
//
// `esTamanoDeLetra` reconoce los nombres de la escala con una lista escrita en
// código, porque no puede leer la config en runtime —el módulo lo importan cuatro
// piezas `"use client"` y un `require("tailwindcss/defaultTheme")` arrastraría
// Tailwind entero al bundle del navegador—.
//
// Lo que hace que esa lista no se quede vieja en silencio es esto: acá SÍ se lee
// la config, se enumeran todos los nombres de `fontSize` que Tailwind va a
// generar, y se exige que el predicado reconozca cada uno. Agregar un `xs3` a
// `tailwind.config.js` sin tocar el predicado deja este candado rojo nombrándolo.
//
// ── POR QUÉ IMPORTA MÁS QUE EL DEFECTO QUE VINO A ARREGLAR ─────────────────
//
// El defecto viejo era que el predicado decía "sí" de más: cedía el tamaño ante
// un color. Molesta, y se ve.
//
// Un tamaño que el predicado NO RECONOZCA es peor: la pieza pone el suyo Y la
// pantalla pone el suyo, quedan los dos en el atributo, y decide el orden de la
// hoja de estilos — que es exactamente lo que toda esta fase vino a terminar. O
// sea que una lista vieja no reintroduce el defecto viejo: reintroduce el
// original, el que hizo falta negociar.
//
//   node --test lib/sunmi/escalaDeTexto.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { esTamanoDeLetra, declaraTamanoDeLetra } from "./claseNegociada.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

/** Todos los nombres de `fontSize` que Tailwind va a generar para este proyecto. */
function nombresDeLaEscala() {
  const porDefecto = require("tailwindcss/defaultTheme").fontSize;
  const config = require(path.join(RAIZ, "tailwind.config.js"));
  // `extend` SUMA a la escala por defecto; si algún día se usara `theme.fontSize`
  // a secas, la REEMPLAZA. Se contemplan las dos para que el candado no mienta el
  // día que alguien cambie la forma de la config.
  const reemplaza = config?.theme?.fontSize;
  const extiende = config?.theme?.extend?.fontSize || {};
  const base = reemplaza ? Object.keys(reemplaza) : Object.keys(porDefecto);
  return { nombres: [...new Set([...base, ...Object.keys(extiende)])], reemplaza: !!reemplaza, extiende: Object.keys(extiende) };
}

test("el predicado reconoce TODOS los tamaños que la config genera", () => {
  const { nombres, extiende } = nombresDeLaEscala();

  // CONTROL: si la config no aportara ningún nombre, el bucle de abajo no
  // afirmaría nada y este candado pasaría siendo decorativo.
  assert.ok(
    nombres.length >= 13,
    `se leyeron ${nombres.length} tamaños de la config; son demasiado pocos como para que esto esté midiendo algo`
  );
  assert.ok(
    extiende.length > 0,
    "la config no aporta ningún fontSize propio: o cambió tailwind.config.js, o este candado dejó de leerlo donde está"
  );

  const noReconocidos = nombres.filter((n) => !esTamanoDeLetra(`text-${n}`));
  assert.deepEqual(
    noReconocidos,
    [],
    "Estos tamaños EXISTEN en la escala del proyecto y `esTamanoDeLetra` no los reconoce:\n" +
      noReconocidos.map((n) => `  text-${n}`).join("\n") +
      "\n\nUn tamaño no reconocido NO hace ceder a la pieza, así que quedan DOS tamaños en\n" +
      "el atributo y gana el orden de la hoja de estilos. Agregar el nombre a ESCALA en\n" +
      "`lib/sunmi/claseNegociada.js`."
  );
});

test("los tres tamaños propios del proyecto están, uno por uno", () => {
  // Enumerados a propósito y no derivados: si mañana alguien saca `xs2` de la
  // config, el test de arriba seguiría verde —no habría nada que no se reconozca—
  // y éste avisa que se fue algo que el kit usa. `SunmiPar` pone `text-xs2`.
  for (const n of ["xs2", "sm2", "base"]) {
    assert.equal(esTamanoDeLetra(`text-${n}`), true, `text-${n}`);
  }
});

test("la escala completa de Tailwind, incluida la forma Nxl", () => {
  for (const n of ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "9xl"]) {
    assert.equal(esTamanoDeLetra(`text-${n}`), true, `text-${n}`);
  }
  // Y un nombre que NO está en ninguna escala no se cuela por la forma.
  assert.equal(esTamanoDeLetra("text-0xl"), true, "0xl matchea la forma; es un tamaño que Tailwind generaría si se lo configurara");
  assert.equal(esTamanoDeLetra("text-superxl"), false, "no es de la escala y no tiene la forma");
});

test("los valores arbitrarios con unidad cuentan; sin unidad no", () => {
  for (const v of ["text-[12px]", "text-[9.5px]", "text-[1.2rem]", "text-[80%]", "text-[2ch]"]) {
    assert.equal(esTamanoDeLetra(v), true, v);
  }
  // Un arbitrario que NO es una longitud es otra cosa: un color, una variable.
  for (const v of ["text-[#ff0000]", "text-[var(--pos-accent)]", "text-[rgb(0,0,0)]"]) {
    assert.equal(esTamanoDeLetra(v), false, v);
  }
});

test("el `!` no cambia de qué familia es el token", () => {
  assert.equal(esTamanoDeLetra("!text-xs"), true);
  assert.equal(esTamanoDeLetra("!text-white"), false);
});

test("una declaración CON VARIANTE no hace ceder", () => {
  // Ceder un default incondicional por un pedido condicional deja a la pieza sin
  // valor abajo del breakpoint. Hay una sola en el repo: `sm:text-[13px]`.
  for (const v of ["sm:text-sm", "md:text-[13px]", "hover:text-lg", "dark:text-xs"]) {
    assert.equal(declaraTamanoDeLetra(v), false, v);
  }
});
