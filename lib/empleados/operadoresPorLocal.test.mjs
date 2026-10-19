// lib/empleados/operadoresPorLocal.test.mjs
//
// CANDADOS DE OPERADORES Y EMPLEADOS POR LOCAL (2026-10-15). Regla de Emanuel:
// un operador y un empleado son de UN local, el que los contrata; todo lo suyo
// es de ese local. Si alguien trabaja en dos, son dos registros.
//
// Leen el código SIN COMENTARIOS: los de estos archivos nombran a propósito
// `OperadorEnLocal` y `localIds` para explicar por qué ya no se usan. Lo que se
// ejerce contra Postgres —la migración con los operadores de hoy, el freno, las
// rutas, el 403 de Pagar— está en scripts/pruebas-db/operadoresPorLocal.mjs,
// con las contrapruebas OL-.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/empleados/operadoresPorLocal.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const leer = (rel) => sinComentarios(readFileSync(rel, "utf8"));
const MIGRACION = "prisma/migrations/20261015232632_operadores_y_empleados_por_local/migration.sql";

/** El código de la app —app, lib, components—, trackeado o no, sin candados. */
function codigoDeLaApp() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "app", "lib", "components"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !f.endsWith(".test.mjs"));
}

/** Los archivos que todavía leen o escriben las tablas de vínculo. */
function quienesUsanLosVinculos(archivos, leerArchivo = leer) {
  return archivos.filter((f) => /\b(operadorEnLocal|empleadoEnLocal)\.|operadorId_localId/.test(leerArchivo(f)));
}

test("ningún código de la app lee ni escribe OperadorEnLocal ni EmpleadoEnLocal", () => {
  assert.deepEqual(quienesUsanLosVinculos(codigoDeLaApp()), []);
});

test("CONTRAPRUEBA: el relevamiento ve un uso de código y no uno escrito en un comentario", () => {
  const fuentes = {
    "a.js": "const x = await prisma.operadorEnLocal.findMany({});",
    "b.js": sinComentarios("// antes: prisma.operadorEnLocal.findMany({})\nconst y = 1;"),
    "c.js": "where: { operadorId_localId: { operadorId, localId } }",
  };
  assert.deepEqual(quienesUsanLosVinculos(Object.keys(fuentes), (f) => fuentes[f]), ["a.js", "c.js"]);
});

// ── LAS LISTAS, EL ALTA Y LA EDICIÓN: EL LOCAL ACTIVO ─────────────────────

const RUTAS_DE_ADMINISTRACION = [
  "app/api/operador/crear/route.js",
  "app/api/operador/editar/route.js",
  "app/api/operador/eliminar/route.js",
  "app/api/operador/listar-todos/route.js",
  "app/api/empleados/crear/route.js",
  "app/api/empleados/editar/route.js",
  "app/api/empleados/listar-todos/route.js",
];

test("Administración: cada ruta resuelve el local activo, para admin y no-admin, y no lee el de la sesión a mano", () => {
  for (const ruta of RUTAS_DE_ADMINISTRACION) {
    const src = leer(ruta);
    assert.match(src, /const scope = await resolveLocalAndGrupo\(req\);/, ruta);
    assert.doesNotMatch(src, /session\.esAdmin|session\.localId|localIds/, `${ruta} decide el alcance por su cuenta`);
  }
});

test("las listas son las del local activo", () => {
  assert.match(leer("app/api/operador/listar-todos/route.js"), /where: \{ localId: scope\.localId \}/);
  const emp = leer("app/api/empleados/listar-todos/route.js");
  assert.match(emp, /prisma\.empleado\.findMany\(\{ where: \{ localId \}/);
  assert.match(emp, /where: \{ localId, empleado: null \}/, "los operadores para asociar, del mismo local");
});

test("el alta crea en el local activo y rechaza que se elija otro; la edición no muda", () => {
  const op = leer("app/api/operador/crear/route.js");
  assert.match(op, /if \(pideOtroLocal\(body\)\) \{\s*return NextResponse\.json\(\{ ok: false, error: ERROR_NO_SE_MUDA \}, \{ status: 400 \}\)/);
  assert.match(op, /data: \{ nombre: nombreNorm, pinHash, localId \}/);
  const emp = leer("app/api/empleados/crear/route.js");
  assert.match(emp, /if \(pideOtroLocal\(body\)\) return NextResponse\.json\(\{ ok: false, error: ERROR_NO_SE_MUDA \}, \{ status: 400 \}\)/);
  assert.match(emp, /operadorId: op\.operadorId \?\? null,\s*localId,/);
  for (const ruta of ["app/api/operador/editar/route.js", "app/api/empleados/editar/route.js"]) {
    const src = leer(ruta);
    assert.match(src, /pideOtroLocal\(body\)/, ruta);
    assert.match(src, /if \(!esDelLocal\((operador|empleado), (scope\.localId|localId)\)\)/, `${ruta}: edita solo uno de su local`);
    assert.doesNotMatch(src, /data\.localId|localId: body/, `${ruta}: no muda de local`);
  }
  assert.match(leer("app/api/operador/eliminar/route.js"), /if \(!esDelLocal\(operador, scope\.localId\)\)/);
});

test("el nombre es único DENTRO del local, no en todo el sistema", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const bloque = (m) => schema.slice(schema.indexOf(`model ${m} {`), schema.indexOf("\n}", schema.indexOf(`model ${m} {`)));
  for (const m of ["OperadorLocal", "Empleado"]) {
    assert.match(bloque(m), /@@unique\(\[localId, nombre\]\)/, m);
    assert.doesNotMatch(bloque(m), /nombre\s+String\s+@unique/, `${m}: el nombre ya no es único global`);
  }
  assert.match(leer("app/api/operador/crear/route.js"), /where: \{ localId_nombre: \{ localId, nombre: nombreNorm \} \}/);
  assert.match(leer("app/api/operador/editar/route.js"), /where: \{ localId: operador\.localId, nombre: nombreNorm, id: \{ not: operador\.id \} \}/);
});

test("las pantallas ya no eligen locales", () => {
  for (const f of ["components/operadores/ModalOperador.jsx", "components/empleados/ModalEmpleado.jsx", "app/modulos/operadores/page.jsx", "app/modulos/empleados/page.jsx"]) {
    assert.doesNotMatch(leer(f), /localIds|operador\/locales|\.locales\b/, f);
  }
});

// ── EL POS: LOGIN, OPERADOR ACTIVO, PAGAR ─────────────────────────────────

test("el login y el operador activo leen OperadorLocal.localId", () => {
  assert.match(leer("app/api/operador/listar/route.js"), /where: \{ localId: scope\.localId, activo: true \}/);
  assert.match(leer("app/api/operador/login/route.js"), /where: \{ id: Number\(operadorId\) \|\| 0, localId: scope\.localId \}/);
  assert.match(leer("lib/operador.js"), /if \(operador\?\.activo !== true \|\| operador\.localId !== local\) return null;/);
  assert.match(leer("lib/pos-ventas/cobrosOfflineConsulta.js"), /where: \{ id: \{ in: ids\(operadores\) \}, localId \}/);
});

// Desde el 2026-10-19 el sueldo de un empleado de otro local es 400 y lo
// rechaza `crearGasto` —la regla única de sueldos, para el POS y para
// Finanzas—; el POS le pasa el empleado sin validarlo por su cuenta. El consumo
// sigue con su 403.
test("Pagar → Sueldo y Consumo: ofrece los del local y rechaza el de otro (sueldo 400 en crearGasto, consumo 403)", () => {
  const server = leer("lib/empleados/empleadosServer.js");
  assert.match(server, /where: \{ activo: true, localId: Number\(localId\) \}/);
  assert.match(server, /if \(!esDelLocal\(e, localId\)\) return \{ empleado: null, deOtroLocal: true \};/);
  assert.match(leer("lib/finanzas/gastosServer.js"), /if \(deOtroLocal\) throw new ErrorGasto\(ERROR_EMPLEADO_DE_OTRO_LOCAL\);/);
  assert.match(leer("lib/caja/pagarDesdeElPosServer.js"), /empleadoId = body\.empleadoId;/);
  assert.match(leer("lib/pos-ventas/consumoPersonalServer.js"), /if \(deOtroLocal\) throw new ErrorConsumoPersonal\(ERROR_EMPLEADO_DE_OTRO_LOCAL, 403\);/);
});

// ── LA MIGRACIÓN ──────────────────────────────────────────────────────────

test("la migración: el freno antes que el esquema, el relleno idempotente entre marcas, nada borrado", () => {
  const sql = readFileSync(MIGRACION, "utf8");
  const freno = sql.indexOf("RAISE EXCEPTION 'OPERADORES_Y_EMPLEADOS_POR_LOCAL");
  assert.ok(freno > 0 && freno < sql.indexOf("ALTER TABLE"), "el freno va antes de tocar el esquema");
  const relleno = sql.slice(sql.indexOf("-- RELLENO:INICIO"), sql.indexOf("-- RELLENO:FIN"));
  assert.ok(relleno.length > 100, "sin marcas, la prueba de base no puede volver a correr el relleno");
  assert.equal((relleno.match(/"localId" IS NULL/g) || []).length, 2, "solo escribe donde falta");
  assert.equal((relleno.match(/\) = 1;/g) || []).length, 2, "cada UPDATE exige una sola fila: no elige");
  assert.doesNotMatch(sql, /DROP (TABLE|COLUMN)|RENAME/);
  assert.deepEqual(sql.match(/DROP INDEX "[^"]+"/g), ['DROP INDEX "OperadorLocal_nombre_key"']);
  assert.match(sql, /CREATE UNIQUE INDEX "OperadorLocal_localId_nombre_key" ON "OperadorLocal"\("localId", "nombre"\)/);
  assert.match(sql, /CREATE UNIQUE INDEX "Empleado_localId_nombre_key" ON "Empleado"\("localId", "nombre"\)/);
  assert.match(sql, /scripts\/deploy\/reposicion-operadores-por-local\.sql/);
  const repo = readFileSync("scripts/deploy/reposicion-operadores-por-local.sql", "utf8");
  for (const parte of ["PARTE 0", "PARTE A", "PARTE B"]) assert.match(repo, new RegExp(parte));
});
