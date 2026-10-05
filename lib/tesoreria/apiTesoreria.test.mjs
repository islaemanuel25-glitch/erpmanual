// GET /api/finanzas/tesoreria — candados de la PUERTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/tesoreria/apiTesoreria.test.mjs
//
// El comportamiento lo ejerce scripts/pruebas-db/tesoreriaApi.mjs contra
// PostgreSQL. Acá se fija la FORMA de la ruta, que es lo que un cambio futuro
// puede romper sin que la prueba de base lo vea en el momento:
//   · es una capa fina: no reescribe ninguna regla de plata;
//   · no escribe;
//   · pide su propio permiso, y el alcance sale de los resolutores de Finanzas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PERMISSION_REGISTRY } from "../rbac/registry.js";
import { DEFAULT_PERMISOS_SISTEMA } from "../rbac/systemRoles.js";
import { PERMISO_VER_TESORERIA } from "./permisos.js";

const RUTA = "app/api/finanzas/tesoreria/route.js";
const codigo = readFileSync(RUTA, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("el permiso está en el registro, en finanzas, y no viene con ningún rol de sistema", () => {
  assert.equal(PERMISO_VER_TESORERIA, "tesoreria.ver");
  const p = PERMISSION_REGISTRY.find((x) => x.code === PERMISO_VER_TESORERIA);
  assert.ok(p, "falta en lib/rbac/registry.js");
  assert.equal(p.group, "finanzas");
  assert.equal(p.deprecated, false);
  const roles = Object.entries(DEFAULT_PERMISOS_SISTEMA);
  assert.ok(roles.length >= 3, `la matriz trajo ${roles.length} roles`);
  assert.deepEqual(roles.filter(([, permisos]) => permisos.includes(PERMISO_VER_TESORERIA)), []);
});

test("la ruta pide tesoreria.ver antes de leer nada", () => {
  const iPerm = codigo.indexOf("checkPerm(session, PERMISO_VER_TESORERIA)");
  assert.ok(iPerm > 0, "no chequea el permiso");
  for (const despues of ["resolveVistaOperativa(", "leerTesoreria(", "prisma.local.findUnique("]) {
    assert.ok(codigo.indexOf(despues) > iPerm, `${despues} va antes del permiso`);
  }
});

test("el alcance sale de los resolutores de Finanzas, no de uno propio", () => {
  assert.match(codigo, /resolveVistaOperativa\(req\)/);
  assert.match(codigo, /esVistaDeDeposito\(\{ modo: vista\.modo, localPropio \}\)/);
  assert.match(codigo, /resolverLocalPedido\(\{[\s\S]*destinoPedido: searchParams\.get\("destino"\)/);
  // El local que se lee es SIEMPRE el que resolvió el alcance.
  assert.match(codigo, /const localId = alcance\.localId;/);
  assert.doesNotMatch(codigo, /searchParams\.get\("localId"\)/);
});

test("es una capa fina: le pide todo a la lectura canónica y no reescribe reglas", () => {
  assert.match(codigo, /leerTesoreria\(prisma, \{ localId, fechaInicio: rango\.fechaInicio, fechaFin: rango\.fechaFin \}\)/);
  assert.match(codigo, /rangoDeTesoreria\(prisma, \{ localId, unidad, desplazamiento, rangoFijo \}\)/);
  // Ninguna tabla de plata ni ninguna clase de movimiento se consulta acá.
  for (const regla of [
    /cajaMovimiento/, /ventaPago/, /\bventa\./, /pagoProveedor/, /pagoGasto/, /arqueoCaja/,
    /RECAUDACION/, /CIERRE/, /clasificarMovimientos/, /tendersParaAgregar/, /grupoDeTesoreria/, /turnoOperativo/,
  ]) {
    assert.doesNotMatch(codigo, regla, `la ruta reescribe ${regla}`);
  }
});

test("Otro: el rango sale de leerRangoElegido, se rechaza con 400 y no navega", () => {
  assert.match(codigo, /leerRangoElegido\(\{ desde: searchParams\.get\("desde"\), hasta: searchParams\.get\("hasta"\) \}\)/);
  assert.match(codigo, /if \(leido\.error\) return NextResponse\.json\(\{ ok: false, error: leido\.error \}, \{ status: 400 \}\);/);
  assert.match(codigo, /ERROR_RANGO_SIN_OTRO \}, \{ status: 400 \}/);
  assert.match(codigo, /puedeAvanzar: esOtro \? false : puedeAvanzar\(desplazamiento\)/);
  assert.match(codigo, /puedeRetroceder: esOtro \? false :/);
  // El rango elegido no salta el alcance: se resuelve el local ANTES de leerlo.
  assert.ok(codigo.indexOf("const localId = alcance.localId;") < codigo.indexOf("rangoDeTesoreria("));
});

test("las capacidades salen de checkPerm con los permisos de las acciones", () => {
  assert.match(codigo, /puedeVerificarEfectivo: checkPerm\(session, PERMISO_VERIFICAR_EFECTIVO\)\.ok/);
  assert.match(codigo, /puedeAnularVerificacion: checkPerm\(session, PERMISO_ANULAR_VERIFICACION\)\.ok/);
});

test("un GET no escribe: ninguna llamada de escritura en la ruta", () => {
  assert.doesNotMatch(codigo, /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
  assert.doesNotMatch(codigo, /\$(executeRaw|executeRawUnsafe|transaction)/);
  assert.doesNotMatch(codigo, /export async function (POST|PUT|PATCH|DELETE)/);
});
