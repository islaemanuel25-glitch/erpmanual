// CANDADO: QUÉ TÍTULO GANA EN LA FILA DEL SHELL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/menu/tituloDePagina.test.mjs
//
// La prioridad vivía adentro de `usePageTitle`, en cuatro `if` que no se podían
// ejercer sin React ni sin `usePathname`. Ahora es una función pura y esto la
// prueba entera, incluido el escalón nuevo —lo que registra la pantalla— que es
// el único que puede decir un dato en vez de un texto de tabla.

import test from "node:test";
import assert from "node:assert/strict";

import { esTituloUtil, resolverTituloDePagina } from "@/lib/menu/tituloDePagina.js";

// ══════════════════════════════════════════════════════════════════════════
// EL ORDEN, ESCALÓN POR ESCALÓN
// ══════════════════════════════════════════════════════════════════════════

test("lo que registró la pantalla le gana a todo lo demás", () => {
  const titulo = resolverTituloDePagina({
    registrado: "Efectivo",
    override: "Cobros",
    delMenu: "Configuración POS",
    fallback: "Panel",
  });
  assert.equal(titulo, "Efectivo");
});

test("sin registro manda el override de la ruta", () => {
  const titulo = resolverTituloDePagina({
    registrado: null,
    override: "Cobros",
    delMenu: "Configuración POS",
  });
  assert.equal(titulo, "Cobros");
});

test("sin override manda el item del menú", () => {
  assert.equal(resolverTituloDePagina({ delMenu: "Configuración POS" }), "Configuración POS");
});

test("después el fallback, y al final 'Panel'", () => {
  assert.equal(resolverTituloDePagina({ fallback: "Inicio" }), "Inicio");
  assert.equal(resolverTituloDePagina({}), "Panel");
  assert.equal(resolverTituloDePagina(), "Panel");
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE NO CUENTA COMO TÍTULO
// ══════════════════════════════════════════════════════════════════════════

test("un registro vacío NO tapa al override", () => {
  // Es el caso real de la pantalla de editar: mientras carga el medio todavía
  // no hay nombre. Si el vacío ganara, la fila quedaría sin texto y parecería
  // un defecto de maquetado en vez de un dato que falta.
  for (const vacio of ["", "   ", null, undefined]) {
    assert.equal(
      resolverTituloDePagina({ registrado: vacio, override: "Cobros" }),
      "Cobros",
      `${JSON.stringify(vacio)} no tendría que ganar`
    );
  }
});

test("y tampoco cuenta algo que no sea texto", () => {
  for (const raro of [0, 7, true, {}, []]) {
    assert.equal(resolverTituloDePagina({ registrado: raro, override: "Cobros" }), "Cobros");
  }
  assert.equal(esTituloUtil("Efectivo"), true);
  assert.equal(esTituloUtil(" "), false);
  assert.equal(esTituloUtil(7), false);
});

// ══════════════════════════════════════════════════════════════════════════
// CONTRAPRUEBA: SIN EL ESCALÓN NUEVO, EL CASO DE LA TANDA NO SE PUEDE
// ══════════════════════════════════════════════════════════════════════════

test("el nombre del medio NO puede salir de la ruta", () => {
  // La ruta de editar es `…/cobros/<clave>`, y su override —el de `cobros`— es
  // "Cobros" para todos los medios. Sin el escalón 0, las cuatro pantallas de
  // editar dirían lo mismo, y eso es exactamente lo que se veía en producción.
  const desdeLaRuta = { override: "Cobros", delMenu: "Configuración POS" };
  assert.equal(resolverTituloDePagina(desdeLaRuta), "Cobros");
  assert.equal(resolverTituloDePagina({ ...desdeLaRuta, registrado: "Efectivo" }), "Efectivo");
  assert.equal(resolverTituloDePagina({ ...desdeLaRuta, registrado: "Mercado Pago" }), "Mercado Pago");
});
