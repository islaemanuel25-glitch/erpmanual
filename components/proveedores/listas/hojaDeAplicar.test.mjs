// APLICAR ES UN TOQUE Y UNA CONFIRMACIÓN QUE DICE QUÉ VA A PASAR.
//
// ── LA CASILLA QUE SE SACÓ ─────────────────────────────────────────────────
//
// Había una casilla de 16 px —"revisé la lista y confirmo"— que había que tildar
// antes de que el botón de aplicar se encendiera. En un Sunmi de 360 px eso es un
// blanco que se falla, y lo que hacía no era proteger: quien la tilda sin leer
// queda igual de expuesto, y quien sí lee tiene que apuntar dos veces.
//
// Lo que protege es SABER QUÉ VA A PASAR, y eso se resuelve diciéndolo.
//
// ── EL RENGLÓN DEL PRECIO DE VENTA, QUE ES EL QUE PODÍA MENTIR ─────────────
//
// El diseño decía "el precio de venta se recalcula con el margen de cada local".
// Es cierto, con una condición que el texto no tenía: `ventaParaModo` solo
// recalcula cuando el producto tiene REGLA AUTOMÁTICA. Sin margen configurado no
// toca la venta y no falla — la deja como está.
//
// Un producto sin margen, con un texto que promete el recálculo, es un usuario
// que espera un precio nuevo y encuentra el viejo. Por eso el renglón nombra la
// condición, y por eso hay un candado que no lo deja volver a prometer de más.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaConfirmarAplicar, { textoDelPrecioDeVenta } from "@/components/proveedores/listas/HojaConfirmarAplicar";
import { MODO_PRECIO_VENTA } from "@/lib/proveedores/listas/aplicacion";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
// Los comentarios se sacan ANTES de mirar: este archivo nombra la casilla que
// busca, así que sin esto el candado se pondría verde leyendo su propia prosa.
const leer = (ruta) =>
  fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

test("el renglón del precio de venta NOMBRA la condición, no promete de más", () => {
  const t = textoDelPrecioDeVenta(MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN);
  assert.match(t, /margen/);
  // ÉSTA ES LA AFIRMACIÓN: sin la condición, el texto miente sobre los productos
  // que no tienen margen configurado.
  assert.match(t, /que tengan margen configurado/);
});

test("con el modo que no toca la venta, el renglón lo dice y no habla de margen", () => {
  const t = textoDelPrecioDeVenta(MODO_PRECIO_VENTA.MANTENER_VENTA);
  assert.match(t, /NO se toca/);
  assert.ok(!/se recalcula/.test(t), `dijo: ${t}`);
});

test("los dos modos que usa la hoja existen de verdad en el motor", () => {
  // CONTRA EL FIXTURE INVENTADO: si mañana el enum cambia de nombre, este
  // candado se pone rojo en vez de seguir probando una constante `undefined`
  // —que haría caer los dos casos en la misma rama y los dos seguirían verdes—.
  assert.equal(typeof MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN, "string");
  assert.equal(typeof MODO_PRECIO_VENTA.MANTENER_VENTA, "string");
  assert.notEqual(MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN, MODO_PRECIO_VENTA.MANTENER_VENTA);
});

test("la hoja dice las cuatro cosas que tiene que decir", () => {
  const fuente = leer("components/proveedores/listas/HojaConfirmarAplicar.jsx");
  assert.match(fuente, /Se actualiza el costo de/, "cuántos productos y de qué proveedor");
  assert.match(fuente, /textoDelPrecioDeVenta/, "qué pasa con el precio de venta");
  assert.match(fuente, /para revisar no se tocan/, "qué NO se toca");
  assert.match(fuente, /lo podés deshacer/, "que se puede deshacer");
});

test("NINGÚN camino para aplicar esconde el botón detrás de una casilla", () => {
  // ── QUEDA UNA SOLA SUPERFICIE, Y ESO NO AFLOJA EL CANDADO ────────────────
  //
  // Eran dos: esta hoja y el `PanelAplicar` de la pantalla vieja del detalle.
  // Esa pantalla se eliminó entera —era de la versión anterior del módulo y
  // Emanuel llegaba a ella sin querer— así que su panel se fue con ella.
  //
  // Lo que este candado afirma sigue valiendo sobre TODO lo que existe hoy: se
  // recorre la carpeta en vez de nombrar archivos, así que una superficie nueva
  // que naciera con una casilla entra sola en la cuenta. Sin eso, borrar el
  // segundo archivo habría dejado el candado mirando uno solo y sin decirlo.
  const dir = path.join(RAIZ, "components/proveedores/listas");
  const superficies = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsx"))
    .map((f) => `components/proveedores/listas/${f}`)
    .concat([
      "app/modulos/proveedores/listas/[id]/page.jsx",
      "app/modulos/proveedores/listas/[id]/revisar/page.jsx",
      "app/modulos/proveedores/listas/[id]/actualizan/page.jsx",
    ]);
  assert.ok(superficies.length >= 4, "la enumeración quedó vacía y el candado no miraría nada");
  for (const p of superficies) {
    const fuente = leer(p);
    assert.ok(!/type="checkbox"/.test(fuente), `${p} volvió a poner una casilla`);
    assert.ok(!/confirmadoLeido/.test(fuente), `${p} volvió a condicionar el botón a un tilde`);
  }
});

test("los dos botones de la hoja llegan a los 44 px", () => {
  // Se mira lo que la hoja DIBUJA, no su fuente. Los botones se mudaron al kit
  // (`SunmiHojaDeConfirmacion`) cuando la semana operativa necesitó la misma
  // hoja, y un candado que buscaba `<SunmiButton` en este archivo habría dado
  // rojo por la mudanza —o, peor, verde mirando un archivo que ya no los tiene—.
  const html = renderToStaticMarkup(
    React.createElement(HojaConfirmarAplicar, {
      cantidad: 3,
      proveedor: "Proveedor",
      onAplicar() {},
      onVolver() {},
    })
  );
  const botones = [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)].filter(
    (m) => /Sí, aplicar|Volver/.test(m[2])
  );
  assert.equal(botones.length, 2, "la hoja tiene dos botones y nada más");
  for (const b of botones) {
    assert.ok(b[1].split(/\s+/).includes("min-h-toque"), `un botón de la hoja mide menos de 44: ${b[2]}`);
  }
});
