// NADIE COMPARA CONTRA UNA UNIDAD DE MEDIDA QUE NO EXISTE.
//
// ── QUÉ PASÓ ──────────────────────────────────────────────────────────────
//
// El repo comparaba `unidad_medida` contra "caja" y "carton" en **27 lugares
// repartidos en 10 archivos**, y ninguno de los dos está en el enum
// `UnidadMedida`, que tiene exactamente cuatro valores: unidad, pack, cajon, kg.
// Eran ramas inalcanzables con cualquier dato válido.
//
// El daño no es que se ejecuten —no se ejecutan— sino que MIENTEN sobre la
// cobertura: quien lee `["pack","cajon","caja","carton"]` cree que hay cuatro
// formatos de bulto y que el código los contempla. Al relevar la escala de venta
// eso hizo perder tiempo dos veces, porque parecía que faltaba entender un caso
// que no existe.
//
// ── LA LISTA SALE DEL SCHEMA, NO DE ACÁ ───────────────────────────────────
//
// El candado lee el enum de `prisma/schema.prisma`. Escribir los cuatro valores
// a mano en este archivo lo volvería inútil el día que se agregue un quinto: el
// candado seguiría en verde comparando contra su propia copia vieja.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = path.resolve(import.meta.dirname, "../..");

/** Los valores del enum, leídos del schema. */
function unidadesDelSchema() {
  const schema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  const bloque = schema.match(/enum\s+UnidadMedida\s*\{([^}]*)\}/);
  assert.ok(bloque, "no se encontró el enum UnidadMedida en el schema");
  return bloque[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter(Boolean);
}

test("el enum tiene los cuatro valores conocidos", () => {
  // Si esto se pone rojo es porque alguien agregó o sacó una unidad, y entonces
  // hay que releer el candado de abajo, no ajustarlo.
  assert.deepEqual(unidadesDelSchema().sort(), ["cajon", "kg", "pack", "unidad"]);
});

test("ningún archivo compara contra una unidad que no está en el enum", () => {
  const validas = new Set(unidadesDelSchema());

  // `git ls-files` recorre el repo entero. `fs.readdirSync` miraría un nivel y
  // dejaría afuera justamente los subdirectorios donde vivían la mitad.
  const archivos = execFileSync(
    "git", ["ls-files", "*.js", "*.jsx"], { cwd: RAIZ, encoding: "utf8" }
  ).split("\n").filter(Boolean);

  // Solo se miran las comparaciones CONTRA el campo de unidad de medida. Buscar
  // la palabra "caja" suelta daría falsos positivos por todos lados —hay un
  // módulo de caja en el POS— y ya hizo subir el contador de hardcodeo una vez.
  const patron = /unidad_?[Mm]edida\s*(?:===?|!==?)\s*"([^"]+)"|\[((?:\s*"[^"]+"\s*,?)+)\]\s*\.includes\(\s*unidad_?[Mm]edida\s*\)|new Set\(\s*\[((?:\s*"[^"]+"\s*,?)+)\]\s*\)/g;

  const hallazgos = [];
  for (const rel of archivos) {
    const src = fs.readFileSync(path.join(RAIZ, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

    // Solo archivos que hablan de unidad de medida, para no barrer el repo entero.
    if (!/unidad_medida|unidadMedida/.test(src)) continue;

    for (const m of src.matchAll(patron)) {
      const crudos = m[1] ? [m[1]] : (m[2] || m[3] || "").match(/"([^"]+)"/g) || [];
      for (const c of crudos) {
        const valor = c.replace(/"/g, "");
        // ── SOLO SE AFIRMA SOBRE LAS DOS QUE SE COMPROBARON ────────────────
        //
        // La primera versión de este candado fallaba contra CUALQUIER valor
        // fuera del enum, y encontró cuatro más en
        // `components/transferencias/detallePresentacion.jsx:65-66`: "pieza",
        // "piezas", "kilo" y "kilogramo". **No se borraron y el candado no las
        // exige**, a propósito: ese archivo rotula lo que le devuelve un
        // endpoint, no la columna, y no se verificó que ese endpoint mande el
        // valor del enum. Borrar sin comprobar sería cambiar una rama muerta por
        // una etiqueta rota. Queda anotado como pendiente medido.
        //
        // "caja" y "carton" sí se comprobaron: se comparaban contra
        // `unidad_medida` de la base, que es el enum, en 27 lugares de 10
        // archivos.
        if (["caja", "carton"].includes(valor)) {
          hallazgos.push(`${rel}: "${valor}"`);
        }
      }
    }
  }

  assert.deepEqual(
    hallazgos, [],
    `hay comparaciones contra unidades que no existen en el enum:\n  ${hallazgos.join("\n  ")}`
  );
});
