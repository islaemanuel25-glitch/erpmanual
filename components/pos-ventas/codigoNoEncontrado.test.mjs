// CANDADO: UN CÓDIGO ESCANEADO SIN PRODUCTO NO PASA DESAPERCIBIDO EN EL POS.
//
//   node --import ./scripts/alias-loader.mjs --test components/pos-ventas/codigoNoEncontrado.test.mjs
//
// El defecto: el código quedaba escrito en el buscador, el cajero escaneaba el
// siguiente y el primero nunca entraba al carrito. Se cobraba de menos.
//
// La decisión se ejerce llamando a las funciones de `lib/pos-ventas/lecturaEscaner.js`
// con la forma real de lo que devuelve `/api/pos-ventas/buscar-producto` —los
// tres campos de código que ya leía el buscador—. El aviso se monta a HTML. El
// cableado del buscador se afirma leyendo el fuente SIN comentarios, porque
// montar el buscador con estado pediría un navegador, y esta tanda no abre uno.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ENTER,
  LECTURA,
  clasificarEnter,
  decidirLectura,
  esLecturaDeEscaner,
  sumarCodigoNoEncontrado,
  avisarErrorDeLectura,
} from "@/lib/pos-ventas/lecturaEscaner";
import AvisoProductoNoEncontrado, { TITULO_NO_ENCONTRADO } from "@/components/pos-ventas/AvisoProductoNoEncontrado";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const BUSCADOR = leer("components/pos-ventas/BuscadorProductos.jsx");
const AVISO = leer("components/pos-ventas/AvisoProductoNoEncontrado.jsx");
const PANTALLA = leer("app/modulos/pos-ventas/page.jsx");

const producto = (extra) => ({
  productoBaseId: 1,
  nombre: "Gaseosa cola 1,5 L",
  codigoBarra: "7790895000997",
  // Vacíos como texto y no `null`: así los manda `construirItems` del endpoint
  // (`pl.base?.codigo_barra_secundario || ""`).
  codigoBarraSecundario: "",
  codigoBarraPropio: "",
  unidadMedida: "unidad",
  disponibleParaVenta: true,
  ...extra,
});

const montar = (codigos) =>
  renderToStaticMarkup(React.createElement(AvisoProductoNoEncontrado, { codigos, onEntendido: () => {} }));

// ══════════════════════════════════════════════════════════════════════════
// CÓDIGO INEXISTENTE → AVISO ABIERTO Y BUSCADOR VACÍO
// ══════════════════════════════════════════════════════════════════════════

test("CNE1. una lectura del escáner sin ningún producto abre el aviso con el código leído", () => {
  assert.deepEqual(decidirLectura({ items: [], texto: " 1234567890 ", autoAdd: true }), {
    tipo: LECTURA.NO_ENCONTRADO,
    codigo: "1234567890",
  });
  // Varios resultados que no son por código —coincidencias por nombre— tampoco
  // son el producto escaneado.
  const porNombre = [producto({ codigoBarra: "111" }), producto({ productoBaseId: 2, codigoBarra: "222" })];
  assert.equal(decidirLectura({ items: porNombre, texto: "12345", autoAdd: true }).tipo, LECTURA.NO_ENCONTRADO);
});

test("CNE2. al abrir el aviso el buscador se vacía, suena y vibra", () => {
  const abrir = BUSCADOR.slice(
    BUSCADOR.indexOf("const abrirAvisoNoEncontrado"),
    BUSCADOR.indexOf("const alEntenderAviso")
  );
  assert.match(abrir, /setQuery\(""\)/, "el código queda escrito en el buscador");
  assert.match(abrir, /setResultados\(\[\]\)/);
  assert.match(abrir, /avisoAbiertoRef\.current = true/);
  assert.match(abrir, /avisarErrorDeLectura\(\)/, "el aviso no suena");
  // Y que la decisión NO_ENCONTRADO llega a abrirlo.
  assert.match(
    BUSCADOR,
    /decision\.tipo === LECTURA\.NO_ENCONTRADO && avisarNoEncontrado\) \{\s*abrirAvisoNoEncontrado\(decision\.codigo\)/
  );
});

test("CNE3. el aviso: título, código en grande, un solo botón «Entendido», en rojo del tema", () => {
  const html = montar(["1234567890"]);
  assert.match(html, new RegExp(`>${TITULO_NO_ENCONTRADO}<`));
  assert.equal(TITULO_NO_ENCONTRADO, "Producto no encontrado");
  assert.match(html, /<div class="text-xl3 sunmi-text-danger[^"]*" data-codigo-leido="true">1234567890<\/div>/);
  const botones = html.match(/<button\b/g) || [];
  assert.equal(botones.length, 1, "el aviso tiene que tener UN botón, el de Entendido");
  assert.match(html, /<button[^>]*sunmi-btn-red[^>]*>Entendido<\/button>/);
  // El velo no cierra: es el div escondido, no el botón «Cerrar».
  assert.doesNotMatch(html, /aria-label="Cerrar"/);
  // Sin colores fijos de Tailwind: el rojo sale de `--pos-danger`.
  assert.doesNotMatch(AVISO, /\b(text|bg|border)-(red|rose|amber|slate)-\d/);
  assert.doesNotMatch(AVISO, /#[0-9a-f]{3,6}\b/i);
});

test("CNE3b. sin códigos el aviso no se dibuja", () => {
  assert.equal(montar([]), "");
});

test("CNE4. el sonido y la vibración no pueden tirar la venta", () => {
  // Sin audio ni vibración: no pasa nada.
  assert.doesNotThrow(() => avisarErrorDeLectura({}));
  // Audio que explota y vibración que explota: tampoco.
  const roto = {
    AudioContext: function () {
      throw new Error("sin audio");
    },
    navigator: {
      vibrate() {
        throw new Error("sin vibración");
      },
    },
  };
  assert.doesNotThrow(() => avisarErrorDeLectura(roto));
  // Y cuando están, se usan.
  let vibro = null;
  let sono = false;
  const nodo = () => ({ connect() {}, frequency: {}, gain: {}, start() { sono = true; }, stop() {} });
  const sano = {
    AudioContext: function () {
      return { createOscillator: nodo, createGain: nodo, destination: {}, currentTime: 0, close() {} };
    },
    navigator: { vibrate: (p) => { vibro = p; } },
  };
  avisarErrorDeLectura(sano);
  assert.ok(sono, "no sonó");
  assert.ok(vibro, "no vibró");
});

// ══════════════════════════════════════════════════════════════════════════
// LECTURA DURANTE EL AVISO → IGNORADA
// ══════════════════════════════════════════════════════════════════════════

test("CNE5. con el aviso abierto, un Enter del escáner se ignora: ni se busca ni se agrega", () => {
  assert.equal(clasificarEnter({ avisoAbierto: true, msDesdeUltimaTecla: 10, buffer: "7790895000997" }), ENTER.IGNORAR);
  assert.equal(clasificarEnter({ avisoAbierto: true, msDesdeUltimaTecla: 900, buffer: "" }), ENTER.IGNORAR);
  // El buscador decide ANTES de buscar, y con la decisión.
  const enter = BUSCADOR.slice(BUSCADOR.indexOf('if (e.key === "Enter")'));
  const iClasifica = enter.indexOf("clasificarEnter(");
  const iBusca = enter.indexOf("buscar(");
  assert.ok(iClasifica > -1 && iClasifica < iBusca, "el Enter busca antes de preguntar si el aviso está abierto");
  assert.match(enter, /avisoAbierto: avisoAbiertoRef\.current/);
  assert.match(enter, /if \(tipoEnter === ENTER\.IGNORAR\) return;/);
});

test("CNE6. con el aviso abierto el teclado entero se traga, y solo «Entendido» lo cierra", () => {
  assert.match(AVISO, /window\.addEventListener\("keydown", tragar, true\)/, "las teclas del escáner llegan al botón");
  assert.match(AVISO, /e\.preventDefault\(\);\s*e\.stopPropagation\(\);/);
  assert.match(AVISO, /\n\s*destructivo\s*\n/, "el velo o Escape lo cierran sin que el cajero lo vea");
  assert.match(AVISO, /showCloseButton=\{false\}/);
  // Al entender, el foco vuelve al buscador listo para escanear.
  const entender = BUSCADOR.slice(BUSCADOR.indexOf("const alEntenderAviso"), BUSCADOR.indexOf("useEffect("));
  assert.match(entender, /avisoAbiertoRef\.current = false/);
  assert.match(entender, /inputRef\.current\?\.focus\(\)/, "el foco no vuelve al buscador");
});

test("CNE6b. un segundo «no encontrado» que llega en vuelo se suma al aviso, no lo pisa", () => {
  assert.deepEqual(sumarCodigoNoEncontrado([], "111"), ["111"]);
  assert.deepEqual(sumarCodigoNoEncontrado(["111"], "222"), ["111", "222"]);
  assert.deepEqual(sumarCodigoNoEncontrado(["111"], "111"), ["111"]);
});

// ══════════════════════════════════════════════════════════════════════════
// CÓDIGO EXISTENTE → SE AGREGA COMO SIEMPRE
// ══════════════════════════════════════════════════════════════════════════

test("CNE7. código existente —principal, secundario o propio— se agrega como siempre", () => {
  const p = producto({ codigoBarraSecundario: "SEC-01", codigoBarraPropio: "LOC77" });
  for (const texto of ["7790895000997", "sec-01", "LOC77"]) {
    for (const autoAdd of [true, false]) {
      for (const estricto of [true, false]) {
        assert.deepEqual(
          decidirLectura({ items: [p], texto, autoAdd, estricto }),
          { tipo: LECTURA.AGREGAR, producto: p },
          `${texto} autoAdd=${autoAdd} estricto=${estricto}`
        );
      }
    }
  }
  // FUERA del POS —ofertas y combos, sin `estricto`— una lectura del escáner
  // con resultado único lo sigue agregando, como antes. En el POS ya no: CNE12.
  const unico = producto({ codigoBarra: "999" });
  assert.equal(decidirLectura({ items: [unico], texto: "12345", autoAdd: true }).tipo, LECTURA.AGREGAR);
  // No disponible sigue avisando con el mensaje de siempre, sin agregar.
  assert.equal(
    decidirLectura({ items: [producto({ disponibleParaVenta: false })], texto: "7790895000997", autoAdd: true }).tipo,
    LECTURA.NO_DISPONIBLE
  );
});

test("CNE8. la lectura del escáner es la de siempre: < 200 ms y 4 o más caracteres", () => {
  assert.equal(esLecturaDeEscaner(50, "1234"), true);
  assert.equal(esLecturaDeEscaner(50, "123"), false);
  assert.equal(esLecturaDeEscaner(200, "1234"), false);
  assert.equal(clasificarEnter({ msDesdeUltimaTecla: 30, buffer: "7790895000997" }), ENTER.ESCANER);
  assert.equal(clasificarEnter({ msDesdeUltimaTecla: 800, buffer: "coca" }), ENTER.MANUAL);
});

// ══════════════════════════════════════════════════════════════════════════
// LO TIPEADO A MANO NO CAMBIA, Y SOLO EL POS PIDE EL AVISO
// ══════════════════════════════════════════════════════════════════════════

test("CNE9. buscar tipeando y no encontrar NO abre el aviso", () => {
  assert.deepEqual(decidirLectura({ items: [], texto: "yerba", autoAdd: false }), { tipo: LECTURA.MOSTRAR });
  const porNombre = [producto({ nombre: "Yerba A" }), producto({ productoBaseId: 2, nombre: "Yerba B" })];
  assert.deepEqual(decidirLectura({ items: porNombre, texto: "yerba", autoAdd: false }), { tipo: LECTURA.MOSTRAR });
});

test("CNE10. el aviso lo pide el POS de venta; ofertas y combos siguen como estaban", () => {
  assert.match(BUSCADOR, /avisarNoEncontrado = false,/);
  const buscador = PANTALLA.slice(PANTALLA.indexOf("<BuscadorProductos"), PANTALLA.indexOf("/>", PANTALLA.indexOf("<BuscadorProductos")));
  assert.match(buscador, /\n\s*avisarNoEncontrado\s*\n/, "el POS no pide el aviso");
  for (const ruta of ["app/modulos/ofertas/nueva/page.jsx", "components/productos/EditorComponentesCombo.jsx"]) {
    assert.doesNotMatch(leer(ruta), /avisarNoEncontrado/, `${ruta} pidió el aviso`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// EN EL POS, EL ESCÁNER AGREGA SOLO POR CÓDIGO EXACTO
//
// Antes una lectura con un único resultado se agregaba aunque el código no
// coincidiera: entraba al carrito un producto que el escáner no leyó.
// ══════════════════════════════════════════════════════════════════════════

const lecturaPos = (items, texto) => decidirLectura({ items, texto, autoAdd: true, estricto: true });

test("CNE11. exacto con el principal, el secundario o el propio de la ubicación → agrega", () => {
  const principal = producto({ codigoBarra: "7790895000997" });
  const secundario = producto({ codigoBarra: "111", codigoBarraSecundario: "7790895000980" });
  const propio = producto({ codigoBarra: "111", codigoBarraPropio: "LOC-0042" });
  assert.deepEqual(lecturaPos([principal], "7790895000997"), { tipo: LECTURA.AGREGAR, producto: principal });
  assert.deepEqual(lecturaPos([secundario], "7790895000980"), { tipo: LECTURA.AGREGAR, producto: secundario });
  assert.deepEqual(lecturaPos([propio], "loc-0042"), { tipo: LECTURA.AGREGAR, producto: propio });
});

test("CNE11b. ceros a la izquierda: EAN-13 leído contra UPC-A cargado, y al revés → agrega", () => {
  const upc = producto({ codigoBarra: "012345678905" });
  assert.deepEqual(lecturaPos([upc], "0012345678905"), { tipo: LECTURA.AGREGAR, producto: upc });
  const ean = producto({ codigoBarra: "0012345678905" });
  assert.deepEqual(lecturaPos([ean], "012345678905"), { tipo: LECTURA.AGREGAR, producto: ean });
  // También contra el secundario y el propio.
  const sec = producto({ codigoBarra: "111", codigoBarraSecundario: "012345678905" });
  assert.equal(lecturaPos([sec], "0012345678905").tipo, LECTURA.AGREGAR);
  // Pero un código interno corto NO: ahí el cero distingue.
  const corto = producto({ codigoBarra: "111", codigoBarraPropio: "123" });
  assert.equal(lecturaPos([corto], "0123").tipo, LECTURA.NO_ENCONTRADO);
  // Ni un GTIN distinto que solo comparte dígitos.
  assert.equal(lecturaPos([upc], "1012345678905").tipo, LECTURA.NO_ENCONTRADO);
});

test("CNE12. un único resultado que NO es exacto → aviso, no se agrega", () => {
  const unico = producto({ nombre: "Alfajor 12345", codigoBarra: "7790000000001" });
  assert.deepEqual(lecturaPos([unico], "12345"), { tipo: LECTURA.NO_ENCONTRADO, codigo: "12345" });
});

test("CNE13. varios resultados sin ninguno exacto → aviso", () => {
  const varios = [
    producto({ codigoBarra: "7790000000001" }),
    producto({ productoBaseId: 2, codigoBarra: "7790000000002" }),
  ];
  assert.equal(lecturaPos(varios, "77900000").tipo, LECTURA.NO_ENCONTRADO);
  // Y cero resultados, igual que desde c772a5b.
  assert.equal(lecturaPos([], "7790000000009").tipo, LECTURA.NO_ENCONTRADO);
});

test("CNE14. etiqueta de balanza: no hay manejo propio, así que queda igual que antes", () => {
  // Relevado: ni el endpoint ni el buscador interpretan peso o precio embebido
  // (prefijo 2). Una etiqueta así solo agrega si su texto ES el código cargado
  // de un producto, y entonces un producto por kg sigue yendo a `ModalPesoKg`.
  const porKg = producto({ nombre: "Queso cremoso", codigoBarra: "2000123000000", unidadMedida: "kg" });
  assert.deepEqual(lecturaPos([porKg], "2000123000000"), { tipo: LECTURA.AGREGAR, producto: porKg });
  // Una etiqueta con el peso adentro no es ningún código cargado: el endpoint
  // no devuelve nada y abre el aviso, como desde c772a5b.
  assert.equal(lecturaPos([], "2000123012508").tipo, LECTURA.NO_ENCONTRADO);
  // Que siga sin existir: si alguien agrega el manejo, este candado tiene que
  // reescribirse sabiendo que la regla de exacto la toca.
  for (const ruta of ["lib/pos-ventas/lecturaEscaner.js", "components/pos-ventas/BuscadorProductos.jsx", "app/api/pos-ventas/buscar-producto/route.js"]) {
    assert.doesNotMatch(leer(ruta), /balanza|pesoEmbebido|precioEmbebido/i, `${ruta} empezó a manejar balanza`);
  }
});

test("CNE15. el POS pide la regla estricta; el tipeo a mano sigue sin aviso", () => {
  assert.match(BUSCADOR, /decidirLectura\(\{ items, texto, autoAdd, estricto: avisarNoEncontrado \}\)/);
  // Tipeado a mano en el POS: nada exacto → lista, como siempre.
  const varios = [producto({ nombre: "Yerba A" }), producto({ productoBaseId: 2, nombre: "Yerba B" })];
  assert.deepEqual(decidirLectura({ items: varios, texto: "yerba", autoAdd: false, estricto: true }), { tipo: LECTURA.MOSTRAR });
  assert.deepEqual(decidirLectura({ items: [], texto: "yerba", autoAdd: false, estricto: true }), { tipo: LECTURA.MOSTRAR });
});

test("CNE16. el endpoint del POS busca el mismo GTIN con otros ceros, DESPUÉS del exacto", () => {
  const ruta = leer("app/api/pos-ventas/buscar-producto/route.js");
  const iExacto = ruta.indexOf("let exacto = await buscarExacto(q);");
  const iVariantes = ruta.indexOf("exacto = await buscarExacto({ in: otrasFormas });");
  assert.ok(iExacto > -1, "no busca el código tal cual primero");
  assert.ok(iVariantes > iExacto, "no prueba las otras formas del GTIN, o las prueba antes");
  assert.match(ruta, /const otrasFormas = variantesGtin\(q\)\.filter\(\(v\) => v !== q\);/);
  // Y que se prueben justo cuando el tal cual no encontró y hay otras formas.
  assert.match(
    ruta,
    /if \(exacto\.length === 0 && otrasFormas\.length > 0\) \{\s*exacto = await buscarExacto\(\{ in: otrasFormas \}\);/,
    "las otras formas del GTIN no se buscan cuando el código tal cual no está"
  );
});
