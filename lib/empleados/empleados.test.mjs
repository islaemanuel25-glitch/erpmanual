// lib/empleados/empleados.test.mjs
//
// CANDADOS DE EMPLEADOS. Lo que se ejerce contra Postgres —la migración con su
// relleno, el operador nuevo con su empleado, el sueldo de un empleado sin
// operador— está en scripts/pruebas-db/empleados.mjs, con la contraprueba EM-1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ERROR_LOCAL_AJENO,
  ERROR_NOMBRE,
  ERROR_SIN_ALCANCE,
  ERROR_SIN_LOCAL,
  leerNombre,
  leerOperadorId,
  localesEnAlcance,
  operadorEnAlcance,
} from "./empleados.js";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("el alcance es el de Operadores: un no-admin asigna solo su local", () => {
  const encargado = { esAdmin: false, localId: 4 };
  assert.deepEqual(localesEnAlcance([4], encargado), { localIds: [4] });
  assert.deepEqual(localesEnAlcance([4, 5], encargado), { error: ERROR_LOCAL_AJENO, status: 403 });
  assert.deepEqual(localesEnAlcance([4], { esAdmin: false }), { error: ERROR_SIN_ALCANCE, status: 403 });
  assert.deepEqual(localesEnAlcance([], encargado), { error: ERROR_SIN_LOCAL, status: 400 });
  assert.deepEqual(localesEnAlcance(["5", 6, 6], { esAdmin: true }), { localIds: [5, 6] });
  assert.equal(operadorEnAlcance({ locales: [{ localId: 4 }] }, encargado), true);
  assert.equal(operadorEnAlcance({ locales: [{ localId: 9 }] }, encargado), false);
  assert.equal(operadorEnAlcance({ locales: [] }, { esAdmin: true }), true);
});

test("nombre y operador: lo que llega del formulario", () => {
  assert.deepEqual(leerNombre("  Ana  "), { nombre: "Ana" });
  assert.deepEqual(leerNombre("A"), { error: ERROR_NOMBRE });
  assert.deepEqual(leerOperadorId(undefined), { operadorId: undefined });
  assert.deepEqual(leerOperadorId(null), { operadorId: null });
  assert.deepEqual(leerOperadorId(""), { operadorId: null });
  assert.deepEqual(leerOperadorId("7"), { operadorId: 7 });
});

test("operador nuevo → su empleado, en la MISMA transacción", () => {
  const ruta = sinComentarios(readFileSync("app/api/operador/crear/route.js", "utf8"));
  const tx = ruta.slice(ruta.indexOf("prisma.$transaction(async (tx) =>"));
  assert.ok(tx.length > 0, "el alta del operador dejó de ser una transacción");
  const cuerpo = tx.slice(0, tx.indexOf("return creado;"));
  assert.match(cuerpo, /tx\.operadorLocal\.create\(/);
  assert.match(cuerpo, /tx\.operadorEnLocal\.createMany\(/);
  assert.match(cuerpo, /await crearEmpleadoDeOperador\(tx, \{ operadorId: creado\.id, nombre: creado\.nombre, localIds: asignLocalIds \}\)/);
  assert.doesNotMatch(ruta, /prisma\.operadorLocal\.create\(/, "un alta fuera de la transacción dejaría un operador sin empleado");
});

test("la migración trae su relleno entre marcas y su reposición escrita", () => {
  const sql = readFileSync("prisma/migrations/20261015154425_empleados/migration.sql", "utf8");
  const relleno = sql.slice(sql.indexOf("-- RELLENO:INICIO"), sql.indexOf("-- RELLENO:FIN"));
  assert.ok(relleno.length > 100, "sin marcas, la prueba de base no puede volver a correr el relleno");
  // Idempotente: cada sentencia mira lo que ya hay antes de escribir.
  assert.match(relleno, /WHERE NOT EXISTS \(SELECT 1 FROM "Empleado" e WHERE e\."operadorId" = o\."id"\)/);
  assert.match(relleno, /ON CONFLICT \("empleadoId", "localId"\) DO NOTHING/);
  assert.equal((relleno.match(/"empleadoId" IS NULL/g) || []).length, 3);
  // Estructura aditiva: no se borra ni se renombra nada.
  assert.doesNotMatch(sql, /DROP (TABLE|COLUMN)|RENAME/);
  assert.match(sql, /ALTER COLUMN "operadorId" DROP NOT NULL/);
  assert.match(sql, /scripts\/deploy\/reposicion-empleados\.sql/);
  const repo = readFileSync("scripts/deploy/reposicion-empleados.sql", "utf8");
  assert.match(repo, /PARTE A/);
  assert.match(repo, /PARTE B/);
});

test("Empleados está en Administración, al lado de Operadores y con su permiso", () => {
  const menu = sinComentarios(readFileSync("lib/menu/registry.js", "utf8"));
  const iOp = menu.indexOf('href: "/modulos/operadores"');
  const iEmp = menu.indexOf('href: "/modulos/empleados"');
  assert.ok(iOp > 0 && iEmp > iOp, "Empleados va después de Operadores");
  const entrada = menu.slice(iEmp, menu.indexOf("}", iEmp));
  assert.match(entrada, /permiso: "config_local\.operadores"/);
  for (const ruta of ["listar-todos", "crear", "editar"]) {
    const fuente = readFileSync(`app/api/empleados/${ruta}/route.js`, "utf8");
    assert.match(fuente, /requirePerm\(req, "config_local\.operadores"\)/, ruta);
  }
});
