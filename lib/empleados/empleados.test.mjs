// lib/empleados/empleados.test.mjs
//
// CANDADOS DE EMPLEADOS. Lo que se ejerce contra Postgres —la migración con su
// relleno, el operador nuevo con su empleado, el sueldo de un empleado sin
// operador— está en scripts/pruebas-db/empleados.mjs, con la contraprueba EM-1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ERROR_NOMBRE, esDelLocal, leerNombre, leerOperadorId, pideOtroLocal } from "./empleados.js";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("un registro es de UN local: el suyo, comparado contra el activo", () => {
  assert.equal(esDelLocal({ localId: 4 }, 4), true);
  assert.equal(esDelLocal({ localId: 4 }, "4"), true);
  assert.equal(esDelLocal({ localId: 9 }, 4), false);
  // Uno sin local —de antes del relleno, o creado en la ventana— no es de ninguno.
  assert.equal(esDelLocal({ localId: null }, 4), false);
  assert.equal(esDelLocal({ localId: 4 }, null), false);
  assert.equal(esDelLocal(null, 4), false);
  // El local no viaja en el pedido: venga como venga, se rechaza.
  assert.equal(pideOtroLocal({ nombre: "Ana" }), false);
  assert.equal(pideOtroLocal({ nombre: "Ana", localIds: [4] }), true);
  assert.equal(pideOtroLocal({ nombre: "Ana", localIds: [] }), true);
  assert.equal(pideOtroLocal({ nombre: "Ana", localId: 4 }), true);
  assert.equal(pideOtroLocal(null), false);
});

test("nombre y operador: lo que llega del formulario", () => {
  assert.deepEqual(leerNombre("  Ana  "), { nombre: "Ana" });
  assert.deepEqual(leerNombre("A"), { error: ERROR_NOMBRE });
  assert.deepEqual(leerOperadorId(undefined), { operadorId: undefined });
  assert.deepEqual(leerOperadorId(null), { operadorId: null });
  assert.deepEqual(leerOperadorId(""), { operadorId: null });
  assert.deepEqual(leerOperadorId("7"), { operadorId: 7 });
});

test("operador nuevo → su empleado, en el MISMO local y en la MISMA transacción", () => {
  const ruta = sinComentarios(readFileSync("app/api/operador/crear/route.js", "utf8"));
  const tx = ruta.slice(ruta.indexOf("prisma.$transaction(async (tx) =>"));
  assert.ok(tx.length > 0, "el alta del operador dejó de ser una transacción");
  const cuerpo = tx.slice(0, tx.indexOf("return creado;"));
  assert.match(cuerpo, /tx\.operadorLocal\.create\(\{\s*data: \{ nombre: nombreNorm, pinHash, localId \}/);
  assert.match(cuerpo, /await crearEmpleadoDeOperador\(tx, \{ operadorId: creado\.id, nombre: creado\.nombre, localId \}\)/);
  assert.match(cuerpo, /if \(!empleado\) throw new EmpleadoConOtroOperador\(\)/);
  assert.doesNotMatch(ruta, /prisma\.operadorLocal\.create\(/, "un alta fuera de la transacción dejaría un operador sin empleado");
  // Y el empleado nace en ese local.
  const server = sinComentarios(readFileSync("lib/empleados/empleadosServer.js", "utf8"));
  assert.match(server, /data: \{ nombre, activo, operadorId, localId: Number\(localId\) \}/);
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
