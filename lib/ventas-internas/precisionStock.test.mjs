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

// ── LA MIGRACIÓN QUE ESTOS CANDADOS MIRABAN YA NO EXISTE COMO ARCHIVO ───────
//
// Miraban `20260730140000_stock_transferencias_precision_3`, que ampliaba seis
// columnas de la cadena física a tres decimales. El 2026-09-04 el historial se
// saneó: las 105 migraciones se reemplazaron por la baseline, porque ninguna
// creaba `Venta` y el historial no podía reproducir una base vacía.
//
// Lo que aquellos candados protegían tenía dos mitades. Una era la ESCALA de las
// columnas —que la cadena física quede en tres decimales y la plata en dos—, y
// esa sigue viva: se afirma contra `schema.prisma` y contra la baseline, que es
// lo que hoy construye la base.
//
// La otra eran las salvaguardas de una operación IRREPETIBLE: que aquel ALTER no
// hiciera backfill, que no redujera precisión sobre datos existentes, y las
// consultas de verificación previas al despliegue. Esa migración ya corrió en
// producción hace un mes y no va a volver a correr. Sus candados no se
// "aflojaron": se quedaron sin sujeto, y decirlo es más honesto que dejarlos
// mirando un archivo vacío.
const BASELINE = join(RAIZ, "prisma", "migrations", "000000000000_squashed_migrations", "migration.sql");
const sqlBaseline = readFileSync(BASELINE, "utf8");

const modelo = (nombre) => schema.match(new RegExp(`model ${nombre} \\{[\\s\\S]*?\\n\\}`))[0];
const escalaDe = (nombre, campo) => {
  const m = modelo(nombre).match(
    new RegExp(`\\n\\s+${campo}\\s+Decimal\\??\\s[^\\n]*@db\\.Decimal\\((\\d+),\\s*(\\d+)\\)`)
  );
  return m ? `${m[1]},${m[2]}` : null;
};

// Columnas OPERATIVAS: el rango real de trabajo del inventario.
const OPERATIVAS = [
  ["StockLocal", "cantidad"],
  ["StockLocal", "enTransito"],
  ["TransferenciaDetalle", "cantidad"],
  ["TransferenciaDetalle", "recibido"],
];

// Columnas HISTÓRICAS: misma ESCALA (3 decimales) pero mayor PRECISIÓN. La
// auditoría no se reescribe, y producción tiene una fila de 9.999.999.999 que no
// entra en (12,3). Ampliar solo la precisión la conserva intacta.
const HISTORICAS = [
  ["AuditoriaStock", "cantidadAnterior"],
  ["AuditoriaStock", "cantidadNueva"],
];

const AMPLIADAS = [...OPERATIVAS, ...HISTORICAS];

// Máximos representables. numeric(p,s) admite p−s dígitos enteros.
const MAX_12_3 = 1000000000;    // (12,3) → 9 enteros → < 1.000.000.000
const MAX_14_3 = 100000000000;  // (14,3) → 11 enteros → < 100.000.000.000

// ══ SCHEMA Y MIGRACIÓN ════════════════════════════════════════════════════════

test("1. las cuatro columnas operativas quedan exactamente en (12,3)", () => {
  for (const [m, c] of OPERATIVAS) {
    assert.equal(escalaDe(m, c), "12,3", `${m}.${c} debe ser Decimal(12,3)`);
  }
  // Y coinciden con la escala que ya tenía la venta.
  assert.equal(escalaDe("VentaDetalle", "cantidadStock"), "12,3");
  assert.equal(escalaDe("VentaDetalleComponente", "cantidad"), "12,3");
});

test("2b. las dos columnas históricas quedan en (14,3): misma escala, más rango", () => {
  for (const [m, c] of HISTORICAS) {
    assert.equal(escalaDe(m, c), "14,3", `${m}.${c} debe ser Decimal(14,3)`);
  }
  // La ESCALA es la misma que la de su origen: la auditoría no pierde decimales.
  assert.equal(escalaDe("AuditoriaStock", "cantidadNueva").split(",")[1],
    escalaDe("StockLocal", "cantidad").split(",")[1]);
  // Pero StockLocal NO se amplía: ahí (12,3) es el rango operativo correcto.
  assert.equal(escalaDe("StockLocal", "cantidad"), "12,3");
  // Y los umbrales espejo siguen copiando stockMin/stockMax en (12,2).
  assert.equal(escalaDe("AuditoriaStock", "stockMinAnterior"), "12,2");
  assert.equal(escalaDe("AuditoriaStock", "stockMaxNuevo"), "12,2");
});

test("2. la plata sigue en dos decimales", () => {
  // Antes se comprobaba que aquel ALTER no nombrara ninguna columna monetaria.
  // Hoy la afirmación equivalente y más fuerte es sobre el resultado: los montos
  // están en (12,2) y las cantidades físicas en tres decimales. Mezclarlos es lo
  // que se quería impedir, y así se impide en el estado, no en un paso.
  assert.equal(escalaDe("TransferenciaDetalle", "precioCosto"), "12,2");
  assert.equal(escalaDe("VentaDetalle", "precio"), "12,2");
  assert.equal(escalaDe("VentaDetalle", "subtotal"), "12,2");
  assert.equal(escalaDe("Venta", "netoRecibido"), "12,2");
});

test("3 y 4. LA BASELINE no hace backfill ni UPDATE ni DELETE ni INSERT", () => {
  // Este candado GANA con el saneamiento: antes cubría una migración, ahora
  // cubre el único archivo que construye la base. Una migración de datos colada
  // en la baseline correría en CADA instalación nueva.
  const sinComentarios = sqlBaseline.replace(/^--.*$/gm, "");
  // Los patrones son a nivel SENTENCIA y no palabra suelta: `\bUPDATE\b` matchea
  // las 123 apariciones de "ON UPDATE CASCADE", que es justo lo que sí queremos
  // que haya. Un candado que se dispara con la forma correcta no informa nada.
  for (const [nombre, patron] of [
    ["UPDATE", /UPDATE\s+"/],
    ["INSERT INTO", /INSERT\s+INTO/],
    ["DELETE FROM", /DELETE\s+FROM/],
    ["TRUNCATE", /\bTRUNCATE\b/],
  ]) {
    assert.equal(
      patron.test(sinComentarios),
      false,
      `la baseline no debe contener ${nombre}: es estructura, no datos`
    );
  }
});

test("5. la baseline crea las seis columnas físicas con su precisión", () => {
  // La misma afirmación que hacía el candado del ALTER, dicha sobre el CREATE
  // TABLE: las cuatro operativas en (12,3) y las dos históricas en (14,3).
  for (const [tabla, col] of OPERATIVAS) {
    assert.match(
      sqlBaseline,
      new RegExp(`"${col}" DECIMAL\\(12,3\\)`),
      `${tabla}.${col} debería crearse como DECIMAL(12,3)`
    );
  }
  for (const [tabla, col] of HISTORICAS) {
    assert.match(
      sqlBaseline,
      new RegExp(`"${col}" DECIMAL\\(14,3\\)`),
      `${tabla}.${col} debería crearse como DECIMAL(14,3)`
    );
  }
  // Y los dos límites siguen siendo distintos: (14,3) admite cien veces más.
  assert.notEqual(MAX_12_3, MAX_14_3);
  assert.equal(MAX_14_3 / MAX_12_3, 100);
});

test("6. los umbrales NO se ampliaron: son topes, no cantidades", () => {
  // stockMin/stockMax quedan en (12,2) a propósito. El candado viejo lo afirmaba
  // comprobando que la migración no los nombrara; ahora se afirma sobre el
  // schema, que es donde vive la decisión.
  assert.equal(escalaDe("StockLocal", "stockMin"), "12,2");
  assert.equal(escalaDe("StockLocal", "stockMax"), "12,2");
  assert.equal(escalaDe("AuditoriaStock", "stockMinAnterior"), "12,2");
  assert.equal(escalaDe("AuditoriaStock", "stockMaxNuevo"), "12,2");
});

test("7. defaults y nullabilidad se conservan en el schema", () => {
  const sl = modelo("StockLocal");
  assert.match(sl, /enTransito Decimal\s+@default\(0\)\s+@db\.Decimal\(12, 3\)/);
  assert.match(sl, /cantidad\s+Decimal\s+@db\.Decimal\(12, 3\)/); // sigue NOT NULL
  const au2 = modelo("AuditoriaStock");
  assert.match(au2, /cantidadNueva\s+Decimal\?\s+@db\.Decimal\(14, 3\)/); // nullable
  const td = modelo("TransferenciaDetalle");
  assert.match(td, /cantidad\s+Decimal\s+@db\.Decimal\(12, 3\)/); // NOT NULL
  assert.match(td, /recibido\s+Decimal\?\s+@db\.Decimal\(12, 3\)/); // nullable
  const au = modelo("AuditoriaStock");
  assert.match(au, /cantidadAnterior Decimal\? @db\.Decimal\(14, 3\)/); // nullable
});

test("8. la baseline ordena antes que cualquier migración posterior", () => {
  // El candado original comprobaba que ESTA migración se ordenara después de la
  // de vínculos. Con el historial saneado ese orden dejó de existir.
  //
  // Su primera reescritura exigía que la baseline fuera la ÚNICA, y duró una
  // rama: se puso en rojo con la primera migración legítima. Lo que de verdad
  // importa es que `000000000000_` ordene ANTES que todo lo que venga, porque de
  // eso depende que una migración nueva se aplique DESPUÉS de la baseline y no
  // al revés.
  const dirs = readdirSync(join(RAIZ, "prisma", "migrations"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  assert.ok(dirs.includes("000000000000_squashed_migrations"), "falta la baseline");
  assert.equal(dirs[0], "000000000000_squashed_migrations", `primera: ${dirs[0]}`);
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
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE s_audit (
          id serial PRIMARY KEY,
          "cantidadAnterior" numeric(14,3),
          "cantidadNueva" numeric(14,3)
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

// ══ AUDITORÍA (14,3): conservar la historia sin truncarla ═════════════════════

dbTest("3. AuditoriaStock (14,3) conserva 9.999.999.999,000 sin truncar", async (tx, uno) => {
  await tx.$executeRawUnsafe(
    `INSERT INTO s_audit ("cantidadAnterior","cantidadNueva") VALUES (0.000, 9999999999.000)`
  );
  const r = await uno(`SELECT "cantidadAnterior"::text a, "cantidadNueva"::text n FROM s_audit WHERE id = 1`);
  assert.equal(r.a, "0.000");
  assert.equal(r.n, "9999999999.000", "es la fila real de producción (id 3621)");
});

dbTest("5. AuditoriaStock conserva 8.075: la escala no se perdió al ampliar", async (tx, uno) => {
  await tx.$executeRawUnsafe(
    `INSERT INTO s_audit ("cantidadAnterior","cantidadNueva") VALUES (10.000, 8.075)`
  );
  const r = await uno(`SELECT "cantidadNueva"::text n FROM s_audit WHERE id = 1`);
  assert.equal(r.n, "8.075", "un ajuste nuevo de 3 decimales se registra exacto");
});

dbTest("9. el ALTER real no pierde el valor histórico: (12,2) → (14,3)", async (tx, uno) => {
  // Reproduce exactamente lo que hará la migración sobre AuditoriaStock.
  await tx.$executeRawUnsafe(`
    CREATE TEMP TABLE s_alter_audit (
      id serial PRIMARY KEY,
      "cantidadNueva" numeric(12,2)
    ) ON COMMIT DROP`);
  await tx.$executeRawUnsafe(
    `INSERT INTO s_alter_audit ("cantidadNueva") VALUES (9999999999.00), (779818220.00), (0.00), (-127.65)`
  );
  const antes = await uno(`SELECT string_agg("cantidadNueva"::text, ' | ' ORDER BY id) s FROM s_alter_audit`);
  assert.equal(antes.s, "9999999999.00 | 779818220.00 | 0.00 | -127.65");

  await tx.$executeRawUnsafe(`ALTER TABLE s_alter_audit ALTER COLUMN "cantidadNueva" TYPE numeric(14,3)`);

  const despues = await uno(`SELECT string_agg("cantidadNueva"::text, ' | ' ORDER BY id) s FROM s_alter_audit`);
  assert.equal(despues.s, "9999999999.000 | 779818220.000 | 0.000 | -127.650",
    "cada valor gana un decimal y ninguno cambia de magnitud");
  // Y sigue entrando: el máximo de (14,3) está dos órdenes por encima.
  const cabe = await uno(`SELECT (9999999999.000 < 100000000000)::text c`);
  assert.equal(cabe.c, "true");
});

dbTest("9b. con (12,3) ese mismo ALTER FALLARÍA — es el aborto que detectó el deploy", async (tx) => {
  await tx.$executeRawUnsafe(`
    CREATE TEMP TABLE s_alter_falla (v numeric(12,2)) ON COMMIT DROP`);
  await tx.$executeRawUnsafe(`INSERT INTO s_alter_falla VALUES (9999999999.00)`);
  await assert.rejects(
    () => tx.$executeRawUnsafe(`ALTER TABLE s_alter_falla ALTER COLUMN v TYPE numeric(12,3)`),
    (e) => {
      const msg = (e.meta?.message || e.message || "").toLowerCase();
      assert.ok(/overflow|desbordamiento/.test(msg), `se esperaba overflow, salió: ${msg}`);
      return true;
    }
  );
});

dbTest("10b. los límites de guardia son los correctos para cada precisión", async (tx, uno) => {
  // numeric(12,3) admite 9 dígitos enteros; numeric(14,3), 11.
  const r = await uno(`
    SELECT (999999999.999::numeric(12,3))::text  AS max12,
           (99999999999.999::numeric(14,3))::text AS max14`);
  assert.equal(r.max12, "999999999.999");
  assert.equal(r.max14, "99999999999.999");
  // Un dígito más, en cada caso, desborda. Cada intento va en su propio SAVEPOINT:
  // el primer error aborta la transacción y, sin rollback al savepoint, el segundo
  // fallaría con "current transaction is aborted" en vez de con overflow.
  for (const [valor, tipo] of [["1000000000", "numeric(12,3)"], ["100000000000", "numeric(14,3)"]]) {
    await tx.$executeRawUnsafe(`SAVEPOINT sp_limite`);
    await assert.rejects(
      () => tx.$queryRawUnsafe(`SELECT ${valor}::${tipo}`),
      (e) => {
        const msg = e.meta?.message || e.message || "";
        assert.ok(/overflow|desbordamiento/i.test(msg), `${valor}::${tipo} → ${msg}`);
        return true;
      }
    );
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT sp_limite`);
  }
  // Y el valor de producción cae del lado correcto de cada límite.
  assert.ok(9999999999 >= MAX_12_3, "no entra en (12,3) → por eso abortó el deploy");
  assert.ok(9999999999 < MAX_14_3, "sí entra en (14,3) → por eso se amplía la auditoría");
});

test.after(async () => {
  if (prisma) await prisma.$disconnect();
});
