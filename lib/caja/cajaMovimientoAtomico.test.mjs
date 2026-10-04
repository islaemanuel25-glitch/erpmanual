// CAJA +/− VALIDA Y ESCRIBE CON EL TURNO TOMADO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/cajaMovimientoAtomico.test.mjs
//
// El comportamiento lo ejerce scripts/pruebas-db/cajaMovimientoAtomico.mjs con
// las carreras forzadas contra PostgreSQL. Acá se fija la FORMA dentro de
// `caja-movimientos/crear`: el movimiento se inserta adentro de una transacción
// que primero toma el turno (FOR UPDATE) y lo vuelve a validar. Si alguien
// vuelve a validar solo afuera o a insertar afuera, la prueba de base lo ve
// solo cuando la carrera ocurre; esto lo ve siempre.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fuente = readFileSync("app/api/pos-ventas/caja-movimientos/crear/route.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");
const APERTURA = "await prisma.$transaction(async (tx) => {";
const iTx = fuente.indexOf(APERTURA);
const tx = fuente.slice(iTx, fuente.indexOf("}, LIMITES_TRANSACCION_DEL_LOCAL);", iTx));

test("hay UNA transacción y el movimiento se inserta adentro, nunca afuera", () => {
  assert.ok(iTx > 0, "no hay transacción");
  assert.equal(fuente.split(APERTURA).length - 1, 1);
  assert.doesNotMatch(fuente, /prisma\.cajaMovimiento\.create\(/, "un insert con el cliente de afuera escapa del lock");
  assert.match(tx, /tx\.cajaMovimiento\.create\(/);
});

test("adentro: el turno se toma PRIMERO, se relee, se valida y recién entonces se escribe", () => {
  const pos = (s) => tx.indexOf(s);
  const lock = pos("await bloquearTurno(tx, turnoId);");
  const relee = pos("tx.turno.findUnique(");
  const valida = pos("rechazoDelTurno(vigente,");
  const rechaza = pos("if (rechazoVigente) return");
  const escribe = pos("tx.cajaMovimiento.create(");
  const todos = { lock, relee, valida, rechaza, escribe };
  for (const [nombre, p] of Object.entries(todos)) assert.ok(p > 0, `no está: ${nombre}`);
  assert.ok(lock < relee && relee < valida && valida < rechaza && rechaza < escribe, JSON.stringify(todos));
});

test("la validación de adentro es la MISMA regla que la de afuera, y mira corte y cierre", () => {
  const regla = fuente.slice(fuente.indexOf("function rechazoDelTurno("), fuente.indexOf("export async function POST"));
  assert.match(regla, /turno\.cierre !== null/, "sin el chequeo de cierre, entra después de turnos/cerrar");
  assert.match(regla, /turno\.cierreEnPreparacionEn !== null/, "sin el chequeo de corte, entra después de cierres/iniciar");
  assert.match(regla, /puedeActuarSobreCaja\(turno, identidad\)/);
  assert.match(tx, /select: SELECT_TURNO/);
});

test("el lock es el canónico (FOR UPDATE) y los límites aguantan esperar a un cierre", () => {
  assert.match(fuente, /import \{ bloquearTurno \} from "@\/lib\/caja\/cierreRelevoServer";/);
  const servidor = readFileSync("lib/caja/cierreRelevoServer.js", "utf8");
  assert.match(servidor, /export async function bloquearTurno\(tx, turnoId\) \{\s*await tx\.\$queryRaw`SELECT id FROM "Turno" WHERE id = \$\{turnoId\} FOR UPDATE`;/);
  assert.doesNotMatch(tx, /compartirTurno\(/, "quien mueve plata del cajón usa bloquearTurno, como salidaDelPago y los retiros");
  assert.match(fuente, /\}, LIMITES_TRANSACCION_DEL_LOCAL\);/);
});
