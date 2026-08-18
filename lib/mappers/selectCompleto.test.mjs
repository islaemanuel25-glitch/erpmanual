// EL `select` TIENE QUE PEDIR TODO LO QUE EL MAPPER LEE.
//
// ── DE DÓNDE SALE ESTE CANDADO ────────────────────────────────────────────
//
// `mergeBaseLocalToUi` lee campos del override con `local?.campo`. La ruta del
// listado los trae con un `select` explícito. Cuando el mapper lee uno que el
// `select` no pide, llega `undefined`, cae al default del `??` y **la fila sale
// con un valor que no es el suyo**.
//
// No rompe nada, y por eso duró: no hay error, no hay rojo, la pantalla dibuja.
// Lo que había era que la FICHA de un producto y su FILA en el listado decían
// cosas distintas del mismo producto — `obtener` trae el override sin `select`,
// así que ahí los campos sí llegan.
//
// Medido contra producción el 2026-08-18, antes de arreglarlo: **1.137 de 10.614
// filas activas** —el 10,7 %— tenían al menos un campo con un valor inventado.
// Por campo: 231 de regla de precio, 231 de recargo fijo, 176 de código propio
// y 961 de recargo de servicio.
//
// ── POR QUÉ SE COMPARA Y NO SE LISTA A MANO ───────────────────────────────
//
// Un candado con la lista de campos escrita al lado se desactualiza el día que
// alguien agrega el siguiente y no se acuerda de venir acá. Éste LEE los dos
// lados y compara, así que cubre también los campos que todavía no existen.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const MAPPER = leer("lib/mappers/producto.js");
const LISTAR = leer("app/api/productos/listar/route.js");

/** Los campos del override que el mapper lee: todos los `local?.algo`. */
function camposQueLeeElMapper() {
  return new Set([...MAPPER.matchAll(/local\?\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
}

/**
 * Los campos que el `select` del include de `locales` pide.
 *
 * SE ANCLA EN `take: 1`, y no en `locales:` a secas: la misma consulta tiene
 * CUATRO `locales:` más arriba, dentro de cláusulas `where` de la búsqueda por
 * código propio. Anclado en el primero, el patrón capturaba el `select` de otra
 * relación y devolvía dos campos, así que el candado daba rojo listando como
 * faltantes campos que sí estaban. Lo destapó que el rojo nombrara `margen`,
 * que estaba a la vista en el archivo.
 */
function camposQuePideElSelect(fuente) {
  const bloque = /take:\s*1,\s*select:\s*\{([^}]*)\}/.exec(fuente);
  if (!bloque) return null;
  return new Set([...bloque[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*true/g)].map((m) => m[1]));
}

test("el mapper lee campos del override: si no, este candado no mide nada", () => {
  // Control del propio candado: si la expresión dejara de encontrar nada, todo
  // lo de abajo pasaría en verde sin comparar. Ya pasó con otra afirmación.
  const leidos = camposQueLeeElMapper();
  assert.ok(leidos.size >= 10, `solo encontré ${leidos.size} campos leídos: la búsqueda no anda`);
});

test("EL LISTADO PIDE TODO LO QUE EL MAPPER LEE", () => {
  const leidos = camposQueLeeElMapper();
  const pedidos = camposQuePideElSelect(LISTAR);
  assert.ok(pedidos, "no encontré el select del override en la ruta del listado");

  const faltan = [...leidos].filter((c) => !pedidos.has(c));
  assert.deepEqual(
    faltan.sort(),
    [],
    "el mapper los lee y el select no los pide: van a llegar undefined y la fila " +
      "va a salir con un valor que no es el suyo, sin ningún error"
  );
});

test("y los cuatro que faltaban están, nombrados", () => {
  // Redundante con el anterior a propósito: si alguien "simplifica" la
  // comparación de arriba, estos cuatro siguen defendidos por su nombre, que son
  // los que ya costaron 1.137 filas mintiendo.
  const pedidos = camposQuePideElSelect(LISTAR);
  for (const campo of [
    "reglaPrecio",
    "recargoFijoUnidad",
    "codigo_barra_propio",
    "recargoServicioPct",
  ]) {
    assert.ok(pedidos.has(campo), `el select del listado no pide ${campo}`);
  }
});
