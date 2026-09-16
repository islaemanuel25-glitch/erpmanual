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

import { textoDelPrecioDeVenta } from "@/components/proveedores/listas/HojaConfirmarAplicar";
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
  // Las dos superficies que escriben costos: la hoja nueva y el panel de la
  // pantalla de filas. Si mañana vuelve una casilla en cualquiera de las dos,
  // el módulo tendría otra vez dos maneras distintas de habilitar lo mismo.
  for (const p of [
    "components/proveedores/listas/HojaConfirmarAplicar.jsx",
    "components/proveedores/listas/PanelAplicar.jsx",
    "app/modulos/proveedores/listas/[id]/page.jsx",
  ]) {
    const fuente = leer(p);
    assert.ok(!/type="checkbox"/.test(fuente), `${p} volvió a poner una casilla`);
    assert.ok(!/confirmadoLeido/.test(fuente), `${p} volvió a condicionar el botón a un tilde`);
  }
});

test("el panel viejo sigue diciendo CUÁNTOS productos toca", () => {
  // Lo que la casilla llevaba adentro era el número. Sacarla sin poner el número
  // en otro lado habría dejado un botón que escribe costos sin decir cuántos.
  const fuente = leer("components/proveedores/listas/PanelAplicar.jsx");
  assert.match(fuente, /Se van a modificar los costos de/);
  assert.match(fuente, /previo\?\.cantidad \?\? seleccionadas/);
});

test("los dos botones de la hoja llegan a los 44 px", () => {
  const fuente = leer("components/proveedores/listas/HojaConfirmarAplicar.jsx");
  const botones = fuente.match(/<SunmiButton[\s\S]*?>/g) ?? [];
  assert.equal(botones.length, 2, "la hoja tiene dos botones y nada más");
  for (const b of botones) assert.match(b, /min-h-toque/, `un botón de la hoja mide menos de 44: ${b}`);
});
