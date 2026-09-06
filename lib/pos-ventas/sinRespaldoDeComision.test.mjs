// CANDADO: EL 7 NO VUELVE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/sinRespaldoDeComision.test.mjs
//
// ── POR QUÉ ESTE CANDADO ES DE TEXTO Y NO DE COMPORTAMIENTO ────────────────
//
// Porque el problema nunca fue un solo lugar. El 7 vivía en CUATRO: el
// `@default(7)` del esquema, la constante del dominio, y un `?? 7` copiado en
// `config-comisiones` y en `corregir`. Sacarlo de uno solo dejaba los otros
// funcionando, y cada uno decidía cuánto se le descontaba al comercio.
//
// Un candado de comportamiento prueba el camino que ejerce; éste enumera el repo
// entero y se pone rojo si el respaldo vuelve por cualquier puerta, incluida una
// que todavía no existe.
//
// ── CÓMO SE ENUMERA, QUE ES PARTE DE LA AFIRMACIÓN ────────────────────────
//
// Con `git grep`, que recorre todo lo trackeado. Un `readdirSync` mira un nivel
// y habría dejado afuera justamente el archivo escondido en un subdirectorio;
// ese error ya está anotado en CLAUDE.md con nombre y apellido.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/** Lo que `git grep` encuentra, sin los comentarios de cada línea. */
function lineasDeCodigo(patron, rutas) {
  const salida = execSync(`git grep -nE ${JSON.stringify(patron)} -- ${rutas} || true`, {
    encoding: "utf8",
  });
  return salida
    .split("\n")
    .filter(Boolean)
    // Un candado que busca texto encuentra los comentarios, y este proyecto ya
    // se comió tres falsos positivos por eso. Se descartan las líneas donde el
    // patrón aparece dentro de un comentario.
    .filter((l) => {
      const codigo = l
        .replace(/^[^:]+:\d+:/, "")
        .replace(/\/\/.*$/, "")
        .replace(/^\s*\*.*$/, "");
      return new RegExp(patron).test(codigo);
    });
}

const AREA = '"app/**/*.js" "app/**/*.jsx" "lib/**/*.js" "lib/**/*.jsx"';

test("NO HAY NINGÚN `?? 7` NI `|| 7` DE COMISIÓN EN app/ NI EN lib/", () => {
  const sospechosas = lineasDeCodigo("(\\?\\?|\\|\\|) *7\\b", AREA).filter((l) =>
    /comision/i.test(l)
  );
  assert.deepEqual(sospechosas, [], `volvió el respaldo del 7:\n${sospechosas.join("\n")}`);
});

test("la constante COMISION_PCT_DEFAULT no existe como CÓDIGO en ningún lado", () => {
  // Se miran las líneas sin su comentario, porque el módulo del dominio explica
  // en prosa qué constante se sacó y por qué. Nombrarla ahí es documentación;
  // usarla sería el respaldo de vuelta. Es el mismo falso positivo que este
  // proyecto ya se comió tres veces.
  const apariciones = lineasDeCodigo("COMISION_PCT_DEFAULT", `${AREA} "scripts/**/*.mjs"`);
  assert.deepEqual(apariciones, [], `la constante volvió en:\n${apariciones.join("\n")}`);
});

test("EL ESQUEMA NO LE PONE UN DEFAULT A LAS COMISIONES DEL GRUPO", () => {
  // Es el respaldo más profundo y el que nadie ve: con `@default(7)`, todo grupo
  // nuevo nacía con una comisión que nadie había decidido, y el dominio la daba
  // por buena porque venía de la base.
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const bloque = schema.slice(
    schema.indexOf("model ConfiguracionGrupo"),
    schema.indexOf("model ConfiguracionGrupo") + 1600
  );

  for (const campo of ["comisionDebito", "comisionCredito", "comisionMercadopago"]) {
    const linea = bloque.split("\n").find((l) => l.trim().startsWith(campo));
    assert.ok(linea, `no se encontró ${campo} en ConfiguracionGrupo`);
    assert.doesNotMatch(linea, /@default\(/, `${campo} volvió a tener un default`);
    assert.match(linea, /Decimal\?/, `${campo} tiene que admitir null: es "sin configurar"`);
  }
});

test("y la venta tiene dónde decir que su comisión no está cerrada", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /comisionPendiente Boolean @default\(false\)/);
});

// ══════════════════════════════════════════════════════════════════════════
// UNA SOLA IMPLEMENTACIÓN DE LA REGLA
// ══════════════════════════════════════════════════════════════════════════

test("CORREGIR VENTA RESUELVE LA COMISIÓN POR EL MISMO DOMINIO QUE CREAR", () => {
  // Tenía su propia copia: leía `ConfiguracionGrupo` directo, así que ignoraba
  // la comisión propia del medio del local y podía darle a una venta corregida
  // un porcentaje distinto del que le había dado el POS al cobrarla.
  const corregir = readFileSync("app/api/pos-ventas/venta/[id]/corregir/route.js", "utf8");
  assert.match(corregir, /mediosDelLocal\(tx, \{ localId, grupoId \}\)/);
  assert.match(corregir, /comisionesDeMedios\(mediosDelPos\)/);
  assert.doesNotMatch(
    corregir.replace(/\/\/[^\n]*/g, ""),
    /configuracionGrupo\.findUnique/,
    "volvió a leer la configuración del grupo por su cuenta"
  );
});

test("crear y corregir escriben los dos la marca de pendiente", () => {
  for (const ruta of [
    "app/api/pos-ventas/crear/route.js",
    "app/api/pos-ventas/venta/[id]/corregir/route.js",
  ]) {
    const codigo = readFileSync(ruta, "utf8").replace(/\/\/[^\n]*/g, "");
    assert.match(codigo, /comisionPendiente: derivado\.comisionPendiente/, ruta);
  }
});

test("y ninguno de los dos prorratea comisión por línea con la venta pendiente", () => {
  for (const ruta of [
    "app/api/pos-ventas/crear/route.js",
    "app/api/pos-ventas/venta/[id]/corregir/route.js",
  ]) {
    const codigo = readFileSync(ruta, "utf8").replace(/\/\/[^\n]*/g, "");
    assert.match(codigo, /derivado\.comisionPendiente \? 0 :/, ruta);
  }
});

test("config-comisiones devuelve null y no un 7", () => {
  const codigo = readFileSync("app/api/pos-ventas/config-comisiones/route.js", "utf8").replace(
    /\/\/[^\n]*/g,
    ""
  );
  assert.match(codigo, /v == null \? null : Number\(v\)/);
  assert.doesNotMatch(codigo, /\?\? 7/);
});

// ══════════════════════════════════════════════════════════════════════════
// LOS TEXTOS
// ══════════════════════════════════════════════════════════════════════════

test('ya no se le dice a nadie "se usa el valor por defecto"', () => {
  // La frase exacta que mostraba la pantalla de Cobros cuando no había comisión
  // configurada. Se busca así de literal a propósito: "valor por defecto" suelto
  // aparece legítimamente en ofertas, en el catálogo y en comentarios, y un
  // candado que se pone rojo por texto ajeno se termina salteando.
  const apariciones = lineasDeCodigo(
    "se usa el valor por defecto",
    `${AREA} "components/**/*.jsx"`
  );
  assert.deepEqual(apariciones, [], `quedó el texto del respaldo en:\n${apariciones.join("\n")}`);
});

test('y la pantalla dice qué pasa de verdad: "Sin comisión configurada en el grupo"', () => {
  const textos = readFileSync("lib/pos-ventas/mediosCobroPantalla.js", "utf8");
  assert.match(textos, /Sin comisión configurada en el grupo/);
});
