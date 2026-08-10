// Candados de lib/rbac/permisosSesion.js.
//
// Además de probar la función, este archivo tiene un candado ESTRUCTURAL: falla
// si alguien vuelve a escribir el fallback `["*"]` en cualquiera de los tres
// lugares que normalizan permisos. La función sola no alcanza — el bug original
// no fue que la función estuviera mal, fue que había tres copias y una difería.
//
// Correr con: node --test lib/rbac/permisosSesion.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizarPermisos, esAdminPorPermisos } from "./permisosSesion.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// El token sano no se toca
// ---------------------------------------------------------------------------

test("un array de permisos pasa tal cual", () => {
  assert.deepEqual(normalizarPermisos(["productos.ver", "stock.ver"]), [
    "productos.ver",
    "stock.ver",
  ]);
});

test("el Admin real conserva su comodín", () => {
  // Fail-closed no le saca nada a quien legítimamente lo tiene.
  assert.deepEqual(normalizarPermisos(["*"]), ["*"]);
  assert.equal(esAdminPorPermisos(["*"]), true);
});

test("un array vacío es un array vacío, no un error", () => {
  assert.deepEqual(normalizarPermisos([]), []);
  assert.equal(esAdminPorPermisos([]), false);
});

// ---------------------------------------------------------------------------
// El token corrupto: SIEMPRE sin permisos, NUNCA admin
// ---------------------------------------------------------------------------

test("todo lo que no es un array cae a array vacío y NO a admin", () => {
  // Cada uno de estos es una forma real en que `permisos` puede llegar mal desde
  // la columna JSON del rol o desde un payload de JWT viejo.
  const corruptos = [
    null,
    undefined,
    "*",                       // el comodín como STRING: el caso más peligroso
    '["*"]',                   // el array sin parsear
    "productos.ver",
    { "*": true },
    { permisos: ["*"] },
    0,
    1,
    true,
    false,
    NaN,
  ];

  for (const valor of corruptos) {
    assert.deepEqual(
      normalizarPermisos(valor),
      [],
      `normalizarPermisos(${JSON.stringify(valor)}) tendría que dar []`
    );
    assert.equal(
      esAdminPorPermisos(valor),
      false,
      `esAdminPorPermisos(${JSON.stringify(valor)}) tendría que dar false`
    );
  }
});

test("el comodín como string NO otorga admin", () => {
  // Va aparte porque es el que más se parece a lo legítimo: `"*".includes("*")`
  // devuelve true. Si alguien calcula esAdmin sobre el valor crudo en vez de
  // sobre el normalizado, este caso pasa a ser admin sin que nada avise.
  assert.equal(esAdminPorPermisos("*"), false);
  assert.equal(esAdminPorPermisos("productos.*"), false);
});

test("esAdminPorPermisos no explota con null", () => {
  assert.doesNotThrow(() => esAdminPorPermisos(null));
  assert.doesNotThrow(() => esAdminPorPermisos(undefined));
});

// ---------------------------------------------------------------------------
// Candado estructural: que no vuelva a haber una cuarta copia con el comodín
// ---------------------------------------------------------------------------

const NORMALIZADORES = [
  "app/api/me/route.js",
  "app/api/login/route.js",
  "lib/auth.js",
];

test("ninguno de los tres normalizadores cae a [\"*\"]", () => {
  // Este es el candado que importa. El bug no fue una función mal escrita: fue
  // que la misma decisión estaba en tres archivos y uno la tenía al revés.
  for (const rel of NORMALIZADORES) {
    const src = leer(rel);
    const fallbacks = src.match(/:\s*\[\s*["']\*["']\s*\]/g) || [];
    assert.deepEqual(
      fallbacks,
      [],
      `${rel} volvió a tener un fallback a ["*"]. Fail-closed: los permisos ` +
        `que no son un array dan []. Ver lib/rbac/permisosSesion.js.`
    );
  }
});

test("los tres normalizadores usan el helper compartido", () => {
  // Si alguien vuelve a escribir `Array.isArray(...) ? ... : []` a mano, el
  // comportamiento queda bien pero la copia vuelve — y la próxima diferencia no
  // la va a ver nadie. Se exige el import.
  for (const rel of NORMALIZADORES) {
    const src = leer(rel);
    assert.match(
      src,
      /from "@\/lib\/rbac\/permisosSesion"/,
      `${rel} tiene que importar normalizarPermisos de lib/rbac/permisosSesion, ` +
        `no reimplementar la regla.`
    );
  }
});

test("/api/me calcula esAdmin sobre los permisos normalizados", () => {
  const src = leer("app/api/me/route.js");
  assert.match(src, /esAdminPorPermisos\(permisos\)/);
  // Y que no haya quedado el cálculo viejo sobre el crudo.
  assert.doesNotMatch(src, /payload\.permisos\.includes/);
});
