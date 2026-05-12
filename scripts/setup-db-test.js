/**
 * Bootstrap local (Opción E): DB limpia + prisma db push + alinear _prisma_migrations con migrate resolve.
 *
 * SOLO desarrollo: aborta si el host no es loopback local o si NODE_ENV=production.
 * No imprime credenciales ni DATABASE_URL completa.
 *
 * Uso: node scripts/setup-db-test.js
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TEST_DB = "erpazul_migration_test";
const MIGRATIONS_DIR = path.join(ROOT, "prisma", "migrations");

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    console.error("No se encontró .env en la raíz del proyecto.");
    process.exit(1);
  }
  const raw = fs.readFileSync(envPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function isAllowedHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

function buildUrlWithDb(originalHref, dbName) {
  const u = new URL(originalHref);
  u.pathname = "/" + dbName;
  return u.href;
}

function runCmd(cmd, args, extraEnv) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  return {
    status: r.status,
    stdout: (r.stdout || "").trimEnd(),
    stderr: (r.stderr || "").trimEnd(),
  };
}

function runPsql(host, port, user, password, database, sql) {
  const env = { ...process.env };
  if (password) env.PGPASSWORD = password;
  const args = [
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    host,
    "-p",
    String(port),
    "-U",
    user,
    "-d",
    database,
    "-c",
    sql,
  ];
  // shell:false: en Windows, shell:true parte el SQL por `;` y rompe -c.
  const r = spawnSync("psql", args, {
    cwd: ROOT,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  return {
    status: r.status,
    stdout: (r.stdout || "").trimEnd(),
    stderr: (r.stderr || "").trimEnd(),
  };
}

function listMigrationFolders() {
  const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => {
      const p = path.join(MIGRATIONS_DIR, name, "migration.sql");
      return fs.existsSync(p);
    })
    .sort();
}

function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("ABORT: NODE_ENV es production. Este script es solo para desarrollo local.");
    process.exit(1);
  }

  const envPath = path.join(ROOT, ".env");
  const fileEnv = loadEnvFile(envPath);
  const databaseUrl = fileEnv.DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ABORT: DATABASE_URL no definido en .env ni en el entorno.");
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    console.error("ABORT: DATABASE_URL no es una URL válida.");
    process.exit(1);
  }

  const host = parsed.hostname;
  if (!isAllowedHost(host)) {
    console.error(
      `ABORT: host no permitido (${host}). Solo se permite localhost o 127.0.0.1.`
    );
    process.exit(1);
  }

  const port = parsed.port || "5432";
  const user = decodeURIComponent(parsed.username || "postgres");
  const password = parsed.password ? decodeURIComponent(parsed.password) : "";
  console.log("--- setup-db-test (solo local) ---");
  console.log(`host: ${host}`);
  console.log(`puerto: ${port}`);
  console.log(`nombre de DB destino: ${TEST_DB}`);
  console.log("");

  const adminDb = "postgres";
  console.log("Paso 1: DROP + CREATE base de prueba (vía psql a " + adminDb + ")...");
  const psqlDrop = runPsql(
    host,
    port,
    user,
    password,
    adminDb,
    `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`
  );
  if (psqlDrop.status !== 0) {
    console.error(psqlDrop.stderr || psqlDrop.stdout);
    process.exit(1);
  }
  const psqlCreate = runPsql(
    host,
    port,
    user,
    password,
    adminDb,
    `CREATE DATABASE ${TEST_DB};`
  );
  if (psqlCreate.status !== 0) {
    console.error(psqlCreate.stderr || psqlCreate.stdout);
    process.exit(1);
  }
  console.log("OK: base creada o recreada.\n");

  const testDatabaseUrl = buildUrlWithDb(databaseUrl, TEST_DB);

  console.log("Paso 2: npx prisma db push --skip-generate...");
  const push = runCmd("npx", ["prisma", "db", "push", "--skip-generate"], {
    DATABASE_URL: testDatabaseUrl,
  });
  console.log(push.stdout);
  if (push.stderr) console.error(push.stderr);
  if (push.status !== 0) {
    console.error("ABORT: db push falló.");
    process.exit(1);
  }
  console.log("OK: db push.\n");

  const folders = listMigrationFolders();
  console.log(`Paso 3: migrate resolve --applied (${folders.length} migraciones)...`);

  const resolveResults = [];
  for (const name of folders) {
    const res = runCmd(
      "npx",
      ["prisma", "migrate", "resolve", "--applied", name],
      { DATABASE_URL: testDatabaseUrl }
    );
    resolveResults.push({ name, ...res });
    if (res.status !== 0) {
      console.error(`Falló resolve para: ${name}`);
      console.error(res.stderr || res.stdout);
      process.exit(1);
    }
    console.log(`  aplicada (registro): ${name}`);
  }
  console.log("OK: todas las migraciones marcadas como aplicadas.\n");

  console.log("Paso 4: prisma migrate status...");
  const status = runCmd("npx", ["prisma", "migrate", "status"], {
    DATABASE_URL: testDatabaseUrl,
  });
  console.log(status.stdout);
  if (status.stderr) console.error(status.stderr);
  if (status.status !== 0) {
    console.error("ABORT: migrate status distinto de 0.");
    process.exit(1);
  }
  console.log("");

  console.log("Paso 5: node scripts/seed-lista-default.js...");
  const seed = runCmd(
    process.execPath,
    [path.join(ROOT, "scripts", "seed-lista-default.js")],
    { DATABASE_URL: testDatabaseUrl }
  );
  console.log(seed.stdout);
  if (seed.stderr) console.error(seed.stderr);
  if (seed.status !== 0) {
    console.error("ABORT: seed falló.");
    process.exit(1);
  }
  console.log("OK: seed.\n");

  console.log("Paso 6: validaciones SQL...");
  const validationSql = `
SELECT 'tabla__prisma_migrations' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations') AS ok;

SELECT 'count_migrations' AS check_id, COUNT(*)::text AS detail FROM "_prisma_migrations";

SELECT 'tabla_Grupo' AS check_id, to_regclass('public."Grupo"') IS NOT NULL AS ok;
SELECT 'tabla_Cliente' AS check_id, to_regclass('public."Cliente"') IS NOT NULL AS ok;
SELECT 'tabla_Venta' AS check_id, to_regclass('public."Venta"') IS NOT NULL AS ok;
SELECT 'tabla_VentaDetalle' AS check_id, to_regclass('public."VentaDetalle"') IS NOT NULL AS ok;
SELECT 'tabla_ListaPrecio' AS check_id, to_regclass('public."ListaPrecio"') IS NOT NULL AS ok;

SELECT 'col_ListaPrecio_grupoId' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ListaPrecio' AND column_name='grupoId') AS ok;
SELECT 'col_ListaPrecio_tipoBase' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ListaPrecio' AND column_name='tipoBase') AS ok;
SELECT 'col_ListaPrecio_margenPorcentaje' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ListaPrecio' AND column_name='margenPorcentaje') AS ok;
SELECT 'col_ListaPrecio_esDefault' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ListaPrecio' AND column_name='esDefault') AS ok;
SELECT 'col_Cliente_listaPrecioId' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Cliente' AND column_name='listaPrecioId') AS ok;
SELECT 'col_Venta_listaPrecioId' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Venta' AND column_name='listaPrecioId') AS ok;
SELECT 'col_VentaDetalle_listaPrecioId' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='VentaDetalle' AND column_name='listaPrecioId') AS ok;
SELECT 'col_VentaDetalle_tipoPrecioAplicado' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='VentaDetalle' AND column_name='tipoPrecioAplicado') AS ok;
SELECT 'col_VentaDetalle_margenAplicado' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='VentaDetalle' AND column_name='margenAplicado') AS ok;

SELECT 'sin_ListaPrecio_grupoId_null' AS check_id,
  (SELECT COUNT(*)::int FROM "ListaPrecio" WHERE "grupoId" IS NULL) = 0 AS ok;

SELECT 'default_activa_por_grupo' AS check_id,
  NOT EXISTS (
    SELECT 1 FROM "Grupo" g
    WHERE NOT EXISTS (
      SELECT 1 FROM "ListaPrecio" lp
      WHERE lp."grupoId" = g.id AND lp."esDefault" = true AND lp.activo = true
    )
  ) AS ok;
`;

  const val = runPsql(host, port, user, password, TEST_DB, validationSql);
  console.log(val.stdout);
  if (val.stderr) console.error(val.stderr);
  if (val.status !== 0) {
    console.error("ABORT: validaciones SQL fallaron.");
    process.exit(1);
  }

  console.log("\n--- Fin setup-db-test ---");
}

main();
