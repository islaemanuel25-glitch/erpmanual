// PRUEBA DE BASE DE LA MIGRACIÓN `20261002120000_caja_por_operador` Y SU PRECHECK.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/migracionCajaPorOperador.mjs
//
// Por el camino REAL de Prisma (`migrate deploy`), sobre bases descartables que
// están como producción ANTES de la migración —todas las anteriores aplicadas,
// ésta no—:
//
//   · LIMPIA: aplica; quedan los dos índices nuevos, el viejo no, y la tabla
//     `Turno` idéntica fila por fila (no escribe datos).
//   · CON CONFLICTO —el mismo operador con dos cajas operativas en el mismo
//     local, entrando con dos cuentas—: la guardia aborta nombrando los turnos;
//     el índice viejo sigue, los nuevos no existen, `Turno` idéntica.
//   · CON UN CANDADO RETENIDO sobre `Turno` por otra sesión: el tope de 3 s la
//     hace fallar rápido en vez de quedar esperando; el índice viejo sigue, los
//     nuevos no existen, `Turno` idéntica.
//
// Y el precheck de solo lectura sobre esas mismas bases: VERDE limpia, ROJO con
// conflicto, ROJO con el candado, y la ADVERTENCIA —sin frenar— de una caja
// abierta sin operador en un local que exige operador.
//
// No hay recuperación automática que probar: una migración fallida frena el
// despliegue (ver docs/deploy/MIGRACIONES-SIN-APLICAR.md).
//
// El arnés es el de scripts/pruebas-db/recuperacionLibroStock.mjs: bases
// `erpazul_cpo_prueba_*` creadas al lado de la de DATABASE_URL y borradas al
// final. Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const fs = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");
const { spawn, spawnSync } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRACION = "20261002120000_caja_por_operador";
const PRECHECK = "scripts/deploy/precheck-caja-por-operador.sql";
const PREFIJO = "erpazul_cpo_prueba_";
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

/** Un directorio prisma con el schema y las migraciones, sin las excluidas. */
function dirPrisma(excluir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpo-"));
  const d = path.join(dir, "prisma");
  fs.mkdirSync(path.join(d, "migrations"), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, "prisma/schema.prisma"), path.join(d, "schema.prisma"));
  for (const e of fs.readdirSync(path.join(RAIZ, "prisma/migrations"), { withFileTypes: true })) {
    if (excluir.includes(e.name)) continue;
    fs.cpSync(path.join(RAIZ, "prisma/migrations", e.name), path.join(d, "migrations", e.name), { recursive: true });
  }
  return path.join(d, "schema.prisma");
}

function prisma(args, db, schema) {
  const r = spawnSync("npx", ["prisma", ...args, "--schema", schema], {
    cwd: RAIZ, encoding: "utf8", env: { ...process.env, DATABASE_URL: urlDe(db) },
  });
  return { codigo: r.status, salida: `${r.stdout}\n${r.stderr}` };
}

function precheck(db) {
  const r = spawnSync("sh", ["-c", `psql '${urlDe(db)}' -X -q -v ON_ERROR_STOP=1 -f - < ${PRECHECK}`], { cwd: RAIZ, encoding: "utf8" });
  return { codigo: r.status, salida: `${r.stdout}\n${r.stderr}` };
}

/** Una sesión que retiene `Turno` como lo retiene un FOR UPDATE, durante N segundos. */
function retenerTurno(db, segundos) {
  return new Promise((resolve) => {
    const h = spawn("psql", [urlDe(db), "-X", "-q", "-c",
      `BEGIN; LOCK TABLE "Turno" IN ROW SHARE MODE; SELECT pg_sleep(${segundos}); ROLLBACK;`]);
    h.on("close", resolve);
  });
}

async function esperarCandado(db) {
  for (let i = 0; i < 50; i += 1) {
    const n = sql(db, `SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
      WHERE l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND c.relname = 'Turno' AND l.mode = 'RowShareLock' AND l.granted AND l.pid <> pg_backend_pid()`);
    if (n !== "0") return;
    await esperar(100);
  }
  throw new Error("nadie tomó RowShareLock sobre Turno en 5 s");
}

// Por nombre exacto: en un LIKE el `_` es comodín y 'Turno_local_%' también
// agarra los `Turno_localId_*`, que no son de esta migración.
const indices = (db) => sql(db, `SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes
  WHERE tablename = 'Turno' AND indexname IN (
    'Turno_local_vendedor_abierto_key', 'Turno_local_operador_abierto_key',
    'Turno_local_cuenta_sin_operador_abierto_key')`).split(",").filter(Boolean);
const huellaTurno = (db) => sql(db, `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) FROM "Turno" t`);
const filaMigracion = (db) => JSON.parse(sql(db, `SELECT coalesce(json_agg(json_build_object(
    'terminada', finished_at IS NOT NULL, 'revertida', rolled_back_at IS NOT NULL)), '[]')
  FROM "_prisma_migrations" WHERE migration_name = '${MIGRACION}'`));

const VIEJO = "Turno_local_vendedor_abierto_key";
const NUEVOS = ["Turno_local_cuenta_sin_operador_abierto_key", "Turno_local_operador_abierto_key"];

/**
 * Siembra lo mínimo: un local que exige operador, dos cuentas, un operador, y
 * los turnos que pida el caso. Con el cliente de la fábrica, no con SQL suelto.
 */
async function sembrar(db, { conflicto = false, cajaSinOperador = false } = {}) {
  const c = await crearClientePrisma({ nivel: ESCRITURA, url: urlDe(db) });
  try {
    const rol = await c.rol.create({ data: { nombre: "cpo-rol", permisos: ["pos.usar"] } });
    const local = await c.local.create({ data: { nombre: "cpo-local", tipo: "local" } });
    await c.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true } });
    const cuenta1 = await c.usuario.create({ data: { nombre: "c1", email: "cpo1@x", passwordHash: "x", rolId: rol.id, localId: local.id } });
    const cuenta2 = await c.usuario.create({ data: { nombre: "c2", email: "cpo2@x", passwordHash: "x", rolId: rol.id, localId: local.id } });
    const op = await c.operadorLocal.create({ data: { nombre: "cpo-op", pinHash: "x" } });
    await c.turno.create({ data: { localId: local.id, vendedorId: cuenta1.id, operadorId: op.id, montoInicial: 1000 } });
    // Un turno ya cerrado del mismo operador: no cuenta como operativo.
    await c.turno.create({ data: { localId: local.id, vendedorId: cuenta2.id, operadorId: op.id, montoInicial: 0, cierre: new Date() } });
    if (conflicto) {
      // Lo que el índice viejo permitía: el mismo operador, otra cuenta, abierto.
      await c.turno.create({ data: { localId: local.id, vendedorId: cuenta2.id, operadorId: op.id, montoInicial: 0 } });
    }
    if (cajaSinOperador) {
      await c.turno.create({ data: { localId: local.id, vendedorId: cuenta2.id, montoInicial: 0 } });
    }
  } finally {
    await c.$disconnect();
  }
}

// ════════════════════════════════════════════════════════════════════════════

try {
  const schemaAntes = dirPrisma([MIGRACION]);
  const schemaCon = dirPrisma([]);

  seccion("Plantilla: todas las migraciones anteriores, ésta no");
  const PLANTILLA = await crearBase(`${PREFIJO}plantilla`);
  let r = prisma(["migrate", "deploy"], PLANTILLA, schemaAntes);
  ok("migrate deploy sin la migración nueva", r.codigo === 0, r.salida.slice(-300));
  ok("la plantilla tiene el índice viejo y ninguno nuevo", JSON.stringify(indices(PLANTILLA)) === JSON.stringify([VIEJO]),
    JSON.stringify(indices(PLANTILLA)));

  // ── LIMPIA ──────────────────────────────────────────────────────────────
  seccion("Limpia: aplica, cambia los índices y no toca una fila");
  const LIMPIA = await crearBase(`${PREFIJO}limpia`, PLANTILLA);
  await sembrar(LIMPIA, { cajaSinOperador: true });
  r = precheck(LIMPIA);
  ok("precheck: VERDE", r.codigo === 0 && r.salida.includes("PRECHECK: VERDE"), r.salida.slice(-400));
  ok("precheck: advierte la caja abierta sin operador en un local que exige operador, sin frenar",
    r.salida.includes("⚠ REVISAR ANTES DE DESPLEGAR") && r.salida.includes("solo Admin o el Dueño"), r.salida.slice(-400));
  const antesLimpia = huellaTurno(LIMPIA);
  r = prisma(["migrate", "deploy"], LIMPIA, schemaCon);
  ok("migrate deploy aplica la migración", r.codigo === 0 && r.salida.includes(`Applying migration \`${MIGRACION}\``), r.salida.slice(-300));
  ok("quedan los dos índices nuevos y no el viejo", JSON.stringify(indices(LIMPIA)) === JSON.stringify(NUEVOS), JSON.stringify(indices(LIMPIA)));
  ok("Turno idéntica fila por fila", huellaTurno(LIMPIA) === antesLimpia);

  // ── CONFLICTO ───────────────────────────────────────────────────────────
  seccion("Conflicto: el mismo operador con dos cajas abiertas");
  const CONFLICTO = await crearBase(`${PREFIJO}conflicto`, PLANTILLA);
  await sembrar(CONFLICTO, { conflicto: true });
  r = precheck(CONFLICTO);
  ok("precheck: ROJO, nombrando el conflicto", r.codigo !== 0 && r.salida.includes("operador-con-dos-cajas"), r.salida.slice(-400));
  const antesConflicto = huellaTurno(CONFLICTO);
  r = prisma(["migrate", "deploy"], CONFLICTO, schemaCon);
  ok("migrate deploy falla", r.codigo !== 0);
  ok("por la guardia, nombrando los turnos", r.salida.includes("caja_por_operador: hay operadores con más de una caja operativa"), r.salida.slice(-400));
  ok("el índice viejo sigue y no existe ninguno nuevo", JSON.stringify(indices(CONFLICTO)) === JSON.stringify([VIEJO]), JSON.stringify(indices(CONFLICTO)));
  ok("Turno idéntica: no eligió ni cerró nada", huellaTurno(CONFLICTO) === antesConflicto);
  ok("queda registrada como fallida, no aplicada", JSON.stringify(filaMigracion(CONFLICTO)) === JSON.stringify([{ terminada: false, revertida: false }]),
    JSON.stringify(filaMigracion(CONFLICTO)));

  // ── CANDADO ─────────────────────────────────────────────────────────────
  seccion("Candado retenido sobre Turno: el tope corta en vez de esperar");
  const CANDADO = await crearBase(`${PREFIJO}candado`, PLANTILLA);
  await sembrar(CANDADO);
  const antesCandado = huellaTurno(CANDADO);
  const retencion = retenerTurno(CANDADO, 30);
  await esperarCandado(CANDADO);
  r = precheck(CANDADO);
  ok("precheck: ROJO por el candado sobre Turno", r.codigo !== 0 && r.salida.includes("candado-sobre-turno"), r.salida.slice(-400));
  const t0 = Date.now();
  r = prisma(["migrate", "deploy"], CANDADO, schemaCon);
  const segundos = (Date.now() - t0) / 1000;
  ok("migrate deploy falla", r.codigo !== 0);
  ok("por el tope de espera (lock timeout), no por otra cosa", /lock timeout|55P03/i.test(r.salida), r.salida.slice(-400));
  ok(`y falla rápido: ${segundos.toFixed(1)} s, con la otra sesión reteniendo 30 s`, segundos < 20);
  await retencion;
  ok("el índice viejo sigue y no existe ninguno nuevo", JSON.stringify(indices(CANDADO)) === JSON.stringify([VIEJO]), JSON.stringify(indices(CANDADO)));
  ok("Turno idéntica", huellaTurno(CANDADO) === antesCandado);
} catch (e) {
  fallas.push(`excepción: ${e.message}`);
  console.error(e);
} finally {
  for (const db of creadas) {
    await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`).catch(() => {});
  }
  await principal.$disconnect();
}

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
