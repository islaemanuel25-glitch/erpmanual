// EL SELLO DE OFERTA NO EMPUJA LA TARJETA NI UN PÍXEL.
//
//   node --import ./scripts/alias-loader.mjs --test components/productos/selloDeOfertaEnLaTarjeta.test.mjs
//
// ── POR QUÉ ESTO ES LO PRIMERO QUE HAY QUE AFIRMAR ───────────────────────
//
// La lista del catálogo muestra veinticinco tarjetas a 390 px y entran TRES por
// pantalla. Cualquier cosa que le agregue alto a la tarjeta corre el listado
// entero y puede costar la tercera — ya pasó dos veces en este repo y las dos
// están anotadas en `SunmiProductoCard`: el área táctil de 44 px, que se midió
// antes de ponerla, y la marca de dos renglones, que alineada por la línea base
// hacía crecer la fila 9 px.
//
// La ranura `destacado` es ABSOLUTA justamente por esto, y el kit ya tiene un
// candado que compara la tarjeta con y sin ella. Lo que este archivo agrega es
// el caso NUEVO: con DOS sellos adentro, y con los nombres largos que son
// mayoría en el catálogo.
//
// Se compara el markup renderizado, que es donde se ve si algo pasó a ocupar
// lugar en el flujo. La medición contra el navegador —el alto real en píxeles—
// la hace la sonda de la tarjeta de producto.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import TarjetaProductoMovil from "@/components/productos/TarjetaProductoMovil";
import { TEXTO_SELLO_OFERTA } from "@/components/ofertas/SelloDeOferta";
import { TEXTO_ULTIMO_EDITADO } from "@/lib/productos/estadoDeRetorno";
import { carasDeTarjeta } from "@/lib/productos/carasDeTarjeta";
import { ESCALA_UNIDAD } from "@/lib/precios/escalaDeVenta";

// Un nombre largo de verdad, del catálogo real: son mayoría y envuelven.
const NOMBRE_LARGO = "GALLETITAS SURTIDAS BAGLEY VARIEDAD FAMILIAR 398G PACK X 6 UNIDADES";

// LAS CARAS SE ARMAN CON LA MISMA PIEZA QUE LAS ARMA EN LA PANTALLA.
//
// La primera versión de este candado las escribió a mano, de memoria, y React
// explotó: `presentacion` no es un objeto suelto, lo construye `carasDeTarjeta`.
// Es la regla del repo sobre los datos de prueba — la forma se saca de donde
// vive de verdad, no se escribe de memoria— y acá se cobró en el primer intento.
const CARAS = carasDeTarjeta({
  escala: ESCALA_UNIDAD, precio: 3300, costo: 2500, factor: 1, unidad: "unidad",
});

const OFERTA = { ofertaId: 7, ofertaNombre: "QUILMES", precioOferta: 3300, condicionPago: "CUALQUIER_MEDIO" };

const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(TarjetaProductoMovil, {
      nombre: NOMBRE_LARGO,
      empresa: "Colombres",
      codigoBarra: "7790000000001",
      codigoInterno: "ABC-12",
      caras: CARAS,
      onEditar: () => {},
      ...props,
    })
  );

/**
 * TODO LO QUE OCUPA ALTO: del nombre para abajo.
 *
 * El nodo de los sellos va ANTES del nombre y es absoluto, así que cortar desde
 * el nombre deja exactamente el flujo. Si esa parte queda idéntica con y sin
 * sellos, los sellos no empujaron nada.
 *
 * ── LA PRIMERA VERSIÓN RECORTABA EL NODO CON UNA EXPRESIÓN, Y ESTABA MAL ──
 *
 * Los sellos van adentro de un `span` que a su vez tiene `span`s adentro, así
 * que la expresión cerraba en el primer `</span>` y dejaba uno colgando. El
 * candado se ponía rojo por su propio recorte, no por la tarjeta.
 */
function desdeElNombre(markup) {
  const i = markup.indexOf('<div class="font-semibold');
  assert.ok(i > 0, "no se encontró el nombre: cambió la estructura de la tarjeta");
  return markup.slice(i);
}

// ── 1 · NO EMPUJA ────────────────────────────────────────────────────────

test("S1 · con sello de OFERTA, el resto de la tarjeta queda IDÉNTICO", () => {
  const sin = desdeElNombre(render());
  const con = desdeElNombre(render({ oferta: OFERTA }));
  assert.equal(con, sin, "el sello agregó algo al flujo: la tarjeta va a crecer");
});

test("S2 · y con los DOS sellos tampoco", () => {
  // Es el caso nuevo: hasta ahora `destacado` llevaba uno solo. Dos pastillas
  // son más anchas, pero el ancho no empuja el alto mientras sigan en el nodo
  // absoluto — y eso es justo lo que se comprueba.
  const sin = desdeElNombre(render());
  const dos = desdeElNombre(render({ oferta: OFERTA, ultimoEditado: true }));
  assert.equal(dos, sin, "con dos sellos la tarjeta cambió de estructura");
});

test("S3 · los sellos viven en el nodo ABSOLUTO, que es lo que los hace gratis", () => {
  const markup = render({ oferta: OFERTA, ultimoEditado: true });
  // Lo ÚNICO que el sello agrega fuera de ese nodo es `aria-current`, que es lo
  // que un lector de pantalla anuncia. No dibuja ni ocupa: es un atributo.
  assert.match(markup, /aria-current="true"/, "se perdió el anuncio para lectores de pantalla");
  const capa = /<span class="(absolute bottom-2 right-2[^"]*)">/.exec(markup);
  assert.ok(capa, "la ranura dejó de ser absoluta: a partir de acá SÍ ocupa alto");
  assert.match(capa[1], /pointer-events-none/, "la capa dejó de ser inerte y va a tapar la acción");
});

// ── 2 · APARECE CUANDO Y SOLO CUANDO CORRESPONDE ─────────────────────────

test("S4 · sin oferta no hay sello", () => {
  const markup = render();
  assert.ok(!markup.includes(TEXTO_SELLO_OFERTA), "se pintó un sello sin oferta");
  assert.ok(!/sunmi-badge-success/.test(markup));
});

test("S5 · con oferta, el sello sale en VERDE y con esa palabra", () => {
  const markup = render({ oferta: OFERTA });
  assert.match(markup, new RegExp(TEXTO_SELLO_OFERTA));
  assert.match(markup, /sunmi-badge-success/, "el sello no salió en verde");
});

test("S6 · los DOS sellos conviven, y el de oferta va primero", () => {
  // El orden no es estético: OFERTA sigue estando mañana y "último editado" dura
  // un momento. La fila se alinea a la derecha, así que el transitorio queda
  // pegado al borde y el permanente adentro.
  const markup = render({ oferta: OFERTA, ultimoEditado: true });
  const iOferta = markup.indexOf(TEXTO_SELLO_OFERTA);
  const iEditado = markup.indexOf(TEXTO_ULTIMO_EDITADO);
  assert.ok(iOferta > 0 && iEditado > 0, "falta alguno de los dos sellos");
  assert.ok(iOferta < iEditado, "el sello de oferta quedó después del transitorio");
});

// ── 3 · LA TARJETA NO DECIDE SI LA OFERTA ESTÁ VIGENTE ───────────────────

test("S7 · la tarjeta NO recalcula vigencia: pinta lo que el servidor resolvió", () => {
  // La condición del sello tiene que ser la MISMA con la que el POS cobra, y esa
  // vive en `ofertasVigentesPorProductoLocal`. Un `if` de fechas acá sería una
  // segunda versión de "vigente", y el día que las dos discrepen el catálogo
  // diría una cosa y la caja cobraría otra.
  const fuente = fs
    .readFileSync(
      path.join(import.meta.dirname, "..", "..", "components/productos/TarjetaProductoMovil.jsx"),
      "utf8"
    )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.ok(
    !/inicioEn|finEn|publicadaEn|finalizadaEn|new Date\(/.test(fuente),
    "la tarjeta empezó a decidir vigencia por su cuenta"
  );
});

