// UNA VENTA SE ESCRIBE SOLO CON SU TURNO TOMADO Y TODAVÍA OPERATIVO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/ventaDentroDelCorte.test.mjs
//
// El comportamiento lo ejerce scripts/pruebas-db/carreraVentaCorte.mjs con las
// carreras forzadas contra PostgreSQL. Acá se fija lo que esa prueba no puede
// ver: el ORDEN de los locks dentro de `crear`, del que depende que no haya
// ciclo con quien corta, cierra o retira (que toman el turno y nada más).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const crear = sinComentarios("app/api/pos-ventas/crear/route.js");
const servidor = sinComentarios("lib/caja/cierreRelevoServer.js");

test("el turno se toma FOR SHARE: choca con el corte y con el cierre directo, no con otra venta", () => {
  assert.match(servidor, /export async function compartirTurno\(tx, turnoId\) \{\s*await tx\.\$queryRaw`SELECT id FROM "Turno" WHERE id = \$\{turnoId\} FOR SHARE`;/);
});

test("adentro de la transacción: candado del local → turno → relectura → cobro offline → venta", () => {
  const tx = crear.slice(crear.indexOf("const txResult = await prisma.$transaction(async (tx) => {"));
  const pos = (s) => tx.indexOf(s);
  const candado = pos("await tomarCandadoDelLocal(tx, localId);");
  const turno = pos("await compartirTurno(tx, turnoId);");
  const relee = pos("const sigueOperativo = await tx.turno.findFirst({");
  const rechaza = pos("if (!sigueOperativo) throw new ErrorTurnoNoOperativo();");
  const cobro = pos("await verificarCobroOfflineNoDescartado(tx, txnId);");
  const venta = pos("tx.venta.create(");
  for (const [nombre, p] of Object.entries({ candado, turno, relee, rechaza, cobro, venta })) {
    assert.ok(p > 0, `no está: ${nombre}`);
  }
  assert.ok(candado < turno && turno < relee && relee < rechaza && rechaza < cobro && cobro < venta,
    JSON.stringify({ candado, turno, relee, rechaza, cobro, venta }));
});

test("la relectura usa EL MISMO predicado que la validación previa", () => {
  const tx = crear.slice(crear.indexOf("const sigueOperativo = await tx.turno.findFirst({"));
  const where = tx.slice(0, tx.indexOf("select:"));
  for (const parte of ["id: turnoId", "localId", "...whereCajaPropia({ usuarioId: session.id, operadorId })", "...WHERE_TURNO_OPERATIVO"]) {
    assert.ok(where.includes(parte), `falta ${parte}`);
  }
});

test("el rechazo de adentro responde igual que el de afuera: misma función, mismo código", () => {
  assert.equal(crear.split("responderTurnoNoOperativo(").length - 1, 3, "definición + validación previa + catch");
  assert.match(crear, /if \(err\.esTurnoNoOperativo && intentoTurno\) \{\s*return responderTurnoNoOperativo\(intentoTurno\);/);
});
