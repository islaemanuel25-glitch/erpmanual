// Candados del ALCANCE en el alta de proveedor.
//
// Lo que defienden: que un error de alcance no se degrade a "alta global".
// `resolveLocalAndGrupo` falla CERRADO para un no-admin —403 sin local
// autorizado, 403 con un local ajeno explícito— y la ruta convertía los dos en
// `null` para seguir creando un Proveedor GLOBAL. Un problema de permisos
// terminaba en una escritura que ningún alcance autorizaba, sin dejar rastro de
// que algo había fallado.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const RUTA_CREAR = "app/api/proveedores/crear/route.js";

test("A1. UN ERROR DE ALCANCE SE DEVUELVE, NO SE CONVIERTE EN NULL", () => {
  const fuente = sinComentarios(leer(RUTA_CREAR));
  assert.ok(fuente.includes("resolveLocalAndGrupo"), "no se está leyendo la ruta correcta");

  // La forma vieja: los dos campos caían a null ante CUALQUIER error, y la ruta
  // seguía creando un Proveedor global. Es lo que no puede volver.
  assert.doesNotMatch(
    fuente,
    /scope\.error\s*\?\s*null\s*:/,
    "un error de alcance vuelve a degradarse a null y la ruta sigue escribiendo"
  );

  // Y tiene que existir el corte explícito que devuelve el error del scope.
  assert.match(
    fuente,
    /if\s*\(scope\.error\s*&&\s*!altaGlobalDeAdmin\)/,
    "no hay corte: un alcance que falla tiene que devolver su error sin escribir"
  );
  assert.match(fuente, /status:\s*scope\.status/, "el corte no devuelve el status del scope");
});

test("A2. EL ALTA GLOBAL ES SOLO PARA ADMIN SIN CONTEXTO, y por needsContexto", () => {
  const fuente = sinComentarios(leer(RUTA_CREAR));
  // Las tres condiciones tienen que estar las tres: si faltara `session.esAdmin`
  // un no-admin sin contexto crearía global; si faltara `needsContexto`,
  // cualquier otro error de un admin también lo haría.
  assert.match(fuente, /session\.esAdmin/);
  assert.match(fuente, /scope\.needsContexto === true/);
  assert.match(fuente, /altaGlobalDeAdmin/);
});

test("A3. CONTRAPRUEBA de A1: el analizador ve la forma vieja si vuelve", () => {
  // Sin esto, A1 pasaría en verde con una expresión regular mal escrita.
  const comoEraAntes =
    "const grupoId = scope.error ? null : scope.grupoId ?? null;\n" +
    "const localId = scope.error ? null : scope.localId ?? null;";
  assert.match(comoEraAntes, /scope\.error\s*\?\s*null\s*:/);
  // Y los comentarios no cuentan: la ruta NOMBRA la forma vieja en prosa para
  // explicar qué cambió, así que sin `sinComentarios` A1 daría rojo sobre código
  // correcto. Es la trampa que este repo ya pisó cuatro veces.
  assert.equal(
    sinComentarios("// decía scope.error ? null : x\nconst y=1;").includes("scope.error"),
    false
  );
});
