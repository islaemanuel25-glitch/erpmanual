// PRUEBA DE BASE DE LA RECUPERACIÓN TIPADA DE `20260929200000_libro_costo_activacion`.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/recuperacionLibroCostos.mjs
//
// Demuestra contra PostgreSQL, por el camino REAL de Prisma, el procedimiento que
// el runbook de `/deploy` indica si la activación del Libro de Costos no consigue
// su candado en 3 s:
//
//   · una base como producción antes de activar: las 42 migraciones, las filas
//     históricas de `_prisma_migrations`, productos y ubicaciones;
//   · `migrate deploy` con una transacción real reteniendo ProductoBase: la
//     activación falla con P3018 / 55P03 y no deja nada;
//   · un segundo deploy sin recuperar da P3009;
//   · el diagnóstico dice CASO_1_RECUPERABLE;
//   · la cadena `diagnóstico && resolve --rolled-back` —la MISMA forma que el
//     comando que acepta la guardia, con psql local en vez de `docker exec` y la
//     CLI local en vez de la de la imagen— deja el intento revertido, y SOLO
//     revertido: nunca aplicado;
//   · el diagnóstico en modo `revertida` lo confirma;
//   · el reintento por el camino normal activa el libro de verdad.
//
// Y las contrapruebas: en cada estado que NO es el caso 1, el diagnóstico dice
// FRENAR y la cadena NO llega a ejecutar el resolve.
//
// Todo sobre bases descartables `erpazul_rec_costos_*`, creadas al lado de la de
// DATABASE_URL y borradas al final. Nivel ESCRITURA: host local y NODE_ENV
// distinto de production. Los `migrate deploy` y `migrate resolve` de acá corren
// SOLO contra esas bases; en producción la recuperación pasa por la guardia, con
// el comando exacto de lib/deploy/recuperacionLibroCostos.mjs.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const fs = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");
const { spawn, spawnSync } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");

const {
  ARCHIVO_DIAGNOSTICO_COSTOS: DIAGNOSTICO,
  COMANDO_RECUPERACION_COSTOS,
  MIGRACION_ACTIVACION_COSTOS: ACT,
  MIGRACION_INSTALACION_COSTOS: INSTALACION,
  RESULTADO,
} = await import("../../lib/deploy/recuperacionLibroCostos.mjs");
const { TRIGGERS_DE_ACTIVACION } = await import("../../lib/libros/libroCostos.js");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PREFIJO = "erpazul_rec_costos_";
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

/** Un directorio de Prisma con las migraciones del árbol, con o sin la activación. */
function dirPrisma(conActivacion) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rec-costos-"));
  const d = path.join(dir, "prisma");
  fs.mkdirSync(path.join(d, "migrations"), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, "prisma/schema.prisma"), path.join(d, "schema.prisma"));
  for (const e of fs.readdirSync(path.join(RAIZ, "prisma/migrations"), { withFileTypes: true })) {
    // El árbol de ESTE despliegue: hasta la activación inclusive. Lo que venga
    // después no existía cuando se escribió el runbook.
    if (!e.isDirectory() || e.name > ACT) continue;
    if (!conActivacion && e.name === ACT) continue;
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
  const r = spawnSync("sh", ["-c", `psql '${urlDe(db)}' -X -q -v ON_ERROR_STOP=1 -v modo=${modo} -f - < ${DIAGNOSTICO}`],
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
  const remoto = /^ssh vps-erp '(.*)'$/.exec(COMANDO_RECUPERACION_COSTOS)?.[1];
  if (!remoto) throw new Error("el comando de recuperación no tiene la forma ssh '…'");
  let local = remoto
    .replace("cd /srv/produccion/erpazul && ", "")
    .replace("docker exec -i erpazul_db psql -U erpazul -d erpazul", `psql '${urlDe(db)}'`)
    .replace("docker compose -f docker-compose.prod.yml run --rm -T --no-deps app prisma", "npx prisma");
  if (local.includes("docker") || local.includes("/srv/")) throw new Error(`la cadena local no quedó local: ${local}`);
  local = `${local} --schema ${schema}`;
  if (conector !== "&&") local = local.replace(`${DIAGNOSTICO} &&`, `${DIAGNOSTICO} ${conector}`);
  const r = spawnSync("sh", ["-c", local], { cwd: RAIZ, encoding: "utf8", env: { ...process.env, DATABASE_URL: urlDe(db) } });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}`, cadena: local };
}

/** Otra sesión que retiene un candado y no confirma, hasta que se la suelta. */
function retener(db, sentencia, segundos) {
  return new Promise((resolve) => {
    const h = spawn("psql", [urlDe(db), "-X", "-q", "-c", `BEGIN; ${sentencia}; SELECT pg_sleep(${segundos}); ROLLBACK;`]);
    h.on("close", resolve);
  });
}

/** Espera a que otra sesión tenga concedido `modo` sobre `tabla`. */
async function esperarCandado(db, tabla, modo) {
  for (let i = 0; i < 50; i += 1) {
    const n = sql(db, `SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
      WHERE l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND c.relname = '${tabla}' AND l.mode = '${modo}' AND l.granted AND l.pid <> pg_backend_pid()`);
    if (n !== "0") return;
    await esperar(100);
  }
  throw new Error(`nadie tomó ${modo} sobre ${tabla} en 5 s`);
}

const RETENER_BASE = `UPDATE "ProductoBase" SET "nombre" = "nombre" WHERE "id" = (SELECT min("id") FROM "ProductoBase")`;

/** Un intento de deploy que choca con una transacción que retiene ProductoBase. */
async function deployBloqueado(db, schema, sentencia = RETENER_BASE, tabla = "ProductoBase", modo = "RowExclusiveLock") {
  const ret = retener(db, sentencia, 15);
  await esperarCandado(db, tabla, modo);
  const r = prisma(["migrate", "deploy"], db, schema);
  await ret;
  return r;
}

function filasActivacion(db) {
  return JSON.parse(sql(db, `SELECT coalesce(json_agg(json_build_object('terminada', finished_at IS NOT NULL,
    'revertida', rolled_back_at IS NOT NULL, 'pasos', applied_steps_count) ORDER BY started_at), '[]')
    FROM "_prisma_migrations" WHERE migration_name = '${ACT}'`));
}
const estado = (db) => JSON.parse(sql(db, `SELECT row_to_json(e) FROM "libro_costo_estado"() e`));
const libro = (db) => JSON.parse(sql(db, `SELECT json_build_object(
    'base', (SELECT count(*) FROM "CostoBaseVersion"),
    'ubicacion', (SELECT count(*) FROM "CostoUbicacionVersion"),
    'activacion', (SELECT count(*) FROM "LibroCostoActivacion"),
    'triggers', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (${TRIGGERS_DE_ACTIVACION.map((t) => `'${t}'`).join(",")})))`));
const LIBRO_VACIO = JSON.stringify({ base: 0, ubicacion: 0, activacion: 0, triggers: 0 });
const huella = (db) => sql(db, `SELECT base || ubicacion FROM "libro_costo_huella_fuente"()`);

/** Los objetos del esquema public, para comparar antes y después. */
const catalogo = (db) => new Set(JSON.parse(sql(db, `SELECT json_agg(x) FROM (
    SELECT c.relname AS x FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
    UNION SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
    UNION SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    UNION SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
    UNION SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
  ) s`)));

// ════════════════════════════════════════════════════════════════════════════

try {
  const schema42 = dirPrisma(false);
  const schema43 = dirPrisma(true);

  seccion("Estado previo: como producción antes de activar");
  const PROD = await crearBase(`${PREFIJO}prod`);
  let r = prisma(["migrate", "deploy"], PROD, schema42);
  ok("las 42 migraciones aplicadas por migrate deploy, la activación no", r.codigo === 0 &&
    sql(PROD, `SELECT count(*) FROM "_prisma_migrations" WHERE migration_name = '${ACT}'`) === "0", r.salida.slice(-300));
  const sim = spawnSync("node", ["--import", "./scripts/alias-loader.mjs", "scripts/pruebas-db/simular-historial-produccion.mjs"],
    { cwd: RAIZ, encoding: "utf8", env: { ...process.env, DATABASE_URL: urlDe(PROD) } });
  ok("más las filas históricas de producción", sim.status === 0 && Number(sql(PROD, `SELECT count(*) FROM "_prisma_migrations"`)) > 100,
    sim.stdout.slice(-200) + sim.stderr.slice(-200));
  sql(PROD, `INSERT INTO "Grupo"(nombre,"updatedAt") VALUES ('g',now());
    INSERT INTO "Local"(nombre,"updatedAt",es_deposito) VALUES ('A',now(),false),('B',now(),false),('Dep',now(),true);
    INSERT INTO "ProductoBase"("grupoId",nombre,codigo_barra,unidad_medida,precio_costo,precio_venta,"updatedAt")
      SELECT (SELECT min(id) FROM "Grupo"),'p'||i,'c'||i,'unidad',i,2,now() FROM generate_series(1,300) i;
    INSERT INTO "ProductoLocal"("localId","baseId","updatedAt") SELECT l.id,pb.id,now() FROM "Local" l CROSS JOIN "ProductoBase" pb;`);
  // Asentada, para que un autovacuum no tome un candado a mitad de la prueba
  // (la carrera que ya costó dos corridas de CI en la prueba de libro_stock).
  sql(PROD, `VACUUM ANALYZE "Grupo", "Local", "ProductoBase", "ProductoLocal", "CostoBaseVersion", "CostoUbicacionVersion", "LibroCostoActivacion"`);
  ok("NO_ACTIVADO, con el libro vacío", estado(PROD).estado === "NO_ACTIVADO" && JSON.stringify(libro(PROD)) === LIBRO_VACIO);
  const catalogoPrevio = catalogo(PROD);
  const huellaPrevia = huella(PROD);

  {
    // CONTRAPRUEBA 4 del pedido: la migración correcta, SIN estado fallido, no
    // se resuelve. Nadie la intentó todavía.
    const d = diagnostico(PROD, "recuperar");
    const c = cadenaLocal(PROD, schema43);
    ok("sin ningún intento fallido: FRENAR y el resolve NO corrió", d.resultado === RESULTADO.FRENAR &&
      /no-es-la-unica-fallida/.test(d.salida) && c.codigo !== 0 && filasActivacion(PROD).length === 0, d.salida.slice(-300));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("El fallo: la activación choca con el candado");
  const B = await crearBase(`${PREFIJO}b`, PROD);
  r = await deployBloqueado(B, schema43);
  ok("migrate deploy sale con error", r.codigo !== 0);
  ok("P3018, SQLSTATE 55P03, lock timeout, en la activación", /P3018/.test(r.salida) && /55P03/.test(r.salida) &&
    /lock timeout/.test(r.salida) && r.salida.includes(`Migration name: ${ACT}`), r.salida.slice(-400));
  ok("la activación quedó con un intento fallido, sin pasos", JSON.stringify(filasActivacion(B)) === JSON.stringify([{ terminada: false, revertida: false, pasos: 0 }]));
  ok("libro vacío: ni versiones, ni fila de activación, ni triggers", JSON.stringify(libro(B)) === LIBRO_VACIO, JSON.stringify(libro(B)));
  ok("libro_costo_estado(): INTENTO_FALLIDO", estado(B).estado === "INTENTO_FALLIDO", JSON.stringify(estado(B)));
  const agregados = [...catalogo(B)].filter((x) => !catalogoPrevio.has(x));
  ok("el esquema no ganó ningún objeto", agregados.length === 0, agregados.join(", "));
  ok("ProductoBase y ProductoLocal idénticas (huella del libro)", huella(B) === huellaPrevia);
  const FALLO = await crearBase(`${PREFIJO}fallo`, B);

  r = prisma(["migrate", "deploy"], B, schema43);
  ok("un segundo deploy sin recuperar se niega: P3009", r.codigo !== 0 && /P3009/.test(r.salida), r.salida.slice(-300));

  seccion("Diagnóstico y recuperación tipada");
  let d = diagnostico(B, "recuperar");
  ok("diagnóstico: CASO_1_RECUPERABLE, código 0", d.codigo === 0 && d.resultado === RESULTADO.RECUPERABLE, d.salida.slice(-700));
  ok("con las ocho condiciones en verde y sin aviso de segundo fallo", (d.salida.match(/✓ [1-8]\./g) || []).length === 8 && !/SEGUNDO FALLO/.test(d.salida));
  d = diagnostico(B, "revertida");
  ok("en modo revertida, ANTES del resolve: FRENAR (todavía hay una sin resolver)", d.codigo !== 0 && d.resultado === RESULTADO.FRENAR);

  let c = cadenaLocal(B, schema43);
  ok("la cadena diagnóstico && resolve --rolled-back sale con 0", c.codigo === 0, c.salida.slice(-400));
  ok("el intento quedó REVERTIDO, sin pasos, y NO figura como aplicado", JSON.stringify(filasActivacion(B)) === JSON.stringify([{ terminada: false, revertida: true, pasos: 0 }]));
  d = diagnostico(B, "revertida");
  ok("diagnóstico en modo revertida: REVERTIDA_LIMPIA", d.codigo === 0 && d.resultado === RESULTADO.REVERTIDA, d.salida.slice(-500));
  const e = estado(B);
  ok("libro_costo_estado(): NO_ACTIVADO, con un intento revertido contado", e.estado === "NO_ACTIVADO" && e.intentos_revertidos === 1, JSON.stringify(e));
  ok("el libro sigue vacío: la recuperación NO activó nada", JSON.stringify(libro(B)) === LIBRO_VACIO);

  seccion("Reintento por el camino normal, sin bloqueo");
  r = prisma(["migrate", "deploy"], B, schema43);
  ok("migrate deploy aplica SOLO la activación", r.codigo === 0 && (r.salida.match(/Applying migration/g) || []).length === 1 &&
    r.salida.includes(`Applying migration \`${ACT}\``), r.salida.slice(-300));
  const act = estado(B);
  ok("ACTIVADO, con las 300 bases y las 900 ubicaciones en el punto cero", act.estado === "ACTIVADO" && /300 bases y 900 ubicaciones/.test(act.detalle), JSON.stringify(act));
  ok("seis triggers y una fila de activación", JSON.stringify(libro(B)) === JSON.stringify({ base: 300, ubicacion: 900, activacion: 1, triggers: 6 }));
  ok("el intento revertido queda aparte y el bueno, terminado", JSON.stringify(filasActivacion(B)) ===
    JSON.stringify([{ terminada: false, revertida: true, pasos: 0 }, { terminada: true, revertida: false, pasos: 1 }]));
  d = diagnostico(B, "recuperar");
  ok("con el libro activado, el diagnóstico dice FRENAR: no hay nada que recuperar", d.codigo !== 0 && d.resultado === RESULTADO.FRENAR);
  ok("y la cadena no resuelve nada", cadenaLocal(B, schema43).codigo !== 0 && filasActivacion(B).length === 2);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("El otro candado de la activación: las tablas del libro");
  {
    // El segundo LOCK TABLE de la función, sobre las tablas del libro, también
    // va antes de la primera escritura: el mismo caso, por el otro lado.
    const L = await crearBase(`${PREFIJO}l`, PROD);
    r = await deployBloqueado(L, schema43, `LOCK TABLE "CostoBaseVersion" IN ROW SHARE MODE`, "CostoBaseVersion", "RowShareLock");
    ok("falla por lock timeout en el LOCK TABLE de las tablas del libro", r.codigo !== 0 && /55P03/.test(r.salida) &&
      /LOCK TABLE \\?"CostoBaseVersion/.test(r.salida), r.salida.slice(-400));
    d = diagnostico(L, "recuperar");
    ok("también es CASO_1_RECUPERABLE", d.resultado === RESULTADO.RECUPERABLE, d.salida.slice(-400));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("Doble fallo: timeout → recuperación → timeout otra vez");
  {
    const G = await crearBase(`${PREFIJO}g`, PROD);
    await deployBloqueado(G, schema43);
    ok("primer fallo recuperado", cadenaLocal(G, schema43).codigo === 0);
    r = await deployBloqueado(G, schema43);
    ok("el segundo intento vuelve a fallar por el candado", r.codigo !== 0 && /55P03/.test(r.salida));
    d = diagnostico(G, "recuperar");
    ok("el diagnóstico sigue siendo CASO_1_RECUPERABLE y AVISA que es un segundo fallo",
      d.resultado === RESULTADO.RECUPERABLE && /SEGUNDO FALLO/.test(d.salida) && /ya revertidos antes: 1/.test(d.salida));
    ok("la recuperación deja el registro sin bloquear", cadenaLocal(G, schema43).codigo === 0 &&
      sql(G, `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`) === "0");
    d = diagnostico(G, "revertida");
    ok("REVERTIDA_LIMPIA con los dos intentos revertidos: la ventana se cierra acá (regla del runbook)",
      d.resultado === RESULTADO.REVERTIDA && estado(G).intentos_revertidos === 2 && filasActivacion(G).every((f) => f.revertida && !f.terminada));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("Contrapruebas: el diagnóstico FRENA y la cadena NO resuelve");
  // Cada caso parte del fallo real de arriba y le cambia UNA cosa. Escribir en
  // `_prisma_migrations` o en el libro acá es preparar el ESTADO que se quiere
  // diagnosticar, sobre una base descartable; el fallo en sí es siempre el real.
  const ACTIVANDO = `SET LOCAL erpazul.libro_costo_activando = 'si'`;
  const CASOS = [
    ["logs sin 55P03", `UPDATE "_prisma_migrations" SET logs = replace(logs, '55P03', 'XXXXX') WHERE migration_name = '${ACT}'`, "sin-55P03"],
    ["logs sin «lock timeout»", `UPDATE "_prisma_migrations" SET logs = replace(logs, 'lock timeout', 'otra cosa') WHERE migration_name = '${ACT}'`, "sin-lock-timeout-de-la-activacion"],
    ["un lock timeout que no es de libro_costo_activar()", `UPDATE "_prisma_migrations" SET logs = replace(logs, 'libro_costo_activar', 'otra_funcion') WHERE migration_name = '${ACT}'`, "sin-lock-timeout-de-la-activacion"],
    ["applied_steps_count distinto de 0", `UPDATE "_prisma_migrations" SET applied_steps_count = 1 WHERE migration_name = '${ACT}'`, "ultimo-intento-no-es-un-fallo-sin-pasos"],
    ["el intento es de OTRO archivo (checksum)", `UPDATE "_prisma_migrations" SET checksum = md5(checksum) WHERE migration_name = '${ACT}'`, "checksum-distinto"],
    ["otra migración fallida además de la activación", `INSERT INTO "_prisma_migrations"(id, checksum, migration_name, started_at, applied_steps_count) VALUES ('x', 'x', '20261001000000_otra', now(), 0)`, "no-es-la-unica-fallida"],
    ["la instalación no está aplicada", `UPDATE "_prisma_migrations" SET rolled_back_at = now(), finished_at = NULL WHERE migration_name = '${INSTALACION}'`, "anteriores-sin-aplicar"],
    ["la instalación aplicada es otro archivo", `UPDATE "_prisma_migrations" SET checksum = md5(checksum) WHERE migration_name = '${INSTALACION}'`, "anteriores-sin-aplicar"],
    ["una versión en el libro", `BEGIN; ${ACTIVANDO}; INSERT INTO "CostoBaseVersion" ("version","productoBaseId","grupoId","tipo","instante","dia","precioCosto","unidadMedida","pesoEsFijo","modoCompraProveedor","modoVentaDeposito","esCombo","origen","txid") VALUES (1,1,1,'PUNTO_CERO',now(),current_date,1,'unidad',false,'BULTO','PESO',false,'X',1); COMMIT`, "restos-de-activacion"],
    ["una fila de activación", `BEGIN; ${ACTIVANDO}; INSERT INTO "LibroCostoActivacion" VALUES (1, now(), current_date, 1, 1, 2, 0, 0, 'x', 'x'); COMMIT`, "restos-de-activacion"],
    ["un trigger de captura", `CREATE TRIGGER "ProductoBase_costo_version" AFTER INSERT ON "ProductoBase" FOR EACH ROW EXECUTE FUNCTION "libro_costo_base_registrar"()`, "restos-de-activacion"],
    ["un trigger de captura con otro nombre", `CREATE TRIGGER "otro_nombre" AFTER UPDATE ON "ProductoLocal" FOR EACH ROW EXECUTE FUNCTION "libro_costo_ubicacion_registrar"()`, "restos-de-activacion"],
    ["un trigger contra TRUNCATE", `CREATE TRIGGER "LibroCostoActivacion_sin_truncate" BEFORE TRUNCATE ON "LibroCostoActivacion" FOR EACH STATEMENT EXECUTE FUNCTION "libro_costo_inmutable"()`, "restos-de-activacion"],
    ["la activación figura aplicada (el estado que deja --applied)", `UPDATE "_prisma_migrations" SET finished_at = now() WHERE migration_name = '${ACT}'`, "no-es-la-unica-fallida"],
    ["una fila de la activación revertida Y terminada", `UPDATE "_prisma_migrations" SET finished_at = now(), rolled_back_at = now() WHERE migration_name = '${ACT}'; INSERT INTO "_prisma_migrations"(id, checksum, migration_name, started_at, applied_steps_count, logs) SELECT 'y', checksum, migration_name, now(), 0, logs FROM "_prisma_migrations" WHERE migration_name = '${ACT}'`, "registro-de-la-activacion-incoherente"],
  ];
  let n = 0;
  for (const [nombre, preparar, clave] of CASOS) {
    const db = await crearBase(`${PREFIJO}c${++n}`, FALLO);
    sql(db, preparar);
    const antes = JSON.stringify(filasActivacion(db));
    d = diagnostico(db, "recuperar");
    const cad = cadenaLocal(db, schema43);
    ok(`${nombre}: FRENAR (${clave}) y el resolve NO corrió`,
      d.codigo !== 0 && d.resultado === RESULTADO.FRENAR && d.salida.includes(clave) &&
        cad.codigo !== 0 && JSON.stringify(filasActivacion(db)) === antes,
      `${d.resultado} ${d.salida.match(/RESULTADO:[^\n]*/)?.[0] ?? ""}`);
  }

  {
    // Otra migración fallida SOLA, sin que la activación se haya intentado: no
    // se toca, y tampoco se resuelve la activación.
    const db = await crearBase(`${PREFIJO}otra`, PROD);
    sql(db, `INSERT INTO "_prisma_migrations"(id, checksum, migration_name, started_at, applied_steps_count, logs) VALUES ('z', 'z', '20261001000000_otra', now(), 0, 'Database error code: 55P03 lock timeout')`);
    d = diagnostico(db, "recuperar");
    const cad = cadenaLocal(db, schema43);
    ok("otra migración fallida sola: FRENAR, y ni ella ni la activación se resuelven",
      d.resultado === RESULTADO.FRENAR && cad.codigo !== 0 && filasActivacion(db).length === 0 &&
        sql(db, `SELECT count(*) FROM "_prisma_migrations" WHERE migration_name = '20261001000000_otra' AND rolled_back_at IS NULL`) === "1");
  }

  {
    // Una falla SQL que NO es el candado, real, a mitad de la activación. El
    // estado del libro dice INTENTO_FALLIDO igual —no mira la causa—: por eso el
    // diagnóstico no se apoya solo en él.
    const db = await crearBase(`${PREFIJO}sql`, PROD);
    sql(db, `CREATE FUNCTION prueba_falla() RETURNS event_trigger LANGUAGE plpgsql AS $f$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_event_trigger_ddl_commands() WHERE object_identity LIKE '%Local_costo_version%') THEN
          RAISE EXCEPTION 'FALLA DISTINTA INYECTADA'; END IF; END $f$;
      CREATE EVENT TRIGGER prueba_falla ON ddl_command_end WHEN TAG IN ('CREATE TRIGGER') EXECUTE FUNCTION prueba_falla();`);
    r = prisma(["migrate", "deploy"], db, schema43);
    d = diagnostico(db, "recuperar");
    const cad = cadenaLocal(db, schema43);
    ok("una falla SQL distinta, real: el estado dice INTENTO_FALLIDO, el diagnóstico FRENAR y el resolve NO corrió",
      r.codigo !== 0 && /FALLA DISTINTA INYECTADA/.test(r.salida) && estado(db).estado === "INTENTO_FALLIDO" &&
        d.resultado === RESULTADO.FRENAR && /sin-55P03/.test(d.salida) && cad.codigo !== 0 &&
        JSON.stringify(filasActivacion(db)) === JSON.stringify([{ terminada: false, revertida: false, pasos: 0 }]));
  }

  {
    // Por qué la guardia exige `&&` y rechaza `;`: con `;` el resolve corre igual.
    const db = await crearBase(`${PREFIJO}pyc`, FALLO);
    sql(db, CASOS[0][1]);
    const cad = cadenaLocal(db, schema43, ";");
    ok("con `;` en vez de `&&`, el resolve CORRE aunque el diagnóstico diga FRENAR (por eso la guardia exige el comando exacto)",
      filasActivacion(db).at(-1)?.revertida === true, cad.cadena);
  }

  {
    // --applied: el registro miente, y nada lo vuelve a intentar.
    const db = await crearBase(`${PREFIJO}applied`, FALLO);
    prisma(["migrate", "resolve", "--applied", ACT], db, schema43);
    r = prisma(["migrate", "deploy"], db, schema43);
    ok("--applied: el deploy dice «No pending migrations» y el libro NO se activa", /No pending migrations/i.test(r.salida) &&
      JSON.stringify(libro(db)) === LIBRO_VACIO);
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
