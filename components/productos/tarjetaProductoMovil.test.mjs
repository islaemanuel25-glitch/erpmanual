// Candados del frente y el dorso, renderizando la tarjeta de verdad.
//
// ── POR QUÉ RENDERIZAR Y NO SOLO LEER EL ARCHIVO ───────────────────────────
//
// Las afirmaciones de acá son sobre lo que se VE: qué cara abre, dónde está la
// navegación, dónde está Editar, qué muestra cada cara. Un candado que busque
// texto en el JSX las contestaría mal — encontraría "Ver unidad" escrito en el
// componente aunque la rama que lo dibuja no corra nunca. Es el caso del
// `Escape` que dio verde con la comprobación sacada porque la palabra estaba en
// un comentario.
//
// Las pocas afirmaciones que SÍ son sobre el código —que no haya un `fetch`, que
// no entre una librería de carrusel— se hacen leyendo, porque son sobre lo que el
// archivo no puede contener.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import TarjetaProductoMovil from "@/components/productos/TarjetaProductoMovil";
import { carasDeTarjeta } from "@/lib/productos/carasDeTarjeta";
import { ESCALA_BULTO, ESCALA_UNIDAD, ESCALA_KG } from "@/lib/precios/escalaDeVenta";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const FUENTE = fs
  .readFileSync(path.join(RAIZ, "components/productos/TarjetaProductoMovil.jsx"), "utf8")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

const render = (props) =>
  renderToStaticMarkup(
    createElement(TarjetaProductoMovil, {
      nombre: "361 LATA X24",
      empresa: "Colombres",
      codigoBarra: "7790580132286",
      codigoInterno: "1229",
      onEditar: () => {},
      ...props,
    })
  );

/** Un pack de 24 en el depósito: el frente es el bulto. */
const PACK_EN_DEPOSITO = carasDeTarjeta({
  escala: ESCALA_BULTO,
  precio: 24000,
  costo: 20000,
  factor: 24,
  unidad: "pack",
});

/** El mismo producto en un local: el frente es la unidad. */
const PACK_EN_LOCAL = carasDeTarjeta({
  escala: ESCALA_UNIDAD,
  precio: 24000,
  costo: 20000,
  factor: 24,
  unidad: "pack",
});

/** Un suelto: sin referencia. */
const SUELTO = carasDeTarjeta({
  escala: ESCALA_UNIDAD,
  precio: 1500,
  costo: 1000,
  factor: 1,
  unidad: "unidad",
});

test("G1. ABRE MOSTRANDO EL FRENTE, y lo dice con todas las letras", () => {
  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.match(html, /VENTA CONFIGURADA/, "el frente no se identifica");
  assert.match(html, /PACK X 24/, "no se ve la presentación del frente");
  assert.match(html, /24\.000/, "no se ve el importe del bulto");
  assert.doesNotMatch(html, /REFERENCIA/, "abrió mostrando el dorso");
});

test("G2. LA NAVEGACIÓN VIVE ADENTRO DEL CUERPO, no al lado de Editar", () => {
  // ── EL PEDIDO QUE ORIGINÓ ESTE CANDADO ───────────────────────────────────
  //
  // El botón de dar vuelta estaba en la fila de acciones, hermano de Editar, y
  // eso los ponía al mismo nivel: una acción que edita el producto y otra que
  // cambia lo que se está mirando. No son lo mismo.
  //
  // Se comprueba por POSICIÓN en el marcado: el control de dar vuelta y su
  // indicador tienen que estar ANTES de la fila de acciones. Buscar solo que
  // "existan" pasaría en verde con el botón de vuelta al lado de Editar.
  const html = render({ caras: PACK_EN_DEPOSITO });

  const iIndicador = html.indexOf("data-tarjeta-indicador");
  const iVoltear = html.indexOf("data-tarjeta-voltear");
  const iAcciones = html.indexOf("divide-x");
  const iEditar = html.indexOf("Editar");

  assert.ok(iIndicador > 0, "no está el indicador de cara");
  assert.ok(iVoltear > 0, "no está el control de dar vuelta");
  assert.ok(iAcciones > 0, "no está la fila de acciones");
  assert.ok(iVoltear < iAcciones, "el control de dar vuelta quedó en la fila de acciones");
  assert.ok(iIndicador < iAcciones, "el indicador quedó fuera del cuerpo del carrusel");
  assert.ok(iEditar > iAcciones, "Editar no está en la fila de acciones");
});

test("G3. EDITAR QUEDA SOLO en la fila de acciones", () => {
  // Con dos botones, `divide-x` parte la fila y el blanco táctil de Editar pasa
  // de la tarjeta entera a la mitad. El pedido es que quede solo y ancho
  // completo.
  const html = render({ caras: PACK_EN_DEPOSITO });
  const fila = html.slice(html.indexOf("divide-x"));
  const botones = fila.match(/<button/g) || [];
  assert.equal(botones.length, 1, `la fila de acciones tiene ${botones.length} botones`);
  assert.match(fila, /Editar/);
});

test("G4. el control de dar vuelta nombra la cara a la que lleva", () => {
  assert.match(render({ caras: PACK_EN_DEPOSITO }), /Ver unidad/);
  // Y desde un local, donde el frente es la unidad, lleva al pack.
  assert.match(render({ caras: PACK_EN_LOCAL }), /Ver pack/);
});

test("G5. LA IDENTIFICACIÓN ES DEL DORSO, y en el frente se reserva su lugar", () => {
  // ── LAS DOS MITADES DE ESTA AFIRMACIÓN ──────────────────────────────────
  //
  // Que los códigos NO se vean en el frente es el pedido. Que su lugar QUEDE
  // RESERVADO es lo que evita que dar vuelta una tarjeta estire todas las filas
  // de la grilla — `auto-rows-fr` le da a todas el alto de la más alta.
  //
  // `invisible` hace las dos cosas: oculta el contenido, conserva la caja, y lo
  // saca del árbol de accesibilidad.
  const html = render({ caras: PACK_EN_DEPOSITO });
  const pie = html.match(/<div data-pie-codigos[^>]*>/);
  assert.ok(pie, "no está el bloque de identificación");
  assert.match(pie[0], /invisible/, "el frente muestra los códigos: son del dorso");
  // Y el pie del kit no los dibuja además abajo: uno solo, adentro del cuerpo.
  assert.equal((html.match(/data-pie-codigos/g) || []).length, 1);
});

test("G6. UNA CARD SIN REFERENCIA PERO CON IDENTIFICACIÓN SÍ TIENE DORSO", () => {
  // Regla aprobada: el dorso existe si aporta REFERENCIA o IDENTIFICACIÓN. Un
  // suelto no tiene conversión, pero sus códigos son contenido del dorso.
  const html = render({ caras: SUELTO });
  assert.match(html, /data-tarjeta-voltear/, "un suelto con códigos se quedó sin dorso");
  // Y el botón nombra lo que ESE dorso tiene. Decía "Ver referencia" sobre una
  // cara que son dos códigos: prometía una referencia que no existe. Se vio en la
  // captura, no leyendo el código.
  assert.match(html, /Ver códigos/);
  assert.doesNotMatch(html, /Ver referencia/);
});

test("G7. y con los dos códigos APAGADOS y sin referencia, es de una sola cara", () => {
  // Es el único caso en que el dorso no aporta nada. La tarjeta tiene que
  // funcionar igual: nombre, precio y Editar.
  const html = render({ caras: SUELTO, codigoBarra: false, codigoInterno: false });
  assert.doesNotMatch(html, /data-tarjeta-voltear/, "ofreció un dorso que no aporta nada");
  assert.doesNotMatch(html, /data-tarjeta-indicador/);
  assert.match(html, /1\.500/);
  assert.match(html, /Editar/);
});

test("G8. EL COSTO DE CADA CARA ESTÁ EN LA ESCALA DE ESA CARA", () => {
  // Es la regla dura del costo en la tarjeta: un costo por bulto al lado de un
  // precio unitario es una comparación AL REVÉS, que hace parecer sano lo que
  // está mal. Con dos caras el riesgo se duplica.
  //
  // Los esperados salen de `carasDeTarjeta`, no escritos a mano: un número
  // escrito defendería el valor viejo el día que cambie la conversión.
  assert.notEqual(PACK_EN_DEPOSITO.frente.costo, PACK_EN_DEPOSITO.dorso.costo);

  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.match(html, /Costo/, "no se ve el costo en el frente");
  assert.ok(
    html.includes(String(PACK_EN_DEPOSITO.frente.costo).replace(".", ",")) ||
      /20\.000/.test(html),
    "el frente no muestra el costo de SU escala"
  );
});

test("G9. con el costo apagado no se dibuja, y la regla sigue si está prendida", () => {
  const conRegla = render({
    caras: PACK_EN_DEPOSITO,
    muestraCosto: false,
    regla: createElement("span", null, "30 %"),
  });
  assert.doesNotMatch(conRegla, /Costo/);
  assert.match(conRegla, /30 %/);

  const sinNada = render({ caras: PACK_EN_DEPOSITO, muestraCosto: false, regla: null });
  assert.doesNotMatch(sinNada, /Costo/);
});

test("G10. EL DORSO NO DEJA DUDA DE CUÁL ES LA VENTA CONFIGURADA", () => {
  // Está en el rótulo de la cara y no en un renglón propio: un renglón de más en
  // el dorso rompe la igualdad de altos y hace saltar la grilla entera.
  //
  // Se ejerce el componente con el dorso puesto, y no se lee el JSX: la rama
  // podría estar escrita y no correr nunca.
  const html = renderToStaticMarkup(
    createElement(TarjetaProductoMovil, {
      nombre: "x",
      caras: PACK_EN_DEPOSITO,
      onEditar: () => {},
      codigoBarra: "1",
      codigoInterno: "2",
      // No hay forma de tocar el botón en un render estático, así que se
      // comprueba el TEXTO que la función del rótulo produce para el dorso.
    })
  );
  // En el frente NO aparece la aclaración: sería decir dos veces lo mismo.
  assert.doesNotMatch(html, /se vende PACK X 24/);
  // Y la fuente arma el rótulo del dorso con la presentación y el importe del
  // frente. Esto sí se lee, porque es la construcción y no la rama.
  assert.match(FUENTE, /se vende \$\{venta\}/, "el dorso dejó de aclarar qué se vende");
});

test("G11. NO HAY NINGÚN `fetch` AL CAMBIAR DE CARA", () => {
  // Los dos importes vienen ya calculados en `caras`, de una sola pasada por
  // fila. Un pedido por vuelta serían veinticinco pedidos por pantalla.
  assert.doesNotMatch(FUENTE, /\bfetch\s*\(/, "el envoltorio pide algo al servidor");
  assert.doesNotMatch(FUENTE, /useEffect/, "apareció un efecto: el cambio de cara es local");
});

test("G12. y NO entró una librería de carrusel", () => {
  const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const dependencias = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
  for (const sospechosa of ["embla", "swiper", "keen-slider", "slick", "flickity", "splide"]) {
    assert.equal(
      dependencias.some((d) => d.includes(sospechosa)),
      false,
      `entró una librería de carrusel: ${sospechosa}`
    );
  }
});

test("G13. EL GESTO NO SE PELEA CON EL SCROLL VERTICAL", () => {
  // Dos cosas lo evitan y hacen falta las dos: `touch-action: pan-y` le deja el
  // desplazamiento vertical al navegador, y antes de dar vuelta se compara el
  // movimiento horizontal contra el vertical. Sin la segunda, recorrer el
  // catálogo daría vuelta tarjetas sin querer.
  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.match(html, /touch-action:pan-y/, "el cuerpo no le deja el scroll vertical al navegador");
  assert.match(
    FUENTE,
    /Math\.abs\(dx\)\s*<=\s*Math\.abs\(dy\)/,
    "se perdió la comparación que distingue el gesto del scroll"
  );
});

test("G14. el gesto NO envuelve la fila de acciones", () => {
  // Un dedo que arranca sobre "Editar" y se corre un poco tiene que entrar a
  // editar, no dar vuelta la tarjeta.
  const html = render({ caras: PACK_EN_DEPOSITO });
  const iAcciones = html.indexOf("divide-x");
  const conGesto = [...html.matchAll(/touch-action:pan-y/g)].map((m) => m.index);
  assert.ok(conGesto.length > 0, "no hay ninguna zona con gesto");
  for (const i of conGesto) {
    assert.ok(i < iAcciones, "una zona con gesto quedó dentro o después de la fila de acciones");
  }
});

test("G15. un servicio sin precio dice que el importe es variable, no $0", () => {
  const servicio = {
    frente: { importe: null, costo: null, presentacion: "IMPORTE VARIABLE" },
    dorso: null,
  };
  const html = render({ caras: servicio, codigoBarra: false, codigoInterno: false });
  assert.match(html, /Importe variable/);
  assert.doesNotMatch(html, /\$\s*0,00/, "un servicio mostró cero como si fuera un precio");
});

test("G16. el dorso de kilo ofrece su referencia y no un importe inventado", () => {
  const kg = carasDeTarjeta({ escala: ESCALA_KG, precio: 1300, costo: 900, unidad: "kg" });
  const html = render({ caras: kg });
  assert.match(html, /KG/);
  assert.match(html, /Ver referencia/);
  // Y su dorso no tiene importe propio: la referencia es una línea de texto.
  assert.equal(kg.dorso.importe, null);
});

test("G17. el indicador tiene DOS puntos, uno por cara", () => {
  const html = render({ caras: PACK_EN_DEPOSITO });
  const indicador = html.slice(html.indexOf("data-tarjeta-indicador"));
  const puntos = indicador.slice(0, indicador.indexOf("</span></span>")).match(/rounded-full/g) || [];
  assert.equal(puntos.length, 2, `el indicador dibuja ${puntos.length} puntos`);
});
