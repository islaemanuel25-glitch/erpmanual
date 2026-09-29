// CANDADO: LOS GASTOS, SU ARITMÉTICA Y SUS PUERTAS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/gastos.test.mjs
//
// Lo que pasa contra PostgreSQL —la transacción, el RETIRO, la idempotencia, los
// CHECK— lo ejerce `scripts/pruebas-db/gastos.mjs`. Acá va lo que se afirma sin
// base: la aritmética, el alcance, el permiso, que los nombres de JS sean los
// del schema y de la migración, y que la escritura tenga UNA sola puerta.
//
// Todo lo que lee código lo lee SIN COMENTARIOS (regla 5 de CLAUDE.md).

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  CATEGORIAS_INICIALES,
  ERROR_CONCEPTO_VACIO,
  ERROR_GASTO_PAGADO,
  ERROR_MONTO_MAYOR_AL_SALDO_GASTO,
  MEDIOS_PAGO_GASTO,
  MEDIO_PAGO_GASTO,
  PERMISO_REGISTRAR_GASTOS,
  claveDelPagoInicialDeGasto,
  esMedioPagoGasto,
  gastoEnAlcance,
  leerConcepto,
  leerTextoOpcional,
  motivoDelRetiroDeGasto,
  nuevaClaveDeGasto,
  puedePagarElGasto,
  validarPagoDeGasto,
} from "@/lib/finanzas/gastos";
import { ERROR_MONTO_INVALIDO, ESTADO_CUENTA, MEDIOS_PAGO_PROVEEDOR, estadoDeCuenta } from "@/lib/finanzas/pagosProveedores";
import { MEDIO_EFECTIVO } from "@/lib/finanzas/salidaDelPago";
import { PERMISSION_REGISTRY } from "@/lib/rbac/registry";
import { DEFAULT_PERMISOS_SISTEMA } from "@/lib/rbac/systemRoles";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const sinComentariosSql = (t) => t.replace(/--[^\n]*/g, "");
const MIGRACION = "prisma/migrations/20260929230000_gastos/migration.sql";

// ── EL ESTADO, DERIVADO ─────────────────────────────────────────────────
//
// Un gasto usa `estadoDeCuenta` sin adaptador: `total` y `pagos[].monto` son los
// nombres de `SELECT_GASTO`. Los importes llegan como Prisma los devuelve:
// Decimal serializado a cadena.

test("gasto sin pagos: PENDIENTE, saldo = total", () => {
  const e = estadoDeCuenta({ total: "100000.00", pagos: [] });
  assert.deepEqual(e, { total: 100000, pagado: 0, saldo: 100000, estado: ESTADO_CUENTA.PENDIENTE });
});

test("pago parcial: $100.000 con $40.000 pagados es PARCIAL con $60.000 pendientes", () => {
  const e = estadoDeCuenta({ total: "100000.00", pagos: [{ monto: "40000.00" }] });
  assert.deepEqual(e, { total: 100000, pagado: 40000, saldo: 60000, estado: ESTADO_CUENTA.PARCIAL });
});

test("pago total: saldo 0 y PAGADA, también sumando pagos con centavos", () => {
  const e = estadoDeCuenta({ total: "100000.30", pagos: [{ monto: "40000.10" }, { monto: "60000.20" }] });
  assert.equal(e.saldo, 0);
  assert.equal(e.estado, ESTADO_CUENTA.PAGADA);
});

// ── EL IMPORTE DE UN PAGO ───────────────────────────────────────────────

test("el importe tiene que ser positivo", () => {
  for (const monto of [0, -1, "0", "", null, "abc"]) {
    assert.equal(validarPagoDeGasto({ monto, saldo: 1000 }).error, ERROR_MONTO_INVALIDO, String(monto));
  }
});

test("no se paga más que lo que falta, y un gasto saldado no se paga", () => {
  assert.equal(validarPagoDeGasto({ monto: 60000.01, saldo: 60000 }).error, ERROR_MONTO_MAYOR_AL_SALDO_GASTO);
  assert.equal(validarPagoDeGasto({ monto: 1, saldo: 0 }).error, ERROR_GASTO_PAGADO);
  assert.deepEqual(validarPagoDeGasto({ monto: "60.000", saldo: 60000 }), { centavos: 6000000 });
  assert.deepEqual(validarPagoDeGasto({ monto: 40000, saldo: 100000 }), { centavos: 4000000 });
});

// ── LOS TEXTOS ──────────────────────────────────────────────────────────

test("el concepto es obligatorio y se recorta; los opcionales vacíos son null", () => {
  assert.equal(leerConcepto("   ").error, ERROR_CONCEPTO_VACIO);
  assert.equal(leerConcepto(null).error, ERROR_CONCEPTO_VACIO);
  assert.equal(leerConcepto("  Luz de septiembre ").valor, "Luz de septiembre");
  assert.equal(leerTextoOpcional("   ").valor, null);
  assert.equal(leerTextoOpcional(" EPEC ").valor, "EPEC");
  assert.ok(leerTextoOpcional("x".repeat(500)).error);
});

// ── VER NO ES PAGAR ─────────────────────────────────────────────────────
//
// `alcance` con la forma de `alcanceDePagos`: el depósito ve todo el grupo, un
// admin en vista global no opera ninguna ubicación.

const GASTO_DE_CASIANO = { id: 1, grupoId: 5, localId: 20 };
const alcance = ({ localId, visibles, puedeEscribir }) => ({ grupoId: 5, visibles, vista: { localId }, puedeEscribir });

test("el local ve y paga su gasto, con el permiso", () => {
  const a = alcance({ localId: 20, visibles: [20], puedeEscribir: true });
  assert.equal(gastoEnAlcance(GASTO_DE_CASIANO, a), true);
  assert.equal(puedePagarElGasto(GASTO_DE_CASIANO, a), true);
});

test("el depósito VE el gasto del local y NO lo paga", () => {
  const a = alcance({ localId: 10, visibles: [10, 20], puedeEscribir: true });
  assert.equal(gastoEnAlcance(GASTO_DE_CASIANO, a), true);
  assert.equal(puedePagarElGasto(GASTO_DE_CASIANO, a), false);
});

test("un admin en vista global ve y no paga; sin el permiso, nadie paga", () => {
  assert.equal(puedePagarElGasto(GASTO_DE_CASIANO, alcance({ localId: null, visibles: [10, 20], puedeEscribir: true })), false);
  assert.equal(puedePagarElGasto(GASTO_DE_CASIANO, alcance({ localId: 20, visibles: [20], puedeEscribir: false })), false);
});

test("otro local no ve el gasto, ni otro grupo", () => {
  assert.equal(gastoEnAlcance(GASTO_DE_CASIANO, alcance({ localId: 30, visibles: [30] })), false);
  assert.equal(gastoEnAlcance({ ...GASTO_DE_CASIANO, grupoId: 6 }, alcance({ localId: 20, visibles: [20] })), false);
});

// ── CLAVES Y MOTIVO ─────────────────────────────────────────────────────

test("la clave del pago inicial es una por gasto; la del alta dice de qué ubicación es", () => {
  assert.equal(claveDelPagoInicialDeGasto(12), "gasto-12-pago-inicial");
  assert.match(nuevaClaveDeGasto(20, 1700000000000, "abc"), /^gasto-20-[0-9a-z]+-abc$/);
});

test("el motivo del retiro es para leer, y no se confunde con los reservados", () => {
  const m = motivoDelRetiroDeGasto({ concepto: "Reparación heladera", gastoId: 12 });
  assert.equal(m, "Pago de gasto: Reparación heladera (gasto #12)");
  assert.doesNotMatch(m, /^Retiro de (recaudación|cierre)/i);
});

// ── LOS NOMBRES: JS, SCHEMA Y MIGRACIÓN DICEN LO MISMO ──────────────────

test("los medios de JS son los del enum MedioPagoGasto del schema", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const bloque = /enum MedioPagoGasto \{([\s\S]*?)\}/.exec(schema);
  assert.ok(bloque, "falta el enum MedioPagoGasto");
  const valores = bloque[1].split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
  assert.deepEqual(valores, [...MEDIOS_PAGO_GASTO]);
  assert.equal(esMedioPagoGasto("FIADO"), false);
});

test("el efectivo se escribe igual en los dos pagos: es lo que decide si se toca la caja", () => {
  assert.equal(MEDIO_PAGO_GASTO.EFECTIVO, MEDIO_EFECTIVO);
  assert.ok(MEDIOS_PAGO_PROVEEDOR.includes(MEDIO_EFECTIVO));
});

test("las categorías iniciales son las que escribe la migración, en ese orden", () => {
  const sql = sinComentariosSql(readFileSync(MIGRACION, "utf8"));
  const insert = /INSERT INTO "CategoriaGasto"[\s\S]*?VALUES([\s\S]*?);/.exec(sql);
  assert.ok(insert, "la migración no siembra las categorías");
  const nombres = [...insert[1].matchAll(/\('([^']+)',\s*(\d+)/g)];
  assert.deepEqual(nombres.map((n) => n[1]), [...CATEGORIAS_INICIALES]);
  const ordenes = nombres.map((n) => Number(n[2]));
  assert.deepEqual([...ordenes].sort((a, b) => a - b), ordenes, "el orden de la migración no es creciente");
});

test("la migración trae los CHECK de la base, como PagoProveedor", () => {
  const sql = sinComentariosSql(readFileSync(MIGRACION, "utf8"));
  for (const nombre of ["Gasto_total_positivo", "Gasto_concepto_no_vacio", "PagoGasto_monto_positivo", "PagoGasto_efectivo_con_caja"]) {
    assert.match(sql, new RegExp(`ADD CONSTRAINT "${nombre}" CHECK`), nombre);
  }
  assert.match(sql, /CREATE UNIQUE INDEX "PagoGasto_cajaMovimientoId_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX "PagoGasto_gastoId_idempotencyKey_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX "Gasto_localId_idempotencyKey_key"/);
  // Aditiva: no reescribe nada existente ni convierte retiros en gastos. Se
  // miran SENTENCIAS: el "ON DELETE RESTRICT ON UPDATE CASCADE" de una clave
  // foránea no es un DELETE ni un UPDATE.
  assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE|TRUNCATE)\b/im);
  assert.doesNotMatch(sql, /\b(DROP|RENAME)\b/i);
  assert.doesNotMatch(sql, /FROM\s+"CajaMovimiento"/i);
});

test("la base no deja que un movimiento de caja sea de un pago a proveedor Y de un pago de gasto", () => {
  const sql = sinComentariosSql(readFileSync(MIGRACION, "utf8"));
  // El árbitro es un índice único —la clave primaria es el movimiento—, no un
  // chequeo que mire la otra tabla: un chequeo no alcanza con concurrencia.
  assert.match(sql, /CONSTRAINT "CajaMovimientoDePago_pkey" PRIMARY KEY \("cajaMovimientoId"\)/);
  assert.match(sql, /"CajaMovimientoDePago_un_solo_pago" CHECK \(num_nonnulls\("pagoProveedorId", "pagoGastoId"\) = 1\)/);
  // Lo llenan los DOS pagos, al insertarse, y ninguno puede mudarse de movimiento.
  for (const tabla of ["PagoProveedor", "PagoGasto"]) {
    assert.match(sql, new RegExp(`CREATE TRIGGER "${tabla}_movimiento_exclusivo" AFTER INSERT ON "${tabla}"\\s+FOR EACH ROW EXECUTE FUNCTION "caja_movimiento_de_un_solo_pago"\\(\\)`), tabla);
    assert.match(sql, new RegExp(`CREATE TRIGGER "${tabla}_movimiento_fijo" BEFORE UPDATE OF "cajaMovimientoId" ON "${tabla}"`), tabla);
  }
  // Y los pagos a proveedores en efectivo que ya existían entran, DESPUÉS de los
  // triggers para no dejar un hueco mientras corre la migración.
  const copia = sql.search(/INSERT INTO "CajaMovimientoDePago" \("cajaMovimientoId", "pagoProveedorId"\)\s+SELECT "cajaMovimientoId", "id" FROM "PagoProveedor" WHERE "cajaMovimientoId" IS NOT NULL/);
  assert.ok(copia > 0, "falta la copia de los pagos a proveedores existentes");
  assert.ok(copia > sql.indexOf('CREATE TRIGGER "PagoProveedor_movimiento_exclusivo"'), "la copia va antes del trigger");
});

test("nadie escribe la tabla de dueños de un movimiento: la llena la base", () => {
  const escriben = archivosDelRepo().filter((p) =>
    /\bcajaMovimientoDePago\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|"CajaMovimientoDePago"/.test(sinComentarios(readFileSync(p, "utf8")))
  );
  assert.deepEqual(escriben, []);
});

// ── EL PERMISO ──────────────────────────────────────────────────────────

test("el permiso de escribir gastos está en el registro, en el grupo finanzas", () => {
  assert.equal(PERMISO_REGISTRAR_GASTOS, "finanzas.gastos.registrar");
  const p = PERMISSION_REGISTRY.find((x) => x.code === PERMISO_REGISTRAR_GASTOS);
  assert.ok(p, "falta en lib/rbac/registry.js");
  assert.equal(p.group, "finanzas");
  assert.equal(p.deprecated, false);
});

test("el permiso de escribir gastos NO viene con ningún rol de sistema", () => {
  const roles = Object.entries(DEFAULT_PERMISOS_SISTEMA);
  assert.ok(roles.length >= 3, `la matriz trajo ${roles.length} roles`);
  assert.deepEqual(roles.filter(([, permisos]) => permisos.includes(PERMISO_REGISTRAR_GASTOS)), []);
});

test("la capa que escribe chequea los dos permisos, ver y registrar", () => {
  const fuente = sinComentarios(readFileSync("lib/finanzas/gastosServer.js", "utf8"));
  assert.match(fuente, /\[PERMISO_VER_FINANZAS, PERMISO_REGISTRAR_GASTOS\]/);
  // Y las dos puertas lo llaman antes que nada.
  for (const puerta of ["registrarPagoGasto", "crearGasto"]) {
    const cuerpo = fuente.slice(fuente.indexOf(`export async function ${puerta}`));
    assert.match(cuerpo.split("\n").slice(1, 3).join("\n"), /exigirPermisoDeEscribir\(args\.session\)/, puerta);
  }
});

// ── UNA SOLA PUERTA ─────────────────────────────────────────────────────

const archivosDelRepo = () =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "app", "lib", "components"], { encoding: "utf8" })
    .split("\n")
    .filter((p) => /\.(js|jsx|mjs)$/.test(p) && !p.endsWith(".test.mjs"));

test("nadie fuera de gastosServer.js escribe un gasto o un pago de gasto", () => {
  const archivos = archivosDelRepo();
  assert.ok(archivos.length > 100, "la enumeración vino vacía");
  const escriben = archivos.filter((p) => {
    if (p === "lib/finanzas/gastosServer.js") return false;
    return /\b(gasto|pagoGasto)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(
      sinComentarios(readFileSync(p, "utf8"))
    );
  });
  assert.deepEqual(escriben, []);
});

test("el efectivo de los dos pagos sale del cajón por la misma pieza, salidaDelPago.js", () => {
  for (const archivo of ["lib/finanzas/pagosProveedoresServer.js", "lib/finanzas/gastosServer.js"]) {
    const fuente = sinComentarios(readFileSync(archivo, "utf8"));
    assert.doesNotMatch(fuente, /cajaMovimiento\.create\(/, `${archivo} crea su propio RETIRO`);
    assert.match(fuente, /resolverSalidaDelPago\(tx,/, `${archivo} no usa la salida compartida`);
  }
});
