// PRUEBA DE BASE DE LA RECUPERACIÓN TIPADA DE `20260927120000_libro_stock`.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/recuperacionLibroStock.mjs
//
// Demuestra contra PostgreSQL, por el camino REAL de Prisma, el procedimiento que
// el runbook de `/deploy` indica si la activación del libro no consigue su
// candado en 3 s:
//
//   · una base como producción antes del deploy: 37 migraciones, las 105 filas
//     históricas de `_prisma_migrations`, datos;
//   · `migrate deploy` con una transacción real reteniendo StockLocal:
//     `correccion_caja` se aplica, `libro_stock` falla con P3018 / 55P03;
//   · un segundo deploy sin recuperar da P3009;
//   · el diagnóstico dice CASO_1_RECUPERABLE;
//   · la cadena `diagnóstico && resolve --rolled-back` —la MISMA forma que el
//     comando que acepta la guardia, con psql local en vez de `docker exec` y la
//     CLI local en vez de la de la imagen— deja el intento revertido;
//   · el diagnóstico en modo `revertida` lo confirma;
//   · el reintento aplica el libro de verdad, con el punto cero único.
//
// Y las contrapruebas: en cada estado que NO es el caso 1, el diagnóstico dice
// FRENAR y la cadena NO llega a ejecutar el resolve.
//
// Todo sobre bases descartables `erpazul_rec_prueba_*`, creadas al lado de la de
// DATABASE_URL y borradas al final. Nivel ESCRITURA: host local y NODE_ENV
// distinto de production. Los `migrate deploy` y `migrate resolve` de acá corren
// SOLO contra esas bases; en producción la recuperación pasa por la guardia, con
// el comando exacto de lib/deploy/recuperacionLibroStock.mjs.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const fs = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");
const { spawn, spawnSync } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");

const {
  ARCHIVO_DIAGNOSTICO,
  ARCHIVO_PRECHECK,
  COMANDO_RECUPERACION,
  MIGRACION_ANTERIOR,
  MIGRACION_LIBRO_STOCK: LIBRO,
  RESULTADO,
} = await import("../../lib/deploy/recuperacionLibroStock.mjs");
const { verificarLibroStock } = await import("../../lib/stock/libro/verificador.js");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PREFIJO = "erpazul_rec_prueba_";
const URL_BASE = new URL(process.env.DATABASE_URL);
const urlDe = (db) => { const u = new URL(URL_BASE); u.pathname = `/${db}`; return u.toString(); };

let pasadas = 0;
const fallas = [];
function ok(titulo, condicion, detalle = "") {
  if (condicion) { pasadas += 1; console.log(`  ✓ ${titulo}`); return; }
  const m = `${titulo}${detalle ? ` — ${detalle}` : ""}`;
  fallas.push(m);
  console.log(`  ✗ ${m}`);
}
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ════════════════════════════════════════════════════════════════════════════
// Herramientas
// ════════════════════════════════════════════════════════════════════════════

const creadas = new Set();
async function crearBase(db, plantilla = null) {
  if (!db.startsWith(PREFIJO)) throw new Error(`nombre de base de prueba inválido: ${db}`);
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${db}"${plantilla ? ` TEMPLATE "${plantilla}"` : ""}`);
  creadas.add(db);
  return db;
}

function sql(db, q) {
  const r = spawnSync("psql", [urlDe(db), "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql ${db}: ${r.stderr}`);
  return r.stdout.trim();
}

function dirPrisma(excluir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rec-libro-"));
  const d = path.join(dir, "prisma");
  fs.mkdirSync(path.join(d, "migrations"), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, "prisma/schema.prisma"), path.join(d, "schema.prisma"));
  for (const e of fs.readdirSync(path.join(RAIZ, "prisma/migrations"), { withFileTypes: true })) {
    // El árbol de AQUEL despliegue: hasta el libro inclusive. Las migraciones
    // posteriores —el índice del Stock Diario, la BAJA atómica— cuelgan del
    // libro y no existían cuando se escribió el runbook; con ellas, la base "como
    // producción antes del libro" recibiría objetos sobre tablas que no tiene, y
    // "aplica SOLO libro_stock" dejaría de ser la pregunta.
    if (e.isDirectory() && e.name > LIBRO) continue;
    if (excluir.includes(e.name)) continue;
    fs.cpSync(path.join(RAIZ, "prisma/migrations", e.name), path.join(d, "migrations", e.name), { recursive: true });
  }
  return path.join(d, "schema.prisma");
}

function prisma(args, db, schema) {
  const r = spawnSync("npx", ["prisma", ...args, "--schema", schema], {
    cwd: RAIZ, encoding: "utf8", env: { ...process.env, DATABASE_URL: urlDe(db) },
  });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

/** El diagnóstico, con el archivo del repo, como lo corre el runbook. */
function diagnostico(db, modo) {
  const r = spawnSync("sh", ["-c", `psql '${urlDe(db)}' -X -q -v ON_ERROR_STOP=1 -v modo=${modo} -f - < ${ARCHIVO_DIAGNOSTICO}`],
    { cwd: RAIZ, encoding: "utf8" });
  const salida = `${r.stdout}${r.stderr}`;
  const resultado = /RESULTADO: (CASO_1_RECUPERABLE|REVERTIDA_LIMPIA)/.exec(salida)?.[1] ?? (/RESULTADO: FRENAR/.test(salida) ? RESULTADO.FRENAR : "SIN_RESULTADO");
  return { codigo: r.status, salida, resultado };
}

/**
 * La cadena de recuperación, derivada del comando EXACTO que acepta la guardia:
 * lo que va adentro del `ssh`, con `cd` fuera, psql local en vez de
 * `docker exec … psql` y la CLI local en vez de la de la imagen. Si el comando
 * de la guardia cambia de forma, estos reemplazos dejan de enganchar y la prueba
 * lo dice en vez de probar otra cosa.
 */
function cadenaLocal(db, schema, conector = "&&") {
  const remoto = /^ssh vps-erp '(.*)'$/.exec(COMANDO_RECUPERACION)?.[1];
  if (!remoto) throw new Error("el comando de recuperación no tiene la forma ssh '…'");
  let local = remoto
    .replace("cd /srv/produccion/erpazul && ", "")
    .replace("docker exec -i erpazul_db psql -U erpazul -d erpazul", `psql '${urlDe(db)}'`)
    .replace("docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma", "npx prisma");
  if (local.includes("docker") || local.includes("/srv/")) throw new Error(`la cadena local no quedó local: ${local}`);
  local = `${local} --schema ${schema}`;
  if (conector !== "&&") local = local.replace(`${ARCHIVO_DIAGNOSTICO} &&`, `${ARCHIVO_DIAGNOSTICO} ${conector}`);
  const r = spawnSync("sh", ["-c", local], { cwd: RAIZ, encoding: "utf8", env: { ...process.env, DATABASE_URL: urlDe(db) } });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}`, cadena: local };
}

function precheck(db) {
  const r = spawnSync("sh", ["-c", `psql '${urlDe(db)}' -X -q -v ON_ERROR_STOP=1 -f - < ${ARCHIVO_PRECHECK}`], { cwd: RAIZ, encoding: "utf8" });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

/** CONEXIÓN A: una transacción real que escribe StockLocal y no confirma. */
function retener(db, segundos) {
  return new Promise((resolve) => {
    const h = spawn("psql", [urlDe(db), "-X", "-q", "-c",
      `BEGIN; UPDATE "StockLocal" SET "cantidad" = "cantidad" WHERE "id" = (SELECT min("id") FROM "StockLocal"); SELECT pg_sleep(${segundos}); ROLLBACK;`]);
    h.on("close", resolve);
  });
}

function filasLibro(db) {
  return JSON.parse(sql(db, `SELECT coalesce(json_agg(json_build_object('terminada', finished_at IS NOT NULL,
    'revertida', rolled_back_at IS NOT NULL, 'pasos', applied_steps_count) ORDER BY started_at), '[]')
    FROM "_prisma_migrations" WHERE migration_name = '${LIBRO}'`));
}
const sinResolver = (db) => sql(db, `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`);
const aplicada = (db, m) => sql(db, `SELECT count(*) FROM "_prisma_migrations" WHERE migration_name = '${m}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`) === "1";
const md5Stock = (db) => sql(db, `SELECT md5(string_agg("id"||':'||"cantidad"||':'||"enTransito", ',' ORDER BY "id")) FROM "StockLocal"`);

/** Los objetos del esquema public, para comparar antes y después. */
const catalogo = (db) => new Set(JSON.parse(sql(db, `SELECT json_agg(x) FROM (
    SELECT c.relname AS x FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
    UNION SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
    UNION SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    UNION SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
    UNION SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
  ) s`)));

async function verificador(db) {
  const c = await crearClientePrisma({ nivel: ESCRITURA, url: urlDe(db) });
  try { return await verificarLibroStock(c); } finally { await c.$disconnect(); }
}

/** Un intento de deploy que choca con una transacción que retiene StockLocal. */
async function deployBloqueado(db, schema) {
  const ret = retener(db, 25);
  await esperar(1500);
  const r = prisma(["migrate", "deploy"], db, schema);
  await ret;
  return r;
}

// ════════════════════════════════════════════════════════════════════════════

try {
  const schema37 = dirPrisma([MIGRACION_ANTERIOR, LIBRO]);
  const schema39 = dirPrisma([]);

  seccion("Estado previo al deploy: como producción hoy");
  const PROD = await crearBase(`${PREFIJO}prod`);
  let r = prisma(["migrate", "deploy"], PROD, schema37);
  ok("37 migraciones aplicadas por migrate deploy", r.codigo === 0, r.salida.slice(-300));
  const sim = spawnSync("node", ["--import", "./scripts/alias-loader.mjs", "scripts/pruebas-db/simular-historial-produccion.mjs"],
    { cwd: RAIZ, encoding: "utf8", env: { ...process.env, DATABASE_URL: urlDe(PROD) } });
  ok("más las 105 filas históricas de producción", sim.status === 0 && sql(PROD, `SELECT count(*) FROM "_prisma_migrations"`) === "142",
    sim.stdout.slice(-200) + sim.stderr.slice(-200));
  sql(PROD, `INSERT INTO "Grupo"(nombre,"updatedAt") VALUES ('g',now());
    INSERT INTO "Local"(nombre,"updatedAt",es_deposito) VALUES ('A',now(),false),('B',now(),false),('Dep',now(),true);
    INSERT INTO "ProductoBase"("grupoId",nombre,codigo_barra,unidad_medida,precio_costo,precio_venta,"updatedAt")
      SELECT (SELECT min(id) FROM "Grupo"),'p'||i,'c'||i,'unidad',1,2,now() FROM generate_series(1,1000) i;
    INSERT INTO "ProductoLocal"("localId","baseId","updatedAt") SELECT l.id,pb.id,now() FROM "Local" l CROSS JOIN "ProductoBase" pb;
    INSERT INTO "StockLocal"("localId","productoId",cantidad,"enTransito","updatedAt")
      SELECT "localId",id,id%9,CASE WHEN id%13=0 THEN 1.5 ELSE 0 END,now() FROM "ProductoLocal";`);
  const filasStock = sql(PROD, `SELECT count(*) FROM "StockLocal"`);
  ok(`con ${filasStock} filas de StockLocal`, Number(filasStock) === 3000);
  const catalogoPrevio = catalogo(PROD);
  const stockPrevio = md5Stock(PROD);

  seccion("Precheck de solo lectura");
  let pc = precheck(PROD);
  ok("sin nada que lo impida: VERDE", pc.codigo === 0 && /PRECHECK: VERDE/.test(pc.salida), pc.salida.slice(-300));
  {
    const ret = retener(PROD, 6);
    await esperar(3000);
    pc = precheck(PROD);
    await ret;
    ok("con una transacción retenida sobre StockLocal: ROJO por transacción larga y por candado", pc.codigo !== 0 &&
      /transaccion-larga/.test(pc.salida) && /candado-sobre-tablas-del-libro/.test(pc.salida), pc.salida.slice(-300));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("El fallo: correccion_caja pasa, libro_stock choca con el candado");
  const B = await crearBase(`${PREFIJO}b`, PROD);
  r = await deployBloqueado(B, schema39);
  ok("migrate deploy sale con error", r.codigo !== 0);
  ok("P3018, SQLSTATE 55P03, lock timeout, en libro_stock", /P3018/.test(r.salida) && /55P03/.test(r.salida) &&
    /lock timeout/.test(r.salida) && r.salida.includes(`Migration name: ${LIBRO}`), r.salida.slice(-400));
  ok("correccion_caja quedó APLICADA", aplicada(B, MIGRACION_ANTERIOR));
  ok("libro_stock quedó con un intento fallido, sin pasos", JSON.stringify(filasLibro(B)) === JSON.stringify([{ terminada: false, revertida: false, pasos: 0 }]));
  const agregados = [...catalogo(B)].filter((x) => !catalogoPrevio.has(x));
  // `_CorreccionCaja` es el tipo arreglo que PostgreSQL crea solo con la tabla.
  const deCaja = (x) => x.replace(/^_/, "").startsWith("CorreccionCaja");
  ok("el esquema solo ganó los objetos de CorreccionCaja", agregados.length > 0 && agregados.every(deCaja), agregados.join(", "));
  ok("StockLocal idéntica, fila por fila", md5Stock(B) === stockPrevio);
  const FALLO = await crearBase(`${PREFIJO}fallo`, B);

  r = prisma(["migrate", "deploy"], B, schema39);
  ok("un segundo deploy sin recuperar se niega: P3009", r.codigo !== 0 && /P3009/.test(r.salida), r.salida.slice(-300));
  pc = precheck(B);
  ok("y el precheck lo ve: ROJO por migración fallida sin resolver", pc.codigo !== 0 && /migracion-fallida-sin-resolver/.test(pc.salida));

  seccion("Diagnóstico y recuperación tipada");
  let d = diagnostico(B, "recuperar");
  ok("diagnóstico: CASO_1_RECUPERABLE, código 0", d.codigo === 0 && d.resultado === RESULTADO.RECUPERABLE, d.salida.slice(-500));
  ok("con las seis condiciones en verde y sin aviso de segundo fallo", (d.salida.match(/✓ [1-6]\./g) || []).length === 6 && !/SEGUNDO FALLO/.test(d.salida));
  d = diagnostico(B, "revertida");
  ok("en modo revertida, ANTES del resolve: FRENAR (todavía hay una sin resolver)", d.codigo !== 0 && d.resultado === RESULTADO.FRENAR);

  let c = cadenaLocal(B, schema39);
  ok("la cadena diagnóstico && resolve --rolled-back sale con 0", c.codigo === 0, c.salida.slice(-400));
  ok("el intento quedó REVERTIDO, sin pasos y sin figurar como aplicado", JSON.stringify(filasLibro(B)) === JSON.stringify([{ terminada: false, revertida: true, pasos: 0 }]));
  d = diagnostico(B, "revertida");
  ok("diagnóstico en modo revertida: REVERTIDA_LIMPIA", d.codigo === 0 && d.resultado === RESULTADO.REVERTIDA, d.salida.slice(-400));
  ok("ningún objeto del libro, y StockLocal idéntica", /✓ 6\./.test(d.salida) && md5Stock(B) === stockPrevio);
  r = prisma(["migrate", "status"], B, schema39);
  ok("(y `migrate status` dice «up to date» aunque el libro NO está aplicado: no sirve de prueba)", /up to date/i.test(r.salida));

  seccion("Segundo intento, sin bloqueo");
  r = prisma(["migrate", "deploy"], B, schema39);
  ok("migrate deploy aplica SOLO libro_stock", r.codigo === 0 && (r.salida.match(/Applying migration/g) || []).length === 1 && r.salida.includes(`Applying migration \`${LIBRO}\``), r.salida.slice(-300));
  const e = JSON.parse(sql(B, `SELECT json_build_object(
    'estadoInicial', (SELECT count(*) FROM "MovimientoStock" WHERE "tipo" = 'ESTADO_INICIAL'),
    'instantes', (SELECT count(DISTINCT "instante") FROM "MovimientoStock" WHERE "tipo" = 'ESTADO_INICIAL'),
    'movimientos', (SELECT count(*) FROM "MovimientoStock"),
    'triggers', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND (tgname LIKE '%libro%' OR tgname LIKE '%_inmutable')),
    'triggersDistintos', (SELECT count(DISTINCT tgname) FROM pg_trigger WHERE NOT tgisinternal AND (tgname LIKE '%libro%' OR tgname LIKE '%_inmutable')),
    'funciones', (SELECT count(*) FROM pg_proc WHERE proname LIKE 'libro_stock%'))`));
  ok(`punto cero único y completo: ${e.estadoInicial} filas, ${e.instantes} instante, ningún otro movimiento`,
    e.estadoInicial === Number(filasStock) && e.instantes === 1 && e.movimientos === e.estadoInicial);
  ok("5 triggers, una vez cada uno, y 9 funciones", e.triggers === 5 && e.triggersDistintos === 5 && e.funciones === 9, JSON.stringify(e));
  const terminadas = sql(B, `SELECT count(DISTINCT migration_name) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name IN (${fs.readdirSync(path.join(RAIZ, "prisma/migrations"), { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => `'${x.name}'`).join(",")})`);
  ok("las 39 del árbol aplicadas, contadas por nombre (el intento revertido queda aparte)", terminadas === "39" &&
    JSON.stringify(filasLibro(B)) === JSON.stringify([{ terminada: false, revertida: true, pasos: 0 }, { terminada: true, revertida: false, pasos: 1 }]));
  let v = await verificador(B);
  ok("verificador del libro: integridad VERDE", v.integridad.ok);
  sql(B, `UPDATE "StockLocal" SET "cantidad" = "cantidad" + 1 WHERE "id" = (SELECT min("id") FROM "StockLocal")`);
  v = await verificador(B);
  ok("una escritura posterior queda capturada y el verificador sigue VERDE",
    sql(B, `SELECT count(*) FROM "MovimientoStock" WHERE "tipo" = 'CAMBIO'`) === "1" && v.integridad.ok);
  d = diagnostico(B, "recuperar");
  ok("con el libro aplicado, el diagnóstico dice FRENAR: no hay nada que recuperar", d.codigo !== 0 && d.resultado === RESULTADO.FRENAR);

  seccion("El inventario del diagnóstico cubre TODO lo que crea la migración");
  {
    const delLibro = [...catalogo(B)].filter((x) => !catalogoPrevio.has(x) && !deCaja(x));
    const presentes = /objetos del libro presentes: \{([^}]*)\}/.exec(d.salida)?.[1] ?? "";
    const faltan = delLibro.filter((x) => !presentes.includes(x));
    ok(`los ${delLibro.length} objetos nuevos de la base aparecen en el inventario del diagnóstico`, delLibro.length > 20 && faltan.length === 0, `faltan: ${faltan.join(", ")}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("Doble fallo: timeout → recuperación → timeout otra vez");
  {
    const G = await crearBase(`${PREFIJO}g`, PROD);
    await deployBloqueado(G, schema39);
    ok("primer fallo recuperado", cadenaLocal(G, schema39).codigo === 0);
    r = await deployBloqueado(G, schema39);
    ok("el segundo intento vuelve a fallar por el candado", r.codigo !== 0 && /55P03/.test(r.salida));
    d = diagnostico(G, "recuperar");
    ok("el diagnóstico sigue siendo CASO_1_RECUPERABLE y AVISA que es un segundo fallo",
      d.resultado === RESULTADO.RECUPERABLE && /SEGUNDO FALLO/.test(d.salida) && /ya revertidos antes: 1/.test(d.salida));
    ok("la recuperación deja el registro sin bloquear", cadenaLocal(G, schema39).codigo === 0 && sinResolver(G) === "0");
    d = diagnostico(G, "revertida");
    ok("REVERTIDA_LIMPIA con los dos intentos revertidos: la ventana se cierra acá (regla del runbook)",
      d.resultado === RESULTADO.REVERTIDA && /ya revertidos antes: 2/.test(d.salida) && filasLibro(G).every((f) => f.revertida && !f.terminada));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("Contrapruebas: el diagnóstico FRENA y la cadena NO resuelve");
  // Cada caso parte del fallo limpio y le cambia UNA cosa. Escribir en
  // `_prisma_migrations` o crear objetos sueltos acá es preparar el ESTADO que se
  // quiere diagnosticar, sobre una base descartable; el fallo en sí es siempre el
  // real de la sección de arriba.
  const CASOS = [
    ["6. logs sin 55P03", `UPDATE "_prisma_migrations" SET logs = replace(logs, '55P03', 'XXXXX') WHERE migration_name = '${LIBRO}'`, "sin-55P03"],
    ["7. logs sin «lock timeout»", `UPDATE "_prisma_migrations" SET logs = replace(logs, 'lock timeout', 'otra cosa') WHERE migration_name = '${LIBRO}'`, "sin-lock-timeout"],
    ["8. applied_steps_count distinto de 0", `UPDATE "_prisma_migrations" SET applied_steps_count = 1 WHERE migration_name = '${LIBRO}'`, "ultimo-intento-no-es-un-fallo-sin-pasos"],
    ["9. otra migración fallida además del libro", `INSERT INTO "_prisma_migrations"(id, checksum, migration_name, started_at, applied_steps_count) VALUES ('x', 'x', '20261001000000_otra', now(), 0)`, "no-es-la-unica-fallida"],
    ["10. correccion_caja no aplicada", `UPDATE "_prisma_migrations" SET rolled_back_at = now(), finished_at = NULL WHERE migration_name = '${MIGRACION_ANTERIOR}'`, "anteriores-sin-aplicar"],
    ["11. una tabla del libro", `CREATE TABLE "MovimientoStock" (id int)`, "objetos-del-libro-presentes"],
    ["12. una función del libro", `CREATE FUNCTION libro_stock_registrar() RETURNS int LANGUAGE sql AS 'SELECT 1'`, "objetos-del-libro-presentes"],
    ["13. un trigger del libro", `CREATE FUNCTION prueba_fn() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'; CREATE TRIGGER "StockLocal_libro" AFTER UPDATE ON "StockLocal" FOR EACH ROW EXECUTE FUNCTION prueba_fn()`, "objetos-del-libro-presentes"],
    ["14a. una secuencia del libro", `CREATE SEQUENCE "MovimientoStock_id_seq"`, "objetos-del-libro-presentes"],
    ["14b. el enum del libro", `CREATE TYPE "TipoMovimientoStock" AS ENUM ('X')`, "objetos-del-libro-presentes"],
    ["14c. un índice del libro", `CREATE INDEX "MovimientoStock_localId_dia_idx" ON "StockLocal"("id")`, "objetos-del-libro-presentes"],
    ["14d. un tipo con nombre de arreglo de una tabla del libro", `CREATE TYPE "_ReinterpretacionDeStock" AS ENUM ('X')`, "objetos-del-libro-presentes"],
    ["15. un punto cero parcial", `CREATE TABLE "MovimientoStock" (id int); INSERT INTO "MovimientoStock" VALUES (1), (2)`, "objetos-del-libro-presentes"],
    ["16a. el libro figura aplicado (el estado que deja --applied)", `UPDATE "_prisma_migrations" SET finished_at = now() WHERE migration_name = '${LIBRO}'`, "no-es-la-unica-fallida"],
    ["16b. una fila del libro revertida Y terminada", `UPDATE "_prisma_migrations" SET finished_at = now(), rolled_back_at = now() WHERE migration_name = '${LIBRO}'; INSERT INTO "_prisma_migrations"(id, checksum, migration_name, started_at, applied_steps_count, logs) SELECT 'y', checksum, migration_name, now(), 0, logs FROM "_prisma_migrations" WHERE migration_name = '${LIBRO}'`, "registro-del-libro-incoherente"],
  ];
  let n = 0;
  for (const [nombre, preparar, clave] of CASOS) {
    const db = await crearBase(`${PREFIJO}c${++n}`, FALLO);
    sql(db, preparar);
    const antes = JSON.stringify(filasLibro(db));
    d = diagnostico(db, "recuperar");
    const cad = cadenaLocal(db, schema39);
    ok(`${nombre}: FRENAR (${clave}) y el resolve NO corrió`,
      d.codigo !== 0 && d.resultado === RESULTADO.FRENAR && d.salida.includes(clave) &&
        cad.codigo !== 0 && JSON.stringify(filasLibro(db)) === antes,
      `${d.resultado} ${d.salida.match(/RESULTADO:[^\n]*/)?.[0] ?? ""}`);
  }

  {
    // Una falla SQL que NO es el candado, real: una excepción a mitad de la activación.
    const db = await crearBase(`${PREFIJO}sql`, PROD);
    sql(db, `CREATE FUNCTION prueba_falla() RETURNS event_trigger LANGUAGE plpgsql AS $f$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_event_trigger_ddl_commands() WHERE object_identity LIKE '%Local_libro_reinterpretacion%') THEN
          RAISE EXCEPTION 'FALLA DISTINTA INYECTADA'; END IF; END $f$;
      CREATE EVENT TRIGGER prueba_falla ON ddl_command_end WHEN TAG IN ('CREATE TRIGGER') EXECUTE FUNCTION prueba_falla();`);
    r = prisma(["migrate", "deploy"], db, schema39);
    d = diagnostico(db, "recuperar");
    const cad = cadenaLocal(db, schema39);
    ok("una falla SQL distinta, real: FRENAR y el resolve NO corrió",
      r.codigo !== 0 && d.resultado === RESULTADO.FRENAR && /sin-55P03/.test(d.salida) && cad.codigo !== 0 &&
        JSON.stringify(filasLibro(db)) === JSON.stringify([{ terminada: false, revertida: false, pasos: 0 }]));
  }

  {
    // correccion_caja falla de verdad: el libro ni se intenta.
    const db = await crearBase(`${PREFIJO}caja`, PROD);
    sql(db, `CREATE TABLE "CorreccionCaja" (id int)`);
    r = prisma(["migrate", "deploy"], db, schema39);
    d = diagnostico(db, "recuperar");
    ok("si falla correccion_caja: libro_stock no se intenta y el diagnóstico dice FRENAR",
      r.codigo !== 0 && r.salida.includes(`Migration name: ${MIGRACION_ANTERIOR}`) && filasLibro(db).length === 0 &&
        d.resultado === RESULTADO.FRENAR && cadenaLocal(db, schema39).codigo !== 0 && filasLibro(db).length === 0);
  }

  {
    // Por qué la guardia exige `&&` y rechaza `;`: con `;` el resolve corre igual.
    const db = await crearBase(`${PREFIJO}pyc`, FALLO);
    sql(db, CASOS[0][1]);
    const cad = cadenaLocal(db, schema39, ";");
    ok("con `;` en vez de `&&`, el resolve CORRE aunque el diagnóstico diga FRENAR (por eso la guardia exige el comando exacto)",
      filasLibro(db).at(-1)?.revertida === true, cad.cadena);
  }

  {
    // --applied: el registro miente.
    const db = await crearBase(`${PREFIJO}applied`, FALLO);
    prisma(["migrate", "resolve", "--applied", LIBRO], db, schema39);
    r = prisma(["migrate", "deploy"], db, schema39);
    ok("--applied: el deploy dice «No pending migrations» y el libro no existe", /No pending migrations/i.test(r.salida) &&
      sql(db, `SELECT count(*) FROM pg_tables WHERE tablename = 'MovimientoStock'`) === "0");
    ok("y los dos modos del diagnóstico lo ven: FRENAR",
      diagnostico(db, "recuperar").resultado === RESULTADO.FRENAR && diagnostico(db, "revertida").resultado === RESULTADO.FRENAR);
  }
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err}`);
  console.error(err);
} finally {
  for (const db of creadas) {
    if (db.startsWith(PREFIJO)) await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`).catch(() => {});
  }
  await principal.$disconnect();
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  for (const f of fallas) console.log(`  ✗ ${f.split("\n")[0]}`);
  process.exit(1);
}
