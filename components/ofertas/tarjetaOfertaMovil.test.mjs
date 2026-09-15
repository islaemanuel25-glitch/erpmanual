// LA TARJETA DE OFERTAS ES LA MISMA PIEZA QUE LA DE STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test components/ofertas/tarjetaOfertaMovil.test.mjs
//
// ── QUÉ DEFIENDE ESTO, Y POR QUÉ NO ALCANZA CON LEERLO ───────────────────
//
// Las tres listas del celular —catálogo, stock y ofertas— usan
// `SunmiProductoCard` a través de un adaptador. Lo que las mantiene iguales no es
// que los tres archivos se parezcan: es que NINGUNO dibuje una caja propia. Un
// `p-2` o un `rounded-lg` de más en cualquiera de ellos las separa, y no se ve
// abriendo una sola pantalla — se ve poniendo las dos al lado, que es lo que hace
// este candado.
//
// Se compara el ARMAZÓN, no el contenido: el panel, el cuerpo, la fila del
// valor, el espaciador del pie y la fila de acciones. Lo que va adentro de cada
// ranura tiene que ser distinto —para eso existen las ranuras—; lo que no puede
// diferir es la caja.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import TarjetaOfertaMovil from "@/components/ofertas/TarjetaOfertaMovil";
import TarjetaStockMovil from "@/components/stock_locales/TarjetaStockMovil";
import { ESTADO_OFERTA } from "@/lib/ofertas/estados";

const AHORA = new Date("2026-09-15T13:00:00.000Z");

const OFERTA = {
  id: 7,
  nombre: "QUILMES CERVEZA 1L",
  producto: "QUILMES CERVEZA 1L",
  estado: ESTADO_OFERTA.ACTIVA,
  inicioEn: "2026-09-14T03:00:00.000Z",
  finEn: "2026-09-18T03:00:00.000Z",
  soloEfectivo: false,
  precioOferta: 3300,
  precioNormal: 3700,
  cantidadProductos: 1,
};

const ITEM_STOCK = {
  id: 3,
  nombre: "QUILMES CERVEZA 1L",
  stock: 12,
  stockMin: 4,
  stockMax: 40,
  limitesConfigurados: true,
  codigoBarra: null,
  faltante: false,
};

const html = (el) => renderToStaticMarkup(el);

const deOferta = (over = {}) =>
  html(
    createElement(TarjetaOfertaMovil, {
      oferta: OFERTA,
      ahora: AHORA,
      puedeEditar: true,
      ...over,
    })
  );

const deStock = (over = {}) =>
  html(
    createElement(TarjetaStockMovil, {
      item: ITEM_STOCK,
      proveedorNombre: "Colombres",
      puedeAjustar: true,
      ...over,
    })
  );

/**
 * EL ARMAZÓN: las clases de los nodos que pone la PIEZA, no las ranuras.
 *
 * Se saca por atributo o por una clase que el kit escribe y ningún adaptador
 * puede producir. Si mañana el kit cambia una de estas cadenas, cambia en los
 * dos lados a la vez y el candado sigue en verde — que es lo correcto: lo que
 * afirma es que son la MISMA pieza, no cuánto mide.
 */
function armazon(markup) {
  const clases = (re) => (re.exec(markup) || [])[1] ?? null;
  return {
    // El panel de afuera: fondo, borde, radio y la elevación. El `class` NO es
    // el primer atributo —el kit escribe `data-sunmi-panel` antes, para que el
    // arnés de capturas pueda recortar panel por panel— así que la expresión
    // tiene que dejarlo pasar. La primera versión anclaba en `^<div class=` y
    // no encontraba nada.
    panel: clases(/<div [^>]*class="([^"]*rounded-2xl[^"]*)"/),
    // El cuerpo, que es quien lleva el padding de la tarjeta.
    cuerpo: clases(/<div class="(relative overflow-hidden[^"]*)"/),
    // La fila donde conviven la marca y el valor.
    filaValor: clases(/<div class="(mt-1\.5 flex justify-end[^"]*)"/),
    // La fila de acciones, con sus márgenes negativos.
    acciones: clases(/<div class="(flex items-stretch divide-x[^"]*)"/),
    // El espaciador que reemplaza al pie cuando no hay códigos.
    espaciador: /<div class="mt-auto"><\/div>/.test(markup),
    pie: /data-pie-codigos/.test(markup),
  };
}

// ── 1 · LA MISMA CAJA QUE STOCK ──────────────────────────────────────────

test("O1 · el panel, el cuerpo y la fila del valor son los MISMOS que en Stock", () => {
  const o = armazon(deOferta());
  const s = armazon(deStock());

  assert.ok(o.panel, "no se encontró el panel de la tarjeta de ofertas");
  assert.equal(o.panel, s.panel, "ofertas dibuja un panel distinto del de stock");
  assert.equal(o.cuerpo, s.cuerpo, "ofertas cambió el padding o el layout del cuerpo");
  assert.equal(o.filaValor, s.filaValor, "la fila del valor no es la misma");
});

test("O2 · la fila de acciones es la misma que la de Stock", () => {
  const o = armazon(deOferta());
  assert.ok(o.acciones, "no se encontró la fila de acciones");
  assert.equal(o.acciones, armazon(deStock()).acciones, "ofertas dibuja su propia fila de acciones");
});

test("O2.bis · HAY UNA SOLA ACCIÓN, y ése es el arreglo del choque", () => {
  // ── POR QUÉ ESTO ES UN CANDADO Y NO UNA PREFERENCIA ────────────────────
  //
  // Con DOS acciones la píldora de estado —que el kit pone absoluta abajo a la
  // derecha— se monta sobre el texto del segundo botón. Medido a 390 px:
  // PROGRAMADA tapaba 35 px, VENCE HOY 21 y ACTIVA 0. Dependía del largo de la
  // palabra, así que aparecía en unas tarjetas y en otras no.
  //
  // Con una sola, el botón ocupa el ancho entero y su texto queda centrado,
  // lejos de esa esquina. Si alguien vuelve a poner dos, el choque vuelve — y
  // este candado se pone rojo antes de que llegue a producción.
  const markup = deOferta();
  const botones = markup.match(/<button/g) || [];
  assert.equal(botones.length, 1, `la tarjeta tiene ${botones.length} acciones, y con dos la píldora tapa la segunda`);
  assert.match(markup, /Editar/);
  assert.ok(!/Terminar ahora/.test(markup), "volvió «Terminar ahora» a la tarjeta");
});

test("O3 · el adaptador no agrega NINGUNA caja propia", () => {
  // La contracara de O1: aquél compara contra stock, éste prohíbe lo que stock
  // tampoco tiene. Un `p-`, un `rounded-` o un `border` escritos en el adaptador
  // serían una segunda tarjeta creciendo al lado.
  const markup = deOferta();
  const panel = armazon(markup).panel;
  assert.equal(
    (markup.match(/rounded-2xl/g) || []).length,
    1,
    "hay más de un panel: el adaptador dibujó una caja"
  );
  assert.ok(panel.includes("sunmi-elevado"), "se perdió el límite visible contra el fondo");
});

// ── 2 · SIN CÓDIGOS, LOS BOTONES SIGUEN ABAJO ────────────────────────────

test("O4 · sin códigos NO se dibuja el pie, pero SÍ el espaciador", () => {
  // Es el caso de ofertas: los dos códigos van en `false`. Si el `mt-auto` se
  // fuera con el pie, en una grilla con `auto-rows-fr` los botones quedarían
  // flotando a media altura, cada tarjeta en un lugar distinto.
  const o = armazon(deOferta());
  assert.equal(o.pie, false, "ofertas está dibujando el pie de códigos");
  assert.equal(o.espaciador, true, "se perdió el espaciador: los botones dejan de estar anclados");
});

test("O5 · el espaciador va ANTES de la fila de acciones", () => {
  // Que exista no alcanza: si quedara después, el `mt-auto` empujaría los
  // botones fuera de su lugar en vez de empujar el hueco.
  const markup = deOferta();
  const iEsp = markup.indexOf('<div class="mt-auto"></div>');
  const iAcc = markup.indexOf('<div class="flex items-stretch divide-x');
  assert.ok(iEsp > 0 && iAcc > 0, "falta alguno de los dos nodos");
  assert.ok(iEsp < iAcc, "el espaciador quedó después de las acciones");
});

test("O6 · sin permiso de editar no hay fila de acciones, y el espaciador se queda", () => {
  const o = armazon(deOferta({ puedeEditar: false }));
  assert.equal(o.acciones, null, "se dibujó una fila de acciones vacía");
  assert.equal(o.espaciador, true);
});

// ── 3 · LAS RANURAS LLEVAN LO QUE TIENEN QUE LLEVAR ──────────────────────

test("O7 · el sello de estado va en la píldora, NO en la ranura de aviso", () => {
  // `aviso` sale siempre en ámbar y con triángulo, fijo en el kit. Si el estado
  // se dibujara ahí, ACTIVA se vería como una advertencia — y pintarla de verde
  // obligaría a tocar `SunmiProductoCard`, que dibuja también stock.
  const markup = deOferta();
  assert.match(markup, /sunmi-badge-success/, "ACTIVA no salió en verde");
  assert.match(markup, /ACTIVA/);
  assert.ok(
    !/lucide-triangle-alert|TriangleAlert/.test(markup),
    "el estado se dibujó en la ranura de aviso"
  );
});

test("O8 · la línea de cuándo va donde el catálogo pone el proveedor", () => {
  const markup = deOferta();
  assert.match(markup, /Termina el jueves 17 de septiembre/);
  // Y con efectivo se agrega, no reemplaza.
  assert.match(deOferta({ oferta: { ...OFERTA, soloEfectivo: true } }), /· Solo efectivo/);
});

test("O9 · el precio de oferta va en el bloque del valor, con su rótulo", () => {
  const markup = deOferta();
  assert.match(markup, /PRECIO DE OFERTA/);
  assert.match(markup, /data-cara-precio/, "no se usó el bloque del kit");
  assert.match(markup, /Normal \$ 3\.700/);
  assert.match(markup, /11 % menos/);
});

test("O10 · con VARIOS productos no se inventa un precio", () => {
  // Mostrar el de una línea como si fuera el de la oferta es una afirmación
  // falsa sobre las otras. Sin precio, el bloque no se dibuja y la marca dice
  // cuántos hay.
  const markup = deOferta({
    oferta: { ...OFERTA, precioOferta: null, precioNormal: null, cantidadProductos: 3 },
  });
  assert.ok(!/PRECIO DE OFERTA/.test(markup), "se dibujó un precio que no existe");
  assert.ok(!/data-cara-precio/.test(markup));
  assert.match(markup, /3 productos/);
});
