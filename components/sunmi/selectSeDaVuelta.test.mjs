// EL DESPLEGABLE SE ABRE HACIA ARRIBA CUANDO ABAJO NO ENTRA.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/selectSeDaVuelta.test.mjs
//
// ── EL DEFECTO, VISTO EN PRODUCCIÓN ──────────────────────────────────────
//
// `SunmiSelectAdv` ponía `top: r.bottom + 6` SIEMPRE, sin mirar si abajo había
// lugar. En el panel de recepción del teléfono el campo de motivo está cerca del
// pie, así que la lista se abría contra el borde: se veían "Seleccionar…" y
// "Faltante" a medias y el resto quedaba afuera.
//
// No es una molestia estética. El motivo es OBLIGATORIO para guardar una
// diferencia, así que un desplegable que no se puede desplegar deja una línea
// que no se puede cerrar.
//
// ── POR QUÉ ESTE CANDADO MIRA EL FUENTE Y NO EL RENDER ───────────────────
//
// Porque lo que decide la posición corre en el navegador: `getBoundingClientRect`
// devuelve ceros en `renderToStaticMarkup`, y `window.innerHeight` no existe. Un
// candado de render sobre esto afirmaría sobre un DOM sin geometría, que es
// justamente el candado verde sobre un dato que no existe.
//
// La mitad que SÍ se puede ejercer está en el arnés —`capturas-recepcion-movil`,
// modo `v21-secuencia`—: abre el motivo a 390 px de verdad y mide que las
// opciones queden dentro del viewport. Las dos mitades hacen falta y ninguna
// reemplaza a la otra. Ésta defiende que la DECISIÓN siga escrita; aquélla, que
// el resultado se vea.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fuente = fs
  .readFileSync(path.join(RAIZ, "components/sunmi/SunmiSelectAdv.jsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("la posición MIRA el espacio disponible, no lo supone", () => {
  // El defecto era exactamente esto: un `top` fijo hacia abajo y nada más.
  assert.match(fuente, /window\.innerHeight/, "la posición no mira el alto de la ventana");
  assert.match(fuente, /r\.top/, "la posición no mira cuánto lugar hay ARRIBA del campo");
});

test("y hay una rama que abre hacia ARRIBA", () => {
  // `r.top - 6 - alto` es la fórmula de "por encima del campo". Sin ella, el
  // componente puede mirar el espacio y abrir abajo igual.
  assert.match(
    fuente,
    /r\.top\s*-\s*6\s*-\s*alto/,
    "no existe la rama que abre la lista por encima del campo"
  );
});

test("NO se da vuelta siempre: solo cuando abajo no entra Y arriba hay más lugar", () => {
  // Abrir siempre hacia arriba arreglaría el panel y rompería cualquier
  // desplegable cerca del borde de ARRIBA, que hoy anda bien. La condición tiene
  // que mirar las dos distancias.
  assert.match(fuente, /entraAbajo\s*\|\|\s*espacioArriba\s*<=\s*espacioAbajo/);
  // Y la rama de siempre sigue existiendo.
  assert.match(fuente, /top:\s*r\.bottom\s*\+\s*6/, "se perdió la apertura hacia abajo");
});

test("el alto se MIDE, y no se mide cuando la lista todavía no tiene ancho", () => {
  // Dos trampas juntas. La primera: estimar el alto con `max-h-52` daría 208 px
  // para una lista de tres opciones que mide 120, y se daría vuelta de más.
  assert.match(fuente, /getBoundingClientRect\(\)\.height/, "el alto se está estimando");

  // La segunda, y es la que rompería TODOS los desplegables del ERP: `pos`
  // arranca en ancho cero, así que en la primera pasada la lista está
  // renderizada con `width: 0` y su texto se envuelve letra por letra. Medir ahí
  // dice que no entra abajo nunca.
  assert.match(fuente, /offsetWidth\s*>\s*0/, "se mide el alto sin comprobar que haya ancho");
  assert.match(
    fuente,
    /requestAnimationFrame\(updatePos\)/,
    "falta la segunda pasada, con la lista ya dibujada a su ancho real"
  );
  assert.match(fuente, /cancelAnimationFrame/, "el frame pedido no se cancela al cerrar");
});

test("el desplegable sigue en un portal y por encima de todo", () => {
  // Lo que ya funcionaba y esta tanda no puede romper: si la lista dejara de ir
  // en un portal, el `overflow` de la hoja la volvería a recortar — que es el
  // mismo síntoma por otra causa.
  assert.match(fuente, /createPortal\(dropdown, document\.body\)/);
  assert.match(fuente, /position: "fixed"/);
});
