// CANDADOS DEL PAGINADOR COMPARTIDO.
//
// La paginación vivía DENTRO de `SunmiTablaProductos`, así que la lista de
// tarjetas del catálogo —la misma pantalla vista en un celular— no tenía
// ninguna: mostraba los primeros 25 de 2.600 productos y no había forma de
// llegar al 26. Nadie lo notó porque la tabla sí paginaba y las dos vistas son
// la misma pantalla.
//
// Lo que estos candados defienden no es que el componente exista: es que las DOS
// vistas usen el MISMO, y con los mismos manejadores. Dos paginaciones no se
// rompen el día que se escriben, se rompen el día que una cambia — y acá
// "cambiar" significa que el celular pagine distinto que la computadora sobre
// los mismos productos.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
// Los comentarios se sacan ANTES de mirar: un candado que busca texto encuentra
// la prosa que lo explica y se pone verde por el motivo equivocado.
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const PAGINADOR = leer("components/sunmi/SunmiPaginador.jsx");
const TABLA = leer("components/productos/SunmiTablaProductos.jsx");
const PAGINA = leer("app/modulos/productos/page.jsx");

test("el paginador del kit existe y recibe los ocho datos de la paginación", () => {
  for (const prop of [
    "page", "pageSize", "totalPages", "totalItems",
    "onNext", "onPrev", "onGoToPage", "onPageSizeChange",
  ]) {
    assert.match(PAGINADOR, new RegExp(`\\b${prop}\\b`), `le falta ${prop}`);
  }
});

test("la tabla ya no dibuja su propia paginación: usa la del kit", () => {
  assert.match(TABLA, /<SunmiPaginador/);
  // Los textos que eran suyos tienen que haberse ido con la pieza. Si vuelven,
  // hay dos paginadores otra vez y nadie se entera hasta que difieren.
  assert.doesNotMatch(TABLA, /Anterior/, "el botón quedó escrito en la tabla");
  assert.doesNotMatch(TABLA, /Ir a página/, "el campo quedó escrito en la tabla");
});

test("LA LISTA DE TARJETAS TAMBIÉN LO USA, no solo la tabla", () => {
  // Éste es el que atrapa el defecto original. Sin él, el paginador puede estar
  // perfecto en el kit y perfectamente ausente en el celular: la pieza pasa sus
  // candados y la pantalla sigue rota. Es el mismo hueco que ya apareció al
  // mudar la tabla del detalle de pedido — nadie comprobaba que la página se lo
  // PASARA a la tabla.
  const usos = (PAGINA.match(/<SunmiPaginador/g) || []).length;
  assert.equal(usos, 1, "la lista de tarjetas tiene que renderizar el paginador");
  assert.match(PAGINA, /<SunmiTablaProductos/, "y la tabla sigue teniendo el suyo");
});

test("las dos vistas paginan con LOS MISMOS manejadores, definidos una sola vez", () => {
  // Si cada una arma los suyos, el día que uno cambie la aplicación va a paginar
  // distinto según el ancho de pantalla, y eso no lo ve nadie leyendo el diff.
  assert.match(PAGINA, /const propsPaginacion = \{/);
  const repartos = (PAGINA.match(/\{\.\.\.propsPaginacion\}/g) || []).length;
  assert.equal(repartos, 2, "se reparte a la tabla y a la lista de tarjetas");
  // Y no puede haber manejadores sueltos al lado del objeto compartido.
  assert.doesNotMatch(PAGINA, /onGoToPage=\{/, "onGoToPage vuelve a estar escrito a mano");
  assert.doesNotMatch(PAGINA, /onPageSizeChange=\{/, "onPageSizeChange vuelve a estar escrito a mano");
});

test("el paginador NO va adentro de la grilla que iguala alturas", () => {
  // `auto-rows-fr` le da a cada fila el alto de la más alta. Con el paginador
  // adentro, sería una fila más y quedaría del alto de una tarjeta.
  const grilla = /auto-rows-fr[\s\S]*?<\/div>/.exec(PAGINA)?.[0] ?? "";
  assert.doesNotMatch(grilla, /<SunmiPaginador/);
});
