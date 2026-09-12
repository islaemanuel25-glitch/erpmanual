// EL CAMPO DE CANTIDAD DEL KIT, Y QUE EL CARRITO NO SE HAYA MOVIDO.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiCampoCantidad.test.mjs
//
// ── POR QUÉ ESTE CANDADO ES DE LOS QUE IMPORTAN ──────────────────────────
//
// `SunmiCampoCantidad` salió de `CantidadStepper`, que vivía inline en el
// carrito del POS. **El carrito está en producción y cobra.** El pedido fue
// explícito: antes de romper la caja, la caja se queda como está.
//
// Así que acá está congelado el HTML que el carrito dibujaba el 2026-09-12, antes
// de la mudanza, capturado montando el componente viejo —no escrito de memoria—.
// Si alguien toca el componente del kit y el carrito cambia de forma, esto se
// pone rojo mostrando los dos lados.
//
// ── LO QUE SE PERMITE QUE DIFIERA, Y POR QUÉ ─────────────────────────────
//
// Los `aria-label`. El stepper del carrito no tenía ninguno: sus dos botones eran
// un "−" y un "+" sin nombre accesible. El del kit los pone, porque el arnés de
// recepción los necesita para tocarlos y porque un botón sin nombre no se puede
// usar con lector de pantalla.
//
// **Un atributo `aria-label` no ocupa lugar**, así que no puede mover un píxel.
// Es la única diferencia admitida y está quitada explícitamente antes de comparar
// — no es una tolerancia difusa.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SunmiCampoCantidad from "./SunmiCampoCantidad.jsx";

/** Los props con los que el carrito lo monta. Espejo de `CantidadStepper`. */
const comoElCarrito = (item, compact = false) => ({
  valor: String(item.cantidad),
  onCambiar: () => {},
  etiqueta: "Cantidad",
  minimo: item.unidadMedida === "kg" ? 0.001 : 1,
  paso: item.unidadMedida === "kg" ? 0.001 : 1,
  maximo: item.stockMax != null && item.stockMax > 0 ? item.stockMax : 9999,
  normalizaAlSalir: true,
  conMarco: false,
  claseInput: compact ? "w-[56px] !text-center !py-1 text-sm" : "w-16 !text-center !py-1",
  tamano: "compacto",
});

const BOTON =
  '<button type="button" class="flex items-center justify-center w-7 h-7 rounded pos-control' +
  ' text-sm font-bold transition-colors select-none shrink-0">';

/**
 * EL HTML DEL CARRITO EL 2026-09-12, ANTES DE LA MUDANZA.
 *
 * Capturado montando `CantidadStepper` con `renderToStaticMarkup`, no transcrito
 * de leer el JSX. Si hiciera falta volver a capturarlo, el commit que lo trajo
 * dice cómo.
 */
const CONGELADO = Object.freeze({
  escritorio:
    '<div class="flex items-center gap-1">' +
    BOTON +
    "−</button>" +
    '<input type="text" inputMode="numeric" class="sunmi-input disabled:opacity-60' +
    ' disabled:cursor-not-allowed w-16 !text-center !py-1" value="3"/>' +
    BOTON +
    "+</button></div>",
  compacto:
    '<div class="flex items-center gap-1">' +
    BOTON +
    "−</button>" +
    '<input type="text" inputMode="numeric" class="sunmi-input disabled:opacity-60' +
    ' disabled:cursor-not-allowed w-[56px] !text-center !py-1 text-sm" value="3"/>' +
    BOTON +
    "+</button></div>",
  kilo:
    '<div class="flex items-center gap-1">' +
    BOTON +
    "−</button>" +
    '<input type="text" inputMode="decimal" class="sunmi-input disabled:opacity-60' +
    ' disabled:cursor-not-allowed w-16 !text-center !py-1" value="1.5"/>' +
    BOTON +
    "+</button></div>",
});

const sinAria = (h) => h.replace(/ aria-label="[^"]*"/g, "");
const pintar = (props) => renderToStaticMarkup(React.createElement(SunmiCampoCantidad, props));

test("EL CARRITO DEL POS NO SE MOVIÓ: el HTML es el de antes de la mudanza", () => {
  for (const [caso, item, compact, esperado] of [
    ["escritorio", { cantidad: 3, unidadMedida: "unidad", stockMax: 50 }, false, CONGELADO.escritorio],
    ["compacto", { cantidad: 3, unidadMedida: "unidad", stockMax: 50 }, true, CONGELADO.compacto],
    ["kilo", { cantidad: 1.5, unidadMedida: "kg", stockMax: 0 }, false, CONGELADO.kilo],
  ]) {
    assert.equal(
      sinAria(pintar(comoElCarrito(item, compact))),
      esperado,
      `el carrito cambió de forma en el caso «${caso}»`
    );
  }
});

test("y los aria-label SÍ están, que es lo único que se agregó", () => {
  // La otra mitad: que la diferencia admitida exista de verdad. Si el componente
  // dejara de poner los `aria-label`, el candado de arriba seguiría pasando y el
  // arnés de recepción se quedaría sin poder tocar los botones.
  const html = pintar(comoElCarrito({ cantidad: 3, unidadMedida: "unidad", stockMax: 50 }));
  assert.match(html, /aria-label="Restar uno a Cantidad"/);
  assert.match(html, /aria-label="Sumar uno a Cantidad"/);
  assert.match(html, /aria-label="Cantidad"/);
});

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE CADA CONSUMIDOR NECESITA, Y QUE SON DISTINTOS
// ═══════════════════════════════════════════════════════════════════════════

test("el MÍNIMO es del consumidor: 1 en el carrito, 0 en recepción", () => {
  // Es la diferencia que hizo que el control no se pudiera compartir tal cual.
  // "No llegó nada" es una respuesta válida en una recepción; un carrito con
  // cantidad 0 no significa nada.
  //
  // La primera versión de este candado solo construía el componente y comprobaba
  // que no explotara. Eso no afirma nada: se veía como cobertura y no lo era.
  //
  // Un render a string no dispara clics, así que el comportamiento del − no se
  // puede ejercer acá. Lo que SÍ se puede afirmar es que el piso salga del prop y
  // no de una constante, que es el defecto concreto que rompería recepción: con
  // un `Math.max(1, …)` escrito adentro, una línea que no llegó no se podría
  // declarar en cero.
  const fuente = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "SunmiCampoCantidad.jsx"),
    "utf8"
  );
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(codigo, /Math\.max\(minimo,/, "el piso dejó de salir del prop");
  assert.ok(
    !/Math\.max\(1,/.test(codigo),
    "volvió un mínimo escrito a mano: recepción no podría declarar un cero"
  );
  // Y que el default sea 0: si fuera 1, una pantalla que no lo pase heredaría el
  // criterio del carrito sin saberlo.
  assert.match(codigo, /minimo = 0/, "el default del mínimo dejó de ser 0");
});

test("y los DECIMALES también: 3 en peso, 0 en el resto", () => {
  // Con `decimales: 3` el campo conserva los ceros a la derecha —la balanza pesa
  // en gramos y 0,730 no es 0,73— y el paso también. Sin ellos, enteros.
  const conTres = pintar({ valor: "0.730", onCambiar: () => {}, etiqueta: "C", decimales: 3 });
  assert.match(conTres, /value="0\.730"/, "el campo no conservó los tres decimales");
  // Y con decimales el teclado es decimal, que es lo que permite tipear la coma.
  assert.match(conTres, /inputMode="decimal"/);

  const sinDecimales = pintar({ valor: "6", onCambiar: () => {}, etiqueta: "C" });
  assert.match(sinDecimales, /inputMode="numeric"/, "un entero no debería pedir teclado decimal");
});

test("EL MARCO es opcional, y es lo que permitió no mover el carrito", () => {
  // Con marco —recepción—: el borde va en un envoltorio y el input queda sin
  // borde ni padding lateral, para que el número no se coma los dígitos.
  const conMarco = pintar({ valor: "5", onCambiar: () => {}, etiqueta: "C", difiere: true });
  assert.match(conMarco, /border-2 sunmi-border-danger/, "el marco no se pinta en danger");
  assert.match(conMarco, /border-0 px-0/, "el input debería ceder su borde y su padding al marco");

  // Sin marco —el carrito—: el input conserva los suyos y no hay envoltorio.
  const sinMarco = pintar({ valor: "5", onCambiar: () => {}, etiqueta: "C", conMarco: false });
  assert.ok(!/border-2/.test(sinMarco), "apareció un marco donde el carrito no lo tiene");
  assert.ok(!/px-0/.test(sinMarco), "se le sacó al input del carrito su padding");
});

test("el BOTÓN tiene dos tamaños, y los dos salen de la escala", () => {
  // `w-9` y `w-7`, los dos de la escala. Ninguno escrito a mano: el trinquete
  // atrapó un `w-[30px]` en la primera versión y tenía razón.
  //
  // Y son 31,5 y 24,5 px, no 36 y 28: en este proyecto `1rem` son 14. El arnés lo
  // midió —`w-8` daba 28 y quedaba por debajo del piso— así que el escalón es el
  // 9. Un candado que afirmara los píxeles de memoria diría otra cosa.
  const normal = pintar({ valor: "1", onCambiar: () => {}, etiqueta: "C" });
  assert.match(normal, /w-9 h-9/, "el tamaño normal dejó de ser w-9");
  const compacto = pintar({ valor: "1", onCambiar: () => {}, etiqueta: "C", tamano: "compacto" });
  assert.match(compacto, /w-7 h-7/, "el compacto dejó de ser el del carrito");
  // Y el fondo relleno, que es lo que hace que se lea como un control. Es del POS
  // y es lo que se conservó a propósito.
  assert.match(normal, /pos-control/, "el botón perdió su fondo relleno");
});
