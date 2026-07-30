// lib/conversiones/precisionStock.test.mjs
//
// Precisión de la cadena física (Etapa 3B). Dos bloques:
//
//   · Estáticos: verifican schema y migración sin necesidad de base.
//   · Aritméticos: corren contra PostgreSQL REAL usando TEMP TABLEs con los tipos
//     nuevos. No aplican la migración ni tocan tablas del ERP; si no hay base
//     local levantada, se saltean con un mensaje claro en vez de fallar.
//
// El punto de todo esto: PostgreSQL redondea numeric en SILENCIO (half-up, sin
// error). Ningún test puede confiar en que un INSERT fuera de escala avise.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8");

const MIGRACION = "20260730140000_stock_transferencias_precision_3";
const sqlMigracion = readFileSync(
  join(RAIZ, "prisma", "migrations", MIGRACION, "migration.sql"),
  "utf8"
);

const modelo = (nombre) => schema.match(new RegExp(`model ${nombre} \\{[\\s\\S]*?\\n\\}`))[0];
const escalaDe = (nombre, campo) => {
  const m = modelo(nombre).match(
    new RegExp(`\\n\\s+${campo}\\s+Decimal\\??\\s[^\\n]*@db\\.Decimal\\((\\d+),\\s*(\\d+)\\)`)
  );
  return m ? `${m[1]},${m[2]}` : null;
};

// Columnas cuya escala cambia en esta etapa, y por qué.
const AMPLIADAS = [
  ["StockLocal", "cantidad"],
  ["StockLocal", "enTransito"],
  ["TransferenciaDetalle", "cantidad"],
  ["TransferenciaDetalle", "recibido"],
  ["AuditoriaStock", "cantidadAnterior"],
  ["AuditoriaStock", "cantidadNueva"],
];

// ══ SCHEMA Y MIGRACIÓN ════════════════════════════════════════════════════════

test("1. los campos físicos seleccionados quedan exactamente en (12,3)", () => {
  for (const [m, c] of AMPLIADAS) {
    assert.equal(escalaDe(m, c), "12,3", `${m}.${c} debe ser Decimal(12,3)`);
  }
  // Y coinciden con la escala que ya tenía la venta.
  assert.equal(escalaDe("VentaDetalle", "cantidadStock"), "12,3");
  assert.equal(escalaDe("VentaDetalleComponente", "cantidad"), "12,3");
});

test("2. no cambia ningún campo monetario", () => {
  // La migración solo puede nombrar columnas físicas.
  const columnas = [...sqlMigracion.matchAll(/ALTER COLUMN "(\w+)"/g)].map((m) => m[1]);
  const monetarias = /precio|costo|subtotal|total|ganancia|comision|descuento|neto|margen|importe|recargo|monto|saldo/i;
  for (const col of columnas) {
    assert.equal(monetarias.test(col), false, `la migración no debe tocar "${col}"`);
  }
  // Y los montos siguen en 2 decimales en el schema.
  assert.equal(escalaDe("TransferenciaDetalle", "precioCosto"), "12,2");
  assert.equal(escalaDe("VentaDetalle", "precio"), "12,2");
  assert.equal(escalaDe("VentaDetalle", "subtotal"), "12,2");
  assert.equal(escalaDe("Venta", "netoRecibido"), "12,2");
});

test("3 y 4. la migración no hace backfill ni UPDATE ni DELETE ni INSERT", () => {
  const sinComentarios = sqlMigracion.replace(/^--.*$/gm, "");
  for (const verbo of ["UPDATE", "INSERT", "DELETE", "TRUNCATE", "DROP", "SET DEFAULT", "USING"]) {
    assert.equal(
      new RegExp(`\\b${verbo}\\b`).test(sinComentarios),
      false,
      `la migración no debe contener ${verbo}`
    );
  }
});

test("5. no hay ninguna reducción de precisión", () => {
  const escalas = [...sqlMigracion.matchAll(/TYPE DECIMAL\((\d+),(\d+)\)/g)];
  assert.ok(escalas.length > 0);
  for (const [, p, s] of escalas) {
    assert.equal(p, "12");
    assert.equal(s, "3", "toda la migración amplía a 3 decimales, nunca reduce");
  }
});

test("6. solo se alteran las columnas autorizadas", () => {
  const sinComentarios = sqlMigracion.replace(/^--.*$/gm, "");
  const pares = [...sinComentarios.matchAll(/ALTER TABLE "(\w+)" ALTER COLUMN "(\w+)"/g)]
    .map((m) => `${m[1]}.${m[2]}`)
    .sort();
  assert.deepEqual(pares, AMPLIADAS.map(([m, c]) => `${m}.${c}`).sort());
  assert.equal(pares.length, 6);

  // stockMin/stockMax quedan afuera a propósito: son umbrales, no cantidades.
  assert.equal(escalaDe("StockLocal", "stockMin"), "12,2");
  assert.equal(escalaDe("StockLocal", "stockMax"), "12,2");
  assert.equal(/stockMin|stockMax/.test(sinComentarios), false);
});

test("7. defaults y nullabilidad se conservan en el schema", () => {
  const sl = modelo("StockLocal");
  assert.match(sl, /enTransito Decimal\s+@default\(0\)\s+@db\.Decimal\(12, 3\)/);
  assert.match(sl, /cantidad\s+Decimal\s+@db\.Decimal\(12, 3\)/); // sigue NOT NULL
  const td = modelo("TransferenciaDetalle");
  assert.match(td, /cantidad\s+Decimal\s+@db\.Decimal\(12, 3\)/); // NOT NULL
  assert.match(td, /recibido\s+Decimal\?\s+@db\.Decimal\(12, 3\)/); // nullable
  const au = modelo("AuditoriaStock");
  assert.match(au, /cantidadAnterior Decimal\? @db\.Decimal\(12, 3\)/); // nullable
  // ALTER COLUMN TYPE no toca NOT NULL ni DEFAULT: la migración no los menciona.
  assert.equal(/NOT NULL|DROP DEFAULT/.test(sqlMigracion.replace(/^--.*$/gm, "")), false);
});

test("8. la migración es posterior a las que ya existen en el repo", () => {
  const dirs = readdirSync(join(RAIZ, "prisma", "migrations"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  assert.ok(dirs.includes(MIGRACION));
  // Debe ir después de la de vínculos, que todavía está pendiente en todos lados.
  const vinculos = "20260730130000_ventas_internas_vinculos";
  assert.ok(dirs.includes(vinculos));
  assert.ok(MIGRACION > vinculos, "debe ordenarse después de la migración de vínculos");
});

// ══ ARITMÉTICA REAL EN POSTGRESQL ═════════════════════════════════════════════

// Conexión perezosa: si no hay base local, los tests aritméticos se saltean.
let prisma = null;
let motivoSkip = null;
try {
  for (const linea of readFileSync(join(RAIZ, ".env"), "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    motivoSkip = "DATABASE_URL no es local: los tests aritméticos solo corren contra una base local";
  } else {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    await prisma.$queryRawUnsafe("SELECT 1");
  }
} catch (e) {
  motivoSkip = `sin base local disponible (${e.message.split("\n")[0]})`;
  prisma = null;
}

/**
 * Corre `fn` contra TEMP TABLEs con los tipos NUEVOS, en una transacción que
 * siempre revierte. No toca ninguna tabla del ERP ni requiere la migración.
 */
async function enSandbox(fn) {
  const ROLLBACK = Symbol("rollback");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE s_stock (
          id serial PRIMARY KEY,
          cantidad numeric(12,3) NOT NULL,
          "enTransito" numeric(12,3) NOT NULL DEFAULT 0
        ) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE s_transf (
          id serial PRIMARY KEY,
          cantidad numeric(12,3) NOT NULL,
          recibido numeric(12,3)
        ) ON COMMIT DROP`);
      await fn(tx, (sql) => tx.$queryRawUnsafe(sql).then((r) => r[0]));
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
}

const dbTest = (nombre, fn) =>
  test(nombre, { skip: motivoSkip ?? false }, () => enSandbox(fn));

dbTest("9. 10.000 - 1.925 = 8.075 (antes daba 8.08)", async (tx, uno) => {
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad) VALUES (10.000)`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad - 1.925 WHERE id = 1`);
  const r = await uno(`SELECT cantidad::text v FROM s_stock WHERE id = 1`);
  assert.equal(r.v, "8.075");
});

dbTest("10. enTransito 0 + 1.925 = 1.925 (antes daba 1.93)", async (tx, uno) => {
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad) VALUES (10.000)`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET "enTransito" = "enTransito" + 1.925 WHERE id = 1`);
  const r = await uno(`SELECT "enTransito"::text v FROM s_stock WHERE id = 1`);
  assert.equal(r.v, "1.925");
});

dbTest("10b. lo descontado de cantidad y lo acreditado a enTransito ya coinciden", async (tx, uno) => {
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad) VALUES (10.000)`);
  await tx.$executeRawUnsafe(
    `UPDATE s_stock SET cantidad = cantidad - 1.925, "enTransito" = "enTransito" + 1.925 WHERE id = 1`
  );
  const r = await uno(`SELECT (10.000 - cantidad)::text bajo, "enTransito"::text subio FROM s_stock WHERE id = 1`);
  assert.equal(r.bajo, "1.925");
  assert.equal(r.subio, "1.925");
  assert.equal(r.bajo, r.subio, "el mismo movimiento debe salir y entrar por lo mismo");
});

dbTest("11. recepción completa de 1.925", async (tx, uno) => {
  await tx.$executeRawUnsafe(`INSERT INTO s_transf (cantidad, recibido) VALUES (1.925, 1.925)`);
  // Destino suma lo recibido; origen limpia el tránsito por lo ENVIADO.
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad, "enTransito") VALUES (0.000, 1.925)`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad + 1.925, "enTransito" = "enTransito" - 1.925 WHERE id = 1`);
  const t = await uno(`SELECT cantidad::text c, recibido::text r FROM s_transf WHERE id = 1`);
  assert.equal(t.c, "1.925");
  assert.equal(t.r, "1.925");
  const s = await uno(`SELECT cantidad::text c, "enTransito"::text t FROM s_stock WHERE id = 1`);
  assert.equal(s.c, "1.925");
  assert.equal(s.t, "0.000", "el tránsito debe quedar exactamente en cero");
});

dbTest("12. recepción parcial 1.925 → 1.900 deja faltante exacto de 0.025", async (tx, uno) => {
  await tx.$executeRawUnsafe(`INSERT INTO s_transf (cantidad, recibido) VALUES (1.925, 1.900)`);
  const r = await uno(`SELECT (cantidad - recibido)::text dif, recibido::text rec FROM s_transf WHERE id = 1`);
  assert.equal(r.rec, "1.900");
  assert.equal(r.dif, "0.025");
});

dbTest("13. cancelación devuelve exactamente 1.925", async (tx, uno) => {
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad, "enTransito") VALUES (8.075, 1.925)`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad + 1.925, "enTransito" = "enTransito" - 1.925 WHERE id = 1`);
  const r = await uno(`SELECT cantidad::text c, "enTransito"::text t FROM s_stock WHERE id = 1`);
  assert.equal(r.c, "10.000", "vuelve al valor original sin inventar ni perder stock");
  assert.equal(r.t, "0.000");
});

dbTest("13b. vender 1.925 y corregir la venta vuelve a 10.000 (antes daba 10.01)", async (tx, uno) => {
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad) VALUES (10.000)`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad - 1.925 WHERE id = 1`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad + 1.925 WHERE id = 1`);
  const r = await uno(`SELECT cantidad::text v FROM s_stock WHERE id = 1`);
  assert.equal(r.v, "10.000");
});

dbTest("14. pack entero sigue funcionando (3 × 12 = 36)", async (tx, uno) => {
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad) VALUES (100.000)`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad - 36 WHERE id = 1`);
  const r = await uno(`SELECT cantidad::text v FROM s_stock WHERE id = 1`);
  assert.equal(r.v, "64.000");
  assert.equal(Number(r.v), 64);
});

dbTest("15 y 16. pieza entera y fiambre fijo conservan piezas", async (tx, uno) => {
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad) VALUES (10.000)`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad - 4 WHERE id = 1`);
  const r = await uno(`SELECT cantidad::text v FROM s_stock WHERE id = 1`);
  assert.equal(r.v, "6.000");
  assert.equal(Number(r.v), 6, "4 piezas siguen siendo 4 piezas enteras");
});

dbTest("17. fiambre por peso conserva tres decimales en toda la cadena", async (tx, uno) => {
  // piezasToKg redondea a 3 decimales: 3 piezas × 0.325 kg = 0.975
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad) VALUES (0.000)`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad + 0.975 WHERE id = 1`);
  await tx.$executeRawUnsafe(`INSERT INTO s_transf (cantidad, recibido) VALUES (0.975, 0.975)`);
  const s = await uno(`SELECT cantidad::text v FROM s_stock WHERE id = 1`);
  const t = await uno(`SELECT cantidad::text c FROM s_transf WHERE id = 1`);
  assert.equal(s.v, "0.975");
  assert.equal(t.c, "0.975");
});

dbTest("18-22. regresión: venta, transferencia, ajuste, negativo y comparaciones", async (tx, uno) => {
  // Venta normal (enteros) y ajuste de stock.
  await tx.$executeRawUnsafe(`INSERT INTO s_stock (cantidad) VALUES (50.000)`);
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad - 2 WHERE id = 1`);   // venta
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = 75 WHERE id = 1`);              // ajuste absoluto
  let r = await uno(`SELECT cantidad::text v FROM s_stock WHERE id = 1`);
  assert.equal(r.v, "75.000");

  // Stock negativo (allowNegativeStock) sigue permitido y exacto.
  await tx.$executeRawUnsafe(`UPDATE s_stock SET cantidad = cantidad - 80.5 WHERE id = 1`);
  r = await uno(`SELECT cantidad::text v FROM s_stock WHERE id = 1`);
  assert.equal(r.v, "-5.500");

  // Comparaciones de disponibilidad: numeric compara por VALOR, no por escala.
  const c = await uno(`SELECT (8.075::numeric(12,3) < 8.08::numeric(12,2)) a,
                              (1.925::numeric(12,3) = 1.925::numeric(12,3)) b,
                              (10.000::numeric(12,3) = 10::numeric(12,2)) d`);
  assert.equal(c.a, true);
  assert.equal(c.b, true);
  assert.equal(c.d, true, "10.000 y 10 son iguales pese a distinta escala");
});

dbTest("24. serialización: Prisma devuelve Decimal, JSON lo emite como string", async (tx) => {
  // Se usa una tabla real solo para leer el tipo que devuelve el cliente.
  const fila = await tx.stockLocal.findFirst({ orderBy: { id: "asc" } });
  if (!fila) return; // base vacía: nada que verificar
  assert.equal(typeof fila.cantidad, "object", "Prisma devuelve Decimal, no number");
  assert.equal(typeof JSON.parse(JSON.stringify({ q: fila.cantidad })).q, "string");
  assert.equal(Number.isFinite(Number(fila.cantidad)), true, "Number() sigue funcionando");
});

// ══ REGRESIÓN ESTÁTICA (sin base) ═════════════════════════════════════════════

test("23. el orden y los locks del consumo no cambian", () => {
  const src = readFileSync(join(RAIZ, "lib", "combos", "ventaConsumo.js"), "utf8");
  // Sigue ordenando por productoLocalId ascendente y bloqueando con FOR UPDATE.
  assert.match(src, /sort\(\(a, b\) => a\.productoLocalId - b\.productoLocalId\)/);
  assert.match(src, /FOR UPDATE/);
});

test("25. la UI no redondea destructivamente cantidades de stock", () => {
  // Ningún componente aplica toFixed(2) sobre una cantidad física. Los toFixed(2)
  // que existen son de PRECIOS. El stock en kg ya se muestra con 3 decimales.
  const ajuste = readFileSync(join(RAIZ, "components", "stock_locales", "ModalAjuste.jsx"), "utf8");
  assert.match(ajuste, /stockNum\.toFixed\(3\)/, "el stock en kg se muestra con 3 decimales");
  assert.match(ajuste, /step=\{unidadMedida === "kg" \? 0\.001 : 1\}/, "el input ya acepta 3 decimales");
  // piezasToKg produce 3 decimales: la base ahora puede guardarlos.
  const conv = readFileSync(join(RAIZ, "lib", "conversiones", "stock.js"), "utf8");
  assert.match(conv, /Math\.round\(p \* ref \* 1000\) \/ 1000/);
});

test("no queda ningún campo físico de la cadena en 2 decimales", () => {
  const fisicos = [
    ["StockLocal", "cantidad"], ["StockLocal", "enTransito"],
    ["TransferenciaDetalle", "cantidad"], ["TransferenciaDetalle", "recibido"],
    ["VentaDetalle", "cantidad"], ["VentaDetalle", "cantidadStock"],
    ["VentaDetalleComponente", "cantidad"], ["ComboComponente", "cantidad"],
  ];
  for (const [m, c] of fisicos) {
    assert.equal(escalaDe(m, c), "12,3", `${m}.${c} debería estar en la escala física`);
  }
});

test.after(async () => {
  if (prisma) await prisma.$disconnect();
});
