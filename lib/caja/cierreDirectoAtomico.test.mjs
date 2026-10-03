// EL CIERRE DIRECTO CALCULA SU FOTOGRAFÍA CON EL TURNO TOMADO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/cierreDirectoAtomico.test.mjs
//
// El comportamiento lo ejerce scripts/pruebas-db/cierreDirectoAtomico.mjs con las
// carreras forzadas contra PostgreSQL. Acá se fija el ORDEN dentro de
// `turnos/cerrar`: primero el turno (FOR UPDATE), después todo lo que el cierre
// congela. Si alguien vuelve a calcular antes del lock, la prueba de base lo ve
// solo cuando la carrera ocurre; esto lo ve siempre.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fuente = readFileSync("app/api/pos-ventas/turnos/cerrar/route.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");
const antes = fuente.slice(0, fuente.indexOf("await prisma.$transaction(async (tx) => {"));
const tx = fuente.slice(fuente.indexOf("await prisma.$transaction(async (tx) => {"));

test("nada de la fotografía se calcula antes de la transacción", () => {
  for (const patron of [/venta\.findMany/, /cajaMovimiento\.findMany/, /calcularEfectivoEsperado\(/, /calcularDiferencia\(/, /new Date\(\)/]) {
    assert.doesNotMatch(antes, patron, `antes del lock: ${patron}`);
  }
});

test("adentro: el turno se toma PRIMERO, con bloquearTurno, y después se calcula y se escribe", () => {
  const pos = (s) => tx.indexOf(s);
  const lock = pos("await bloquearTurno(tx, turnoId);");
  const relee = pos("tx.turno.findUnique(");
  const ahora = pos("const ahora = new Date();");
  const pendientes = pos("contarCobrosOfflinePendientesDelTurno(tx, turnoId)");
  const ventas = pos("tx.venta.findMany(");
  const movimientos = pos("tx.cajaMovimiento.findMany(");
  const calculo = pos("calcularEfectivoEsperado(");
  const diferencia = pos("calcularDiferencia(");
  const cierra = pos("tx.turno.updateMany(");
  const arqueo = pos("tx.arqueoCaja.create(");
  const retiro = pos("tx.cajaMovimiento.create(");
  const todos = { lock, relee, ahora, pendientes, ventas, movimientos, calculo, diferencia, cierra, arqueo, retiro };
  for (const [nombre, p] of Object.entries(todos)) assert.ok(p > 0, `no está: ${nombre}`);
  assert.ok(Object.values(todos).every((p) => p >= lock), "algo va antes del lock");
  assert.ok(lock < relee && relee < ahora && ahora < pendientes, JSON.stringify(todos));
  assert.ok(pendientes < ventas && ventas < calculo && movimientos < calculo && calculo < diferencia && diferencia < cierra, JSON.stringify(todos));
  assert.ok(cierra < arqueo && arqueo < retiro, "el retiro va después del arqueo FINAL");
});

test("el lock es el canónico (FOR UPDATE): choca con la venta, que toma el turno FOR SHARE", () => {
  assert.match(fuente, /import \{ bloquearTurno \} from "@\/lib\/caja\/cierreRelevoServer";/);
  const servidor = readFileSync("lib/caja/cierreRelevoServer.js", "utf8");
  assert.match(servidor, /export async function bloquearTurno\(tx, turnoId\) \{\s*await tx\.\$queryRaw`SELECT id FROM "Turno" WHERE id = \$\{turnoId\} FOR UPDATE`;/);
  assert.doesNotMatch(tx, /compartirTurno\(/, "un lock compartido no frena a la venta");
});

test("la guardia de cobros offline pendientes sigue, y la transacción aguanta lo que dura una venta", () => {
  assert.match(tx, /if \(cobrosPendientes > 0\)/);
  assert.match(fuente, /\}, LIMITES_TRANSACCION_DEL_LOCAL\);/);
});
