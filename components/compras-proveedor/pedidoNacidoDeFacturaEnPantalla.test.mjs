// UN PEDIDO NACIDO DE UNA FACTURA NO CAE EN LA PANTALLA VIEJA.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/pedidoNacidoDeFacturaEnPantalla.test.mjs
//
// ── LO QUE PASÓ, EN PRODUCCIÓN, CON EL PEDIDO 240 ─────────────────────────
//
// Emanuel usó "Llegó algo sin pedido" con un proveedor real. La foto subió —un
// comprobante, una foto, medido en la base—, la lectura falló porque el lector
// estaba caído, y la pantalla que quedó fue la VIEJA de ENVIADO:
//
//   · "Detalle (0 productos)" — un pedido que todavía no leyó su papel;
//   · "Todavía no hay comprobantes ni líneas del pedido" — FALSO, había uno
//     subido y visible dos centímetros más arriba;
//   · "Agregar producto extra" — los productos los pone el papel;
//   · dos botones de acción abajo, uno rojo.
//
// La rama vieja se destapa con `sinFactura`, que es lo que pone el botón "Llegó
// sin factura" — el único que quedaba para seguir cuando el cartel rojo decía
// que no se había subido nada. Para un pedido que NACE de la factura esa salida
// no existe: el pedido ES la factura, y sin papel no hay nada que contar.
//
// ── QUÉ SE AFIRMA ACÁ ─────────────────────────────────────────────────────
//
// Las dos piezas chicas se RENDERIZAN de verdad; la pantalla grande —2.000
// líneas con contexto, sesión y red— se mira en el fuente, en las tres puertas
// por las que se llegaba a la rama vieja.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaContextoDelPedido from "./TarjetaContextoDelPedido.jsx";
import BloqueDeLaFactura, { TEXTO_SIN_FACTURA } from "./BloqueDeLaFactura.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PAGINA = "app/modulos/compras-proveedor/[id]/page.jsx";
const aLaVista = (html) => html.replace(/<[^>]*>/g, " ");

// ── LA TARJETA DE ARRIBA ──────────────────────────────────────────────────

test("NACIDO DE UNA FACTURA NO DICE '0 ítems · $0,00 estimado al pedir'", () => {
  const html = aLaVista(
    renderToStaticMarkup(
      React.createElement(TarjetaContextoDelPedido, {
        proveedorNombre: "Paty",
        pedidoId: 240,
        cantItems: 0,
        totalEstimado: 0,
        nacidoDeFactura: true,
        estado: "Llegó sin pedido",
      })
    )
  );
  assert.ok(!html.includes("estimado al pedir"), "habla de un pedido que no existió");
  assert.ok(!html.includes("$0,00"), "muestra una plata que se lee como un error");
  assert.ok(html.includes("Nació de una factura"), "no dice de dónde vino");
  assert.ok(html.includes("Paty"));
});

test("y con los productos ya puestos por el papel, los cuenta", () => {
  const html = aLaVista(
    renderToStaticMarkup(
      React.createElement(TarjetaContextoDelPedido, {
        pedidoId: 240,
        cantItems: 15,
        nacidoDeFactura: true,
      })
    )
  );
  assert.ok(html.includes("15 productos del papel"));
  assert.ok(!html.includes("estimado al pedir"));
});

test("CONTRAPRUEBA: un pedido normal sigue diciendo lo de siempre", () => {
  // Sin esto, el candado de arriba pasaría borrando el renglón para todos.
  const html = aLaVista(
    renderToStaticMarkup(
      React.createElement(TarjetaContextoDelPedido, {
        pedidoId: 232,
        cantItems: 24,
        totalEstimado: 2700500,
      })
    )
  );
  // "productos" y no "ítems" desde el 2026-09-24: la tarjeta es de la
  // recepción, y ahí se habla como habla quien recibe. Lo que este candado
  // defiende no cambió: que el pedido normal siga contando y estimando.
  assert.ok(html.includes("24 productos"));
  assert.ok(!html.includes("ítems"), "volvió la palabra del sistema");
  assert.ok(html.includes("estimado al pedir"));
});

// ── EL BLOQUE DE LA FOTO ──────────────────────────────────────────────────

test("SIN PEDIDO PREVIO NO SE OFRECE 'LLEGÓ SIN FACTURA'", () => {
  // Es la puerta por la que se entró a la pantalla vieja. Y no es solo de
  // navegación: sin papel, un pedido nacido de una factura no tiene ni una
  // línea que recibir.
  const html = aLaVista(
    renderToStaticMarkup(React.createElement(BloqueDeLaFactura, { onSinFactura: null }))
  );
  assert.ok(!html.includes(TEXTO_SIN_FACTURA), "sigue ofreciendo la salida que no existe");
  assert.ok(html.includes("Sacale una foto a la factura"), "se llevó puesto el bloque entero");
});

test("CONTRAPRUEBA: en un pedido normal la salida secundaria sigue estando", () => {
  const html = aLaVista(
    renderToStaticMarkup(React.createElement(BloqueDeLaFactura, { onSinFactura: () => {} }))
  );
  assert.ok(html.includes(TEXTO_SIN_FACTURA));
});

// ── Y LAS TRES PUERTAS DE LA PANTALLA GRANDE ──────────────────────────────

test("LA RAMA VIEJA DE ENVIADO NO SE DIBUJA PARA UN PEDIDO NACIDO DE FACTURA", () => {
  const pagina = codigoDe(PAGINA);
  // ── REESCRITO EL 2026-09-24, CUANDO LA RAMA VIEJA DEJÓ DE EXISTIR RECIBIENDO
  //
  // Afirmaba el texto `(!esRecepcion || sinFactura) && !sinPedidoPrevio`: la
  // rama vieja se abría con "Llegó sin factura" y había que cerrarle la puerta
  // al pedido nacido de factura. Esa rama ya no se dibuja en ENVIADO —sin
  // factura es la misma recepción, sin papel—, así que lo que defiende ahora
  // son las dos puertas de hoy: la rama vieja, solo fuera de la recepción y
  // nunca para un nacido de factura; y el camino sin papel, que tampoco se abre
  // para él.
  assert.match(
    pagina,
    /\{!esRecepcion && !sinPedidoPrevio && \(/,
    "volvió a poder dibujarse el Detalle viejo recibiendo, o para un pedido nacido de factura"
  );
  assert.doesNotMatch(
    pagina,
    /!esRecepcion \|\| sinFactura/,
    "volvió la rama vieja de 'Llegó sin factura'"
  );
  assert.match(
    pagina,
    /const sinPapel = esRecepcion && sinFactura && !sinPedidoPrevio && hayComprobantes === 0;/,
    "el camino sin papel se abre para un pedido nacido de factura, o con papel subido"
  );
  assert.match(
    pagina,
    /onSinFactura=\{sinPedidoPrevio \? null : \(\) => setSinFactura\(true\)\}/,
    "volvió a ofrecerse la salida que lleva a la rama vieja"
  );
  assert.match(
    pagina,
    /nacidoDeFactura=\{sinPedidoPrevio\}/,
    "la tarjeta de contexto volvió a hablar de un pedido que no existió"
  );
});

test("LA FOTO SE LEE SOLA CUANDO EL PEDIDO NACE DE ELLA", () => {
  // El camino acordado es foto → se lee → se arma el pedido. Sin esto queda en
  // "Sin leer" y el pedido queda vacío, que es como terminó el 240.
  assert.match(codigoDe(PAGINA), /leerAlSubir=\{sinPedidoPrevio\}/);
  const panel = codigoDe("components/comprobantes/PanelComprobantes.jsx");
  assert.match(panel, /if \(leerAlSubir && nuevos\.length === 1\)/);
  assert.match(panel, /await leer\(nuevos\[0\], ORIGEN_DE_LECTURA\.AL_SUBIR\)/);
});
