// Candados de "cada local tiene sus propios proveedores", del lado de ESCRIBIR.
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// Un DUEÑO_LOCAL no podía crear un proveedor: `crear` y `editar` pedían
// `requireAdmin` escrito a mano y contestaban "Requiere administrador". La regla
// de Emanuel: lo que un local crea es de ese local, y sobre lo propio tiene los
// mismos poderes que el depósito. Nunca lo de otro local ni lo del depósito.
//
// Se afirman las tres cosas pedidas, cada una con su contraria al lado:
//
//   1. DUEÑO_LOCAL crea, y el proveedor queda en SU local (el de la sesión).
//   2. DUEÑO_LOCAL no edita uno de otro local ni del depósito, aunque mande el
//      id a mano: el `where` lo arma `proveedorEditableWhere`, no el request.
//   3. Admin sigue igual: crea y edita cualquiera.
//
// Las rutas se ejercieron además contra Postgres con sesiones firmadas; eso no
// entra en la suite porque los candados no tocan la base.
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test app/api/proveedores/proveedoresDelLocal.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { proveedorEditableWhere } from "@/lib/visibilidad";
import { DEFAULT_PERMISOS_SISTEMA, DUENO_LOCAL, ENCARGADO, CAJERO } from "@/lib/rbac/systemRoles";
import { PERMISSION_REGISTRY as PERMISSIONS } from "@/lib/rbac/registry";
import { checkPerm } from "@/lib/authorize";

const RAIZ = process.cwd();
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
/** Sin comentarios antes de mirar: un candado que busca texto los encuentra. */
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const CREAR = "app/api/proveedores/crear/route.js";
const EDITAR = "app/api/proveedores/editar/route.js";
const MIGRACION = "prisma/migrations/20261018120000_permisos_proveedores_dueno_local/migration.sql";

const DEPO = 1;
const LOCAL_A = 2;
const LOCAL_B = 3;

// Proveedores como los distingue `creadoEnLocalId`. Los viejos lo tienen en null.
const DEL_DEPOSITO = { id: 10, creadoEnLocalId: DEPO };
const DEL_LOCAL_A = { id: 11, creadoEnLocalId: LOCAL_A };
const DEL_LOCAL_B = { id: 12, creadoEnLocalId: LOCAL_B };
const VIEJO = { id: 13, creadoEnLocalId: null };
const TODOS = [DEL_DEPOSITO, DEL_LOCAL_A, DEL_LOCAL_B, VIEJO];

/**
 * ¿El proveedor pasa el `where` de escritura? Primero se afirma la FORMA exacta
 * que devuelve la función: si cambia, el candado se pone rojo acá en vez de
 * evaluar una forma que ya no existe.
 */
function editable(proveedor, localId, esAdmin) {
  const w = proveedorEditableWhere(localId, esAdmin);
  if (esAdmin) {
    assert.deepEqual(w, {}, "cambió la forma para admin");
    return true;
  }
  if (!localId) {
    assert.deepEqual(w, { id: { in: [] } }, "cambió la forma sin local");
    return false;
  }
  assert.deepEqual(Object.keys(w), ["creadoEnLocalId"], "cambió la forma de proveedorEditableWhere");
  assert.equal(typeof w.creadoEnLocalId, "number");
  return proveedor.creadoEnLocalId === w.creadoEnLocalId;
}

// ── 1. El dueño crea, y queda en su local ────────────────────────────────────

test("1. DUEÑO_LOCAL tiene ver, crear y editar proveedores; encargado y cajero no", () => {
  const dueno = DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL];
  for (const p of ["proveedores.ver", "proveedores.crear", "proveedores.editar"]) {
    assert.ok(dueno.includes(p), `DUEÑO_LOCAL sin ${p}`);
    assert.ok(PERMISSIONS.some((x) => x.code === p && !x.deprecated), `${p} no está en el registro`);
  }
  for (const rol of [ENCARGADO, CAJERO]) {
    assert.ok(!DEFAULT_PERMISOS_SISTEMA[rol].includes("proveedores.crear"), `${rol} recibió proveedores.crear`);
  }
});

test("1. la migración habilita a los DUEÑO_LOCAL que ya existen, sin tocar a nadie más", () => {
  const sql = leer(MIGRACION).replace(/--[^\n]*/g, "");
  for (const p of ["proveedores.ver", "proveedores.crear", "proveedores.editar"]) {
    assert.ok(sql.includes(`'["${p}"]'::jsonb`), `la migración no agrega ${p}`);
  }
  const updates = sql.split(/;\s*/).filter((s) => /UPDATE "Rol"/.test(s));
  assert.equal(updates.length, 3);
  for (const u of updates) {
    assert.match(u, /"nombre" = 'DUEÑO_LOCAL'/);
    assert.match(u, /"permisos" \|\| /, "tiene que concatenar, no reemplazar");
    assert.match(u, /AND NOT \("permisos" @> '\["proveedores\.[a-z]+"\]'::jsonb\)/, "no es idempotente");
  }
});

test("1. crear pide proveedores.crear, no administrador, y el local sale de la sesión", () => {
  const src = sinComentarios(leer(CREAR));
  assert.ok(!src.includes("requireAdmin"), "crear sigue pidiendo administrador");
  assert.match(src, /requirePerm\(req, "proveedores\.crear"\)/);
  // El local del proveedor nuevo es el del alcance resuelto, nunca del body.
  assert.match(src, /creadoEnLocalId = scope\.error \? null : scope\.localId/);
  assert.ok(!/const \{[^}]*creadoEnLocalId[^}]*\} = body/.test(src), "el body puede elegir el local");
  assert.ok(!/localId[^\n]*body\.|body\.[a-zA-Z]*[lL]ocal/.test(src), "el body puede elegir el local");
  // Sin local, un no-admin no crea: un proveedor sin dueño no lo vería nadie.
  assert.match(src, /if \(!session\.esAdmin && scope\.error\)/);
});

// ── 2. El dueño no edita lo ajeno ────────────────────────────────────────────

test("2. DUEÑO_LOCAL edita solo los proveedores creados en su local", () => {
  assert.deepEqual(TODOS.filter((p) => editable(p, LOCAL_A, false)), [DEL_LOCAL_A]);
  assert.deepEqual(TODOS.filter((p) => editable(p, LOCAL_B, false)), [DEL_LOCAL_B]);
  // Ni del depósito ni los viejos sin local.
  assert.equal(editable(DEL_DEPOSITO, LOCAL_A, false), false);
  assert.equal(editable(VIEJO, LOCAL_A, false), false);
  // Sin local, nada: un `undefined` en Prisma sería "sin filtro".
  assert.deepEqual(TODOS.filter((p) => editable(p, undefined, false)), []);
  assert.deepEqual(TODOS.filter((p) => editable(p, null, false)), []);
});

test("2. editar pide proveedores.editar y filtra con el predicado de escritura antes de tocar", () => {
  const src = sinComentarios(leer(EDITAR));
  assert.ok(!src.includes("requireAdmin"), "editar sigue pidiendo administrador");
  assert.match(src, /requirePerm\(req, "proveedores\.editar"\)/);
  assert.match(src, /where: \{ id: numId, \.\.\.proveedorEditableWhere\(scope\.localId, session\.esAdmin\) \}/);
  // El update usa el id que pasó el filtro, no el que mandó el request.
  assert.match(src, /prisma\.proveedor\.update\(\{\s*where: \{ id: propio\.id \}/);
  assert.ok(src.indexOf("proveedorEditableWhere(") < src.indexOf("prisma.proveedor.update("));
  assert.match(src, /status: session\.esAdmin \? 404 : 403/);
});

// ── 3. Admin sigue igual ─────────────────────────────────────────────────────

test("3. admin edita cualquier proveedor, con o sin contexto", () => {
  assert.deepEqual(TODOS.filter((p) => editable(p, LOCAL_A, true)), TODOS);
  assert.deepEqual(TODOS.filter((p) => editable(p, undefined, true)), TODOS);
});

test("3. el permiso deja pasar al admin y al dueño, y frena al encargado", () => {
  const sesion = (permisos) => ({ permisos, esAdmin: permisos.includes("*") });
  for (const p of ["proveedores.crear", "proveedores.editar"]) {
    assert.equal(checkPerm(sesion(["*"]), p).ok, true, `admin frenado en ${p}`);
    assert.equal(checkPerm(sesion(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL]), p).ok, true, `dueño frenado en ${p}`);
    assert.equal(checkPerm(sesion(DEFAULT_PERMISOS_SISTEMA[ENCARGADO]), p).ok, false, `encargado pasa ${p}`);
  }
});

test("3. admin crea igual que antes: sin contexto el proveedor queda en null, con contexto en ese local", () => {
  const src = sinComentarios(leer(CREAR));
  assert.match(src, /creadoEnLocalId = scope\.error \? null : scope\.localId \?\? null/);
  // El corte por falta de local es solo para quien no es admin.
  assert.ok(!/if \(scope\.error\)/.test(src), "admin sin contexto dejaría de poder crear");
});
