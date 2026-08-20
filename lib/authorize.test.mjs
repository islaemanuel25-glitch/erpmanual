// Candados de lib/authorize.js y de la agenda de clientes.
//
// Dos cosas: que `checkPerm`/`requirePerm` acepten varios permisos con
// semántica "alcanza con uno", y que las SEIS rutas de lectura de clientes
// pidan permiso. Eran seis y no dos: además de `listar` y `buscar` estaban sin
// chequeo `[id]`, `[id]/ventas`, `analytics/ranking` y `analytics/inactivos`.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/authorize.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkPerm, PERMISOS_LEER_CLIENTES } from "./authorize.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const sesion = (permisos, esAdmin = false) => ({ permisos, esAdmin });

// ---------------------------------------------------------------------------
// checkPerm con un solo permiso: lo de siempre no se rompe
// ---------------------------------------------------------------------------

test("un permiso que la sesión tiene pasa", () => {
  assert.equal(checkPerm(sesion(["clientes.ver"]), "clientes.ver").ok, true);
});

test("un permiso que no tiene da 403", () => {
  const r = checkPerm(sesion(["stock.ver"]), "clientes.ver");
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("sin sesión da 401, no 403", () => {
  // La distinción importa: 401 manda a login, 403 dice "no es para vos".
  assert.equal(checkPerm(null, "clientes.ver").status, 401);
});

test("el admin pasa siempre", () => {
  assert.equal(checkPerm(sesion([], true), "clientes.ver").ok, true);
  assert.equal(checkPerm(sesion([], true), PERMISOS_LEER_CLIENTES).ok, true);
});

// ---------------------------------------------------------------------------
// checkPerm con varios: ALCANZA CON UNO, no hacen falta todos
// ---------------------------------------------------------------------------

test("con varios permisos alcanza tener uno solo", () => {
  assert.equal(checkPerm(sesion(["clientes.ver"]), PERMISOS_LEER_CLIENTES).ok, true);
  assert.equal(checkPerm(sesion(["pos.usar"]), PERMISOS_LEER_CLIENTES).ok, true);
});

test("el cajero llega a la agenda solo con pos.usar", () => {
  // Es el caso que motivó el cambio: el POS busca clientes y el cajero no tiene
  // por qué administrar la agenda.
  const cajero = sesion(["pos.usar", "turnos.ver"]);
  assert.equal(checkPerm(cajero, PERMISOS_LEER_CLIENTES).ok, true);
});

test("no tener ninguno de los dos da 403", () => {
  const r = checkPerm(sesion(["stock.ver", "productos.ver"]), PERMISOS_LEER_CLIENTES);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("el error nombra los dos permisos, no uno", () => {
  // Para que quien lo lea sepa cuál de los dos pedir.
  const r = checkPerm(sesion([]), PERMISOS_LEER_CLIENTES);
  assert.match(r.error, /clientes\.ver/);
  assert.match(r.error, /pos\.usar/);
  assert.match(r.error, / o /);
});

test("una lista vacía no deja pasar a nadie salvo al admin", () => {
  assert.equal(checkPerm(sesion(["clientes.ver"]), []).ok, false);
  assert.equal(checkPerm(sesion([], true), []).ok, true);
});

test("PERMISOS_LEER_CLIENTES son exactamente esos dos", () => {
  // Inventario: sumar un permiso a la agenda tiene que ser deliberado.
  assert.deepEqual([...PERMISOS_LEER_CLIENTES].sort(), ["clientes.ver", "pos.usar"]);
});

// ---------------------------------------------------------------------------
// Estructural: las seis rutas de lectura piden permiso
// ---------------------------------------------------------------------------

const RUTAS_LECTURA_CLIENTES = [
  "app/api/clientes/listar/route.js",
  "app/api/clientes/buscar/route.js",
  "app/api/clientes/[id]/route.js",
  "app/api/clientes/[id]/ventas/route.js",
  "app/api/clientes/analytics/ranking/route.js",
  "app/api/clientes/analytics/inactivos/route.js",
];

test("las seis rutas de lectura de clientes piden permiso", () => {
  for (const rel of RUTAS_LECTURA_CLIENTES) {
    const src = leer(rel);
    assert.match(
      src,
      /PERMISOS_LEER_CLIENTES/,
      `${rel} volvió a quedar sin chequeo: cualquier usuario autenticado vería ` +
        `los clientes del grupo entero.`
    );
  }
});

test("el chequeo recibe la SESIÓN, no el scope entero", () => {
  // Este candado existe porque la primera versión de este cambio pasó en verde
  // con el código roto. El candado de arriba comprueba que el permiso se PIDA;
  // no comprueba que se pida bien.
  //
  // `resolveLocalAndGrupo` y `resolveGrupo` devuelven `{ localId, grupoId,
  // session }`: la sesión va ANIDADA. Pasarles el scope entero a `checkPerm`
  // hace que `session.permisos` sea undefined, revienta con TypeError, lo
  // atrapa el catch de la ruta y el usuario ve "Error interno" 500 en vez del
  // 403 que corresponde. La pantalla queda rota para todos, incluido quien sí
  // tiene el permiso.
  for (const rel of RUTAS_LECTURA_CLIENTES) {
    const src = leer(rel);
    assert.doesNotMatch(
      src,
      /checkPerm\(\s*scope\s*,/,
      `${rel}: checkPerm recibe el scope entero. Tiene que ser scope.session — ` +
        `si no, la ruta responde 500 en vez de 403.`
    );
  }
});

test("todas las rutas de clientes llaman a checkPerm con la misma forma", () => {
  // El idioma del módulo ya era `checkPerm(scope.session, ...)` en las rutas de
  // cuenta corriente y puntos. Que las nuevas lo respeten es lo que evita el
  // mismo error la próxima vez.
  const dir = path.join(ROOT, "app/api/clientes");
  const malas = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name === "route.js") {
        const src = fs.readFileSync(p, "utf8");
        if (/checkPerm\(\s*scope\s*,/.test(src)) {
          malas.push(path.relative(ROOT, p).replace(/\\/g, "/"));
        }
      }
    }
  };
  recorrer(dir);
  assert.deepEqual(malas, [], `checkPerm mal invocado en: ${malas.join(", ")}`);
});

test("ninguna ruta de clientes quedó sin chequeo de permiso", () => {
  // Enumera el directorio ENTERO en vez de una lista escrita a mano: una ruta
  // nueva sin guard tiene que poner esto en rojo, no pasar desapercibida.
  const dir = path.join(ROOT, "app/api/clientes");
  const rutas = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name === "route.js") rutas.push(p);
    }
  };
  recorrer(dir);

  assert.ok(rutas.length >= 20, `se esperaban 20+ rutas de clientes, se vieron ${rutas.length}`);

  const sinGuard = rutas
    .filter((p) => {
      const src = fs.readFileSync(p, "utf8");
      return !/requirePerm|requireAdmin|checkPerm|PERMISOS_LEER_CLIENTES/.test(src);
    })
    .map((p) => path.relative(ROOT, p).replace(/\\/g, "/"));

  assert.deepEqual(sinGuard, [], `rutas de clientes sin chequeo de permiso: ${sinGuard.join(", ")}`);
});

// ---------------------------------------------------------------------------
// El historial del cliente no mezcla ventas internas
// ---------------------------------------------------------------------------

test("el historial del cliente filtra las ventas internas por defecto", () => {
  // Buscaba la cadena literal `whereVentaComercial({ clienteId, localId })` y se
  // puso rojo el 2026-08-20 cuando esa llamada pasó a recibir un segundo
  // argumento —`{ incluirInternas }`—, que es lo que hace que pedir internas no
  // se lleve el filtro de anuladas de arrastre. La propiedad no cambió; cambió
  // cómo se escribe. Ahora se afirma la propiedad.
  const src = leer("app/api/clientes/[id]/ventas/route.js");
  assert.match(src, /whereVentaComercial\(\{ clienteId, localId \}/,
    "el historial dejó de pasar por el helper");
  assert.doesNotMatch(
    src,
    /const where = \{ clienteId, localId \};/,
    "volvió a consultar sin filtrar: un cliente vinculado a un local interno " +
      "vería sus transferencias mezcladas con sus compras."
  );
  // Y el default sigue siendo excluirlas: la única forma de verlas es el opt-in.
  assert.doesNotMatch(
    src,
    /incluirInternas:\s*true/,
    "el historial pasó a incluir internas SIEMPRE en vez de solo cuando se piden"
  );
});

test("ver las internas es un filtro explícito que se prende", () => {
  const src = leer("app/api/clientes/[id]/ventas/route.js");
  assert.match(src, /incluirInternas/);
  // Y que el default sea excluirlas: el parámetro tiene que ser opt-IN.
  assert.match(src, /searchParams\.get\("incluirInternas"\) === "1"/);
});
