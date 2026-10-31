// Candados del universo compartido del catálogo.
//
// ── LO QUE DEFIENDEN ────────────────────────────────────────────────────────
//
// Que el listado y el contador de "Para revisar" miren los MISMOS productos. No
// alcanza con que compartan la clasificación —eso ya lo fija
// `controlesDesdePrisma.test.mjs`—: si uno de los dos arma su `where` por su
// cuenta, la card puede contar un producto que la lista no muestra y el número no
// cierra.
//
// Ya pasó, y por eso este archivo existe: el contador se escribió con la
// visibilidad y el activo, sin la regla de combos. **No lo atrapó ninguna
// corrida** porque en la base de desarrollo no hay ni un combo — la propia sonda
// lo informa como "NO EJERCIDO". Un caso que no ocurre en los datos de prueba
// pasa en verde igual, así que hace falta un candado que lo mire en el código.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { filtrosBaseDelCatalogo, filtroDeEstado } from "./whereCatalogo.js";
import { productoVisibleWhere } from "@/lib/visibilidad";

const leer = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
/** Saca los comentarios ANTES de mirar: un candado que busca texto los encuentra. */
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const LISTAR = "app/api/productos/listar/route.js";
const CONTROLES = "app/api/productos/controles/route.js";
// El tercero desde el 2026-10-31: la lista de precios en PDF tiene que ver el
// mismo universo que el catálogo del que sale.
const LISTA_DE_PRECIOS = "lib/productos/listaDePreciosServer.js";

test("G1. las tres reglas estructurales están, y ninguna se perdió", () => {
  const f = filtrosBaseDelCatalogo({ grupoId: 7, localId: 3 });
  assert.equal(f.length, 3, "son tres: grupo, visibilidad y combos");

  assert.deepEqual(f[0], { grupoId: 7 });

  // La de combos, que es la que faltaba en el contador.
  const combos = f.find((x) => JSON.stringify(x).includes("es_combo"));
  assert.ok(combos, "se fue la regla de combos");
  assert.deepEqual(combos, {
    OR: [{ es_combo: false }, { es_combo: true, creadoEnLocalId: 3 }],
  });
});

test("G2. la visibilidad la decide la pieza de siempre, no una copia", () => {
  // Se compara contra lo que `productoVisibleWhere` devuelve para el mismo local:
  // si acá se escribiera una condición "parecida", este candado se pondría rojo.
  const f = filtrosBaseDelCatalogo({ grupoId: 1, localId: 5 });
  assert.deepEqual(f[1], productoVisibleWhere(5));
});

test("G3. LOS DOS CONSUMIDORES USAN LA FUNCIÓN, y no su propio where", () => {
  for (const ruta of [LISTAR, CONTROLES, LISTA_DE_PRECIOS]) {
    const fuente = sinComentarios(leer(ruta));
    assert.match(
      fuente,
      /filtrosBaseDelCatalogo\(\s*\{\s*grupoId,\s*localId\s*\}\s*\)/,
      `${ruta} dejó de usar la función compartida`
    );
  }
});

test("G4. y NINGUNO reescribe las reglas al lado", () => {
  // La contraprueba de G3: usar la función y ADEMÁS escribir la condición a mano
  // pasaría G3 en verde mientras los dos vuelven a poder separarse.
  for (const ruta of [LISTAR, CONTROLES, LISTA_DE_PRECIOS]) {
    const fuente = sinComentarios(leer(ruta));
    assert.equal(
      /productoVisibleWhere\s*\(/.test(fuente),
      false,
      `${ruta} volvió a llamar a productoVisibleWhere por su cuenta`
    );
    assert.equal(
      /creadoEnLocalId:\s*localId/.test(fuente),
      false,
      `${ruta} volvió a escribir la regla de combos a mano`
    );
  }
});

test("G5. el contador cuenta activos con la MISMA rama que el listado", () => {
  // Un combo lleva su estado en el ProductoLocal y no en la ficha. Si el contador
  // preguntara `activo: true` a secas, contaría combos dados de baja que la lista
  // no muestra.
  //
  // ── LA RAMA SE MUDÓ A `filtroDeEstado` EL 2026-10-31 ────────────────────
  //
  // Estaba escrita en las dos rutas y este candado exigía que fuera la misma
  // forma en las dos. La lista de precios en PDF iba a ser la tercera copia, así
  // que pasó a una función con el estado como parámetro: cada uno sigue
  // eligiendo QUÉ estado pide, y la forma vive en un solo lugar. Se exige lo
  // mismo con más fuerza: que los tres llamen a la función, que la función
  // ramifique, y que nadie vuelva a escribir la rama a mano.
  assert.deepEqual(filtroDeEstado({ localId: 3, activo: true }), {
    OR: [
      { es_combo: false, activo: true },
      { es_combo: true, locales: { some: { localId: 3, activo: true } } },
    ],
  });
  assert.deepEqual(filtroDeEstado({ localId: 3, activo: undefined }), {}, "\"todos\" no filtra");

  const llamadas = {
    [LISTAR]: /filtroDeEstado\(\{\s*localId,\s*activo:\s*activoFilter\s*\}\)/,
    [CONTROLES]: /filtroDeEstado\(\{\s*localId,\s*activo:\s*true\s*\}\)/,
    [LISTA_DE_PRECIOS]: /filtroDeEstado\(\{\s*localId,\s*activo:\s*true\s*\}\)/,
  };
  const rama = /es_combo:\s*true,\s*locales:\s*\{\s*some:/;
  for (const [ruta, llamada] of Object.entries(llamadas)) {
    const fuente = sinComentarios(leer(ruta));
    assert.match(fuente, llamada, `${ruta} dejó de preguntar el estado con la función compartida`);
    assert.doesNotMatch(fuente, rama, `${ruta} volvió a escribir la rama del combo a mano`);
  }
});
