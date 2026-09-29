// PRUEBA DE BASE DEL LIBRO HISTÓRICO FÍSICO DE STOCK.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/libroStock.mjs
//
// Ejerce contra PostgreSQL lo que ni el build ni los candados pueden ver, y es la
// condición de aceptación de la migración `20260927120000_libro_stock`:
//
//   A. la ACTIVACIÓN es atómica: una falla a mitad no deja nada, ni por el camino
//      de Prisma ni ejecutando el bloque DO solo;
//   B. una CARRERA real: escritores concurrentes sobre StockLocal mientras la
//      migración se aplica, y al final ninguna escritura perdida ni hueco;
//   C. cada FORMA de escribir StockLocal queda capturada;
//   D. un ROLLBACK no deja ni el cambio ni el movimiento;
//   E. dos conexiones sobre el MISMO producto: el reloj sigue al candado de fila,
//      y el día argentino se calcula bien en el borde de la medianoche;
//   F. el ORIGEN declarado queda y no contamina otra transacción;
//   G. la BAJA por la ruta real de eliminar producto congela la identidad;
//   H. la REINTERPRETACIÓN de unidad deja evidencia y no toca el stock;
//   I. la CONTRAPRUEBA: con el trigger apagado, el verificador se pone rojo;
//   J. un DUMP plano restaurado conserva tabla, datos, funciones y triggers sin
//      inventar movimientos;
//   K. la BAJA no depende del orden de las sentencias
//      (`20260928180000_libro_stock_baja_atomica`): una sola sentencia que borra
//      el StockLocal y su ProductoLocal, o re-vincula la fila, deja su BAJA
//      completa; y si no puede, la sentencia falla en vez de perder la fila.
//
// ── DÓNDE CORRE CADA COSA ──────────────────────────────────────────────────
//
// C a H corren sobre la base de DATABASE_URL, que tiene que tener el libro
// instalado (en CI: `migrate deploy` desde cero). A, B, I y J necesitan bases
// descartables —hay que aplicar la migración sobre una base SIN libro, apagar un
// trigger, restaurar un dump— y se crean al lado, en el mismo servidor, con el
// prefijo `erpazul_libro_prueba_`. Se borran al terminar pase lo que pase.
//
// La migración se aplica con `prisma migrate dev` sobre un directorio temporal:
// es el mismo motor de Prisma que aplica las migraciones en el despliegue, y es
// el comando de desarrollo. `migrate deploy` lo reserva la guardia para
// producción, y la CI ya lo corre desde cero en su propio paso.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const fs = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");
const { spawn, spawnSync, execFileSync } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");
const jwt = (await import("jsonwebtoken")).default;

const { declararOrigenDeStock, SIN_ORIGEN, ORIGEN_ACTIVACION, TRIGGERS_OBLIGATORIOS } = await import(
  "../../lib/stock/libro/libroStock.js"
);
const { verificarLibroStock, informeDelLibro } = await import("../../lib/stock/libro/verificador.js");
const { fechaArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOMBRE_MIGRACION = "20260927120000_libro_stock";
const SQL_MIGRACION = fs.readFileSync(
  path.join(RAIZ, "prisma", "migrations", NOMBRE_MIGRACION, "migration.sql"),
  "utf8"
);
const PREFIJO = "erpazul_libro_prueba_";
const FILAS_CARRERA = Number(process.env.LIBRO_FILAS_CARRERA || 30000);

let pasadas = 0;
const fallas = [];
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${titulo}`);
    return;
  }
  const m = `${titulo}${detalle ? ` — ${detalle}` : ""}`;
  fallas.push(m);
  console.log(`  ✗ ${m}`);
}
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ════════════════════════════════════════════════════════════════════════════
// Bases descartables
// ════════════════════════════════════════════════════════════════════════════

const URL_BASE = new URL(process.env.DATABASE_URL);
const urlDe = (base) => {
  const u = new URL(URL_BASE);
  u.pathname = `/${base}`;
  return u.toString();
};
const creadas = new Set();

async function crearBase(nombre, plantilla = null) {
  if (!nombre.startsWith(PREFIJO)) throw new Error(`nombre de base de prueba inválido: ${nombre}`);
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(
    `CREATE DATABASE "${nombre}"${plantilla ? ` TEMPLATE "${plantilla}"` : ""}`
  );
  creadas.add(nombre);
  return urlDe(nombre);
}

async function borrarBases() {
  for (const nombre of creadas) {
    if (!nombre.startsWith(PREFIJO)) continue;
    await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`).catch(() => {});
  }
}

const clientes = [];
async function clienteDe(url) {
  const c = await crearClientePrisma({ nivel: ESCRITURA, url });
  clientes.push({ url, c });
  return c;
}

/** Una base solo sirve de plantilla sin conexiones abiertas. */
async function soltarClientes(url) {
  for (const x of clientes.filter((y) => y.url === url)) await x.c.$disconnect();
}

function psql(url, args, { permitirFalla = false } = {}) {
  try {
    return { ok: true, salida: execFileSync("psql", [url, "-X", "-q", ...args], { encoding: "utf8", stdio: "pipe" }) };
  } catch (err) {
    if (!permitirFalla) throw err;
    return { ok: false, salida: `${err.stdout || ""}${err.stderr || ""}` };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Un directorio de Prisma temporal: con o sin el libro
// ════════════════════════════════════════════════════════════════════════════
//
// SIN el libro, el schema es el real con el bloque del libro recortado, y las
// migraciones son todas menos la del libro. Así `migrate dev` construye la base
// tal como está producción hoy.

const SCHEMA_REAL = fs.readFileSync(path.join(RAIZ, "prisma", "schema.prisma"), "utf8");

function schemaSinLibro() {
  const inicio = SCHEMA_REAL.indexOf("// LIBRO HISTÓRICO FÍSICO DE STOCK");
  const fin = SCHEMA_REAL.indexOf("// COMBOS EXCLUSIVOS POR LOCAL (E1)");
  if (inicio < 0 || fin < 0 || fin < inicio) throw new Error("no encontré el bloque del libro en schema.prisma");
  const desde = SCHEMA_REAL.lastIndexOf("// ----", inicio);
  const hasta = SCHEMA_REAL.lastIndexOf("// ----", fin);
  const recortado = SCHEMA_REAL.slice(0, desde) + SCHEMA_REAL.slice(hasta);
  if (/MovimientoStock|ReinterpretacionDeStock/.test(recortado)) throw new Error("el recorte dejó modelos del libro");
  return recortado;
}

function dirPrisma(conLibro, { soloHastaElLibro = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "erpazul-libro-"));
  const destino = path.join(dir, "prisma");
  fs.mkdirSync(path.join(destino, "migrations"), { recursive: true });
  fs.writeFileSync(path.join(destino, "schema.prisma"), conLibro ? SCHEMA_REAL : schemaSinLibro());
  const origen = path.join(RAIZ, "prisma", "migrations");
  for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
    // Sin el libro es SIN el libro ni lo que cuelga de él: las migraciones
    // posteriores (el índice del Stock Diario, la BAJA atómica) crean objetos
    // sobre sus tablas y sus funciones.
    if (!conLibro && e.isDirectory() && e.name >= NOMBRE_MIGRACION) continue;
    // El libro tal como se desplegó el 2026-09-28, sin las correcciones
    // posteriores: es la base donde la contraprueba de la K reproduce el defecto.
    if (soloHastaElLibro && e.isDirectory() && e.name > NOMBRE_MIGRACION) continue;
    fs.cpSync(path.join(origen, e.name), path.join(destino, "migrations", e.name), { recursive: true });
  }
  return path.join(destino, "schema.prisma");
}

/**
 * Aplica las migraciones PENDIENTES sin comparar contra el schema, que es lo que
 * hace el despliegue. Hace falta para el libro "tal como se desplegó": su árbol
 * termina en el libro, pero `schema.prisma` ya trae lo posterior (el índice del
 * Stock Diario), y `migrate dev` vería esa diferencia como una migración por
 * crear y se quedaría esperando un nombre. `recuperacionLibroStock.mjs` lo usa
 * igual, sobre bases descartables.
 */
function aplicarPendientes(schema, url) {
  const r = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", schema], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    timeout: 240_000,
  });
  return { codigo: r.status, salida: `${r.stdout || ""}${r.stderr || ""}` };
}

/** `prisma migrate dev` sin generar ni sembrar, asincrónico: la carrera corre mientras. */
function migrateDev(schema, url) {
  return new Promise((resolve) => {
    const hijo = spawn("npx", ["prisma", "migrate", "dev", "--schema", schema, "--skip-generate", "--skip-seed"], {
      cwd: RAIZ,
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let salida = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (salida += d));
    const reloj = setTimeout(() => hijo.kill("SIGKILL"), 240_000);
    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      resolve({ codigo, salida });
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Estado del libro en una base
// ════════════════════════════════════════════════════════════════════════════

const NOMBRES_TRIGGERS = TRIGGERS_OBLIGATORIOS.map((t) => t.nombre);

async function objetosDelLibro(c) {
  const [r] = await c.$queryRaw`
    SELECT
      (SELECT count(*)::int FROM pg_tables WHERE schemaname = current_schema() AND tablename IN ('MovimientoStock','ReinterpretacionDeStock')) AS "tablas",
      (SELECT count(*)::int FROM pg_type WHERE typname = 'TipoMovimientoStock') AS "tipos",
      (SELECT count(*)::int FROM pg_proc WHERE proname LIKE 'libro_stock%') AS "funciones",
      (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY(${NOMBRES_TRIGGERS})) AS "triggers"
  `;
  return r;
}

async function estadoMigracion(c) {
  const filas = await c.$queryRaw`
    SELECT finished_at IS NOT NULL AS "terminada", rolled_back_at IS NOT NULL AS "revertida"
    FROM "_prisma_migrations" WHERE migration_name = ${NOMBRE_MIGRACION}`;
  return filas[0] ?? null;
}

async function contar(c, where = "TRUE") {
  const [r] = await c.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "MovimientoStock" WHERE ${where}`);
  return r.n;
}

// Una falla inyectada a mitad del bloque DO: cuando se crea el ÚLTIMO trigger de
// la activación, un event trigger aborta. Para ese momento ya existen los dos
// triggers anteriores. Solo en la base descartable.
const SQL_FALLA_INYECTADA = `
  CREATE FUNCTION prueba_falla_inyectada() RETURNS event_trigger LANGUAGE plpgsql AS $f$
  BEGIN
    -- PostgreSQL identifica al trigger como '"Local_libro_reinterpretacion" on
    -- public."Local"', CON comillas. Un LIKE sin el % inicial no engancha nunca y
    -- la falla no se inyecta: por eso las pruebas de abajo exigen ver el mensaje.
    IF EXISTS (SELECT 1 FROM pg_event_trigger_ddl_commands() WHERE object_identity LIKE '%Local_libro_reinterpretacion%') THEN
      RAISE EXCEPTION 'FALLA INYECTADA despues de crear dos triggers';
    END IF;
  END $f$;
  CREATE EVENT TRIGGER prueba_falla_inyectada ON ddl_command_end WHEN TAG IN ('CREATE TRIGGER')
    EXECUTE FUNCTION prueba_falla_inyectada();
`;

// ════════════════════════════════════════════════════════════════════════════
// Siembra de una base descartable SIN libro
// ════════════════════════════════════════════════════════════════════════════

async function sembrar(c, productos) {
  await c.$executeRawUnsafe(`INSERT INTO "Grupo" ("nombre", "updatedAt") VALUES ('Grupo prueba libro', now())`);
  await c.$executeRawUnsafe(`
    INSERT INTO "Local" ("nombre", "es_deposito", "updatedAt")
    VALUES ('Libro A', false, now()), ('Libro B', false, now()), ('Libro Deposito', true, now())`);
  await c.$executeRawUnsafe(`
    INSERT INTO "ProductoBase" ("grupoId", "nombre", "codigo_barra", "unidad_medida", "precio_costo", "precio_venta", "updatedAt")
    SELECT (SELECT min(id) FROM "Grupo"), 'Producto libro ' || i, 'LB' || i, 'unidad', 1, 2, now()
    FROM generate_series(1, ${Math.ceil(productos / 3)}) i`);
  await c.$executeRawUnsafe(`
    INSERT INTO "ProductoLocal" ("localId", "baseId", "updatedAt")
    SELECT l.id, pb.id, now() FROM "Local" l CROSS JOIN "ProductoBase" pb`);
  // Uno de cada cincuenta ProductoLocal queda SIN fila de stock: son los que la
  // carrera usa para dar altas. Cantidades variadas, con ceros y con tránsito.
  await c.$executeRawUnsafe(`
    INSERT INTO "StockLocal" ("localId", "productoId", "cantidad", "enTransito", "updatedAt")
    SELECT pl."localId", pl.id, (pl.id % 7), CASE WHEN pl.id % 11 = 0 THEN 2.5 ELSE 0 END, now()
    FROM "ProductoLocal" pl WHERE pl.id % 50 <> 0`);
}

// ════════════════════════════════════════════════════════════════════════════
// Datos propios sobre la base principal (C a H)
// ════════════════════════════════════════════════════════════════════════════

const MARCA = `LIBRO-${Date.now()}`;
const propios = { grupo: null, locales: [], bases: [] };

async function sembrarPrincipal() {
  const grupo = await principal.grupo.create({ data: { nombre: `${MARCA} grupo` } });
  propios.grupo = grupo.id;
  for (const [nombre, dep] of [["A", false], ["B", false]]) {
    const l = await principal.local.create({ data: { nombre: `${MARCA} ${nombre}`, es_deposito: dep } });
    propios.locales.push(l.id);
  }
}

async function nuevoProducto(sufijo, { stock = null } = {}) {
  const base = await principal.productoBase.create({
    data: {
      grupoId: propios.grupo,
      nombre: `${MARCA} ${sufijo}`,
      codigo_barra: `${MARCA}-${sufijo}`,
      unidad_medida: "unidad",
      precio_costo: 1,
      precio_venta: 2,
    },
  });
  propios.bases.push(base.id);
  const pls = [];
  for (const localId of propios.locales) {
    pls.push(await principal.productoLocal.create({ data: { localId, baseId: base.id } }));
  }
  if (stock !== null) {
    for (const pl of pls) {
      await principal.stockLocal.create({ data: { localId: pl.localId, productoId: pl.id, cantidad: stock } });
    }
  }
  return { base, pls };
}

async function movimientosDe(c, productoLocalId) {
  return c.$queryRaw`
    SELECT "id", "tipo"::text AS "tipo", "stockLocalId", "productoBaseId",
           "cantidadAnterior"::float8 AS "ca", "cantidadPosterior"::float8 AS "cp",
           "enTransitoAnterior"::float8 AS "ta", "enTransitoPosterior"::float8 AS "tp",
           "instante", "dia", "origen", "origenRef",
           "nombreCongelado", "codigoBarraCongelado", "unidadMedidaCongelada"
    FROM "MovimientoStock" WHERE "productoLocalId" = ${productoLocalId} ORDER BY "id"`;
}

const ultimo = (lista) => lista[lista.length - 1];

// ════════════════════════════════════════════════════════════════════════════

try {
  // ── Precondición: la base principal tiene el libro ─────────────────────────
  seccion("Precondición: la base de DATABASE_URL tiene el libro instalado");
  const objPrincipal = await objetosDelLibro(principal);
  ok("las dos tablas, el tipo, las funciones y los cinco triggers", objPrincipal.tablas === 2 && objPrincipal.tipos === 1 && objPrincipal.triggers === TRIGGERS_OBLIGATORIOS.length && objPrincipal.funciones >= 8, JSON.stringify(objPrincipal));
  if (objPrincipal.triggers !== TRIGGERS_OBLIGATORIOS.length) {
    throw new Error("la base de DATABASE_URL no tiene el libro: aplicar las migraciones antes de correr esta prueba");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // A. ACTIVACIÓN ATÓMICA
  // ══════════════════════════════════════════════════════════════════════════
  seccion("A. Base de partida SIN libro, como producción hoy");
  const PLANTILLA = `${PREFIJO}plantilla`;
  const urlPlantilla = await crearBase(PLANTILLA);
  // Con `migrate deploy` y no `migrate dev`: el schema recortado solo le saca el
  // bloque del libro, y todo lo que entró DESPUÉS fuera de ese bloque —los
  // gastos, 2026-09-29— sigue ahí sin su migración. `migrate dev` lo vería como
  // una migración por crear y se quedaría esperando un nombre, que es el caso
  // que `aplicarPendientes` ya resuelve más abajo. Lo que la base tiene que ser
  // —las migraciones previas, ningún objeto del libro— lo afirma el bloque de
  // abajo, no el comando.
  const pre = aplicarPendientes(dirPrisma(false), urlPlantilla);
  ok("migrate deploy construye la base sin el libro", pre.codigo === 0, pre.salida.slice(-400));
  {
    const c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPlantilla });
    await sembrar(c, FILAS_CARRERA);
    const [n] = await c.$queryRaw`SELECT count(*)::int AS n FROM "StockLocal"`;
    const o = await objetosDelLibro(c);
    ok(`sembrada con ${n.n} filas de StockLocal y sin ningún objeto del libro`, n.n > 0 && o.tablas === 0 && o.triggers === 0);
    await c.$disconnect();
  }
  const schemaConLibro = dirPrisma(true);

  seccion("A.1 Falla por el tope de 3 s, por el camino de Prisma");
  {
    const url = await crearBase(`${PREFIJO}a1`, PLANTILLA);
    const tenedor = await clienteDe(url);
    const c = await clienteDe(url);
    // Una transacción larga que escribe StockLocal y no confirma: la migración no
    // consigue su candado.
    let soltar;
    const suelto = new Promise((r) => (soltar = r));
    const retencion = tenedor.$transaction(
      async (tx) => {
        await tx.$executeRaw`UPDATE "StockLocal" SET "cantidad" = "cantidad" + 1 WHERE "id" = (SELECT min("id") FROM "StockLocal")`;
        await suelto;
      },
      { timeout: 120_000, maxWait: 10_000 }
    );
    await esperar(300);
    const t0 = Date.now();
    const r = await migrateDev(schemaConLibro, url);
    const inicioDeFalla = r.salida.indexOf("lock timeout");
    soltar();
    await retencion;
    ok("la migración FALLA", r.codigo !== 0);
    ok("por el tope de espera de la activación", inicioDeFalla >= 0, r.salida.slice(-300));
    const o = await objetosDelLibro(c);
    ok("y no queda NADA del libro: ni tablas, ni tipo, ni funciones, ni triggers", o.tablas === 0 && o.tipos === 0 && o.funciones === 0 && o.triggers === 0, JSON.stringify(o));
    const est = await estadoMigracion(c);
    ok("Prisma la registra como FALLIDA (sin terminar), no como aplicada", est && !est.terminada && !est.revertida, JSON.stringify(est));
    console.log(`     (tardó ${Date.now() - t0} ms en total, con la reconstrucción de la base sombra incluida)`);
  }

  seccion("A.2 Falla a mitad del bloque DO, por el camino de Prisma");
  {
    const url = await crearBase(`${PREFIJO}a2`, PLANTILLA);
    psql(url, ["-v", "ON_ERROR_STOP=1", "-c", SQL_FALLA_INYECTADA]);
    const r = await migrateDev(schemaConLibro, url);
    const c = await clienteDe(url);
    ok("la migración FALLA en la falla inyectada", r.codigo !== 0 && r.salida.includes("FALLA INYECTADA"), r.salida.slice(-300));
    const o = await objetosDelLibro(c);
    ok("y no queda nada, aunque dos triggers ya se habían creado", o.tablas === 0 && o.funciones === 0 && o.triggers === 0, JSON.stringify(o));
  }

  seccion("A.3 El bloque DO SOLO, sin ninguna transacción que lo envuelva");
  {
    // Lo anterior al bloque se ejecuta sentencia por sentencia en autocommit: es el
    // peor caso posible, sin ninguna transacción de Prisma alrededor. La pregunta
    // es si el DO por sí mismo es todo o nada.
    const url = await crearBase(`${PREFIJO}a3`, PLANTILLA);
    const iDo = SQL_MIGRACION.indexOf("-- ACTIVACION:INICIO");
    const fDo = SQL_MIGRACION.indexOf("-- ACTIVACION:FIN");
    ok("la migración tiene el bloque de activación marcado", iDo > 0 && fDo > iDo);
    const previo = SQL_MIGRACION.slice(0, iDo);
    const bloque = SQL_MIGRACION.slice(iDo, fDo);
    const fp = path.join(os.tmpdir(), `libro-previo-${process.pid}.sql`);
    fs.writeFileSync(fp, previo);
    psql(url, ["-v", "ON_ERROR_STOP=1", "-f", fp]);
    fs.rmSync(fp, { force: true });
    const c = await clienteDe(url);
    const [filas] = await c.$queryRaw`SELECT count(*)::int AS n FROM "StockLocal"`;

    // Falla DESPUÉS del estado inicial: un trigger de prueba rechaza la última fila
    // del punto cero, cuando ya se insertaron todas las demás y los tres triggers
    // existen.
    psql(url, ["-v", "ON_ERROR_STOP=1", "-c", `
      CREATE FUNCTION prueba_falla_al_final() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        IF NEW."tipo" = 'ESTADO_INICIAL' AND NEW."stockLocalId" = (SELECT max(id) FROM "StockLocal") THEN
          RAISE EXCEPTION 'FALLA INYECTADA en la ultima fila del punto cero';
        END IF;
        RETURN NEW;
      END $f$;
      CREATE TRIGGER prueba_falla_al_final BEFORE INSERT ON "MovimientoStock"
        FOR EACH ROW EXECUTE FUNCTION prueba_falla_al_final();`]);
    const r1 = psql(url, ["-v", "ON_ERROR_STOP=1", "-c", bloque], { permitirFalla: true });
    ok("el DO falla en la última fila del punto cero", !r1.ok && r1.salida.includes("FALLA INYECTADA"), r1.salida.slice(-200));
    const o1 = await objetosDelLibro(c);
    ok("no quedó ninguno de los tres triggers de la activación", o1.triggers === 2 /* los dos de inmutabilidad, creados antes del bloque */, JSON.stringify(o1));
    ok(`ni una sola de las ${filas.n - 1} filas que ya había insertado`, (await contar(c)) === 0);

    psql(url, ["-v", "ON_ERROR_STOP=1", "-c", `DROP TRIGGER prueba_falla_al_final ON "MovimientoStock"`]);
    psql(url, ["-v", "ON_ERROR_STOP=1", "-c", SQL_FALLA_INYECTADA]);
    const r2 = psql(url, ["-v", "ON_ERROR_STOP=1", "-c", bloque], { permitirFalla: true });
    ok("con la falla entre triggers, el DO también falla", !r2.ok && r2.salida.includes("FALLA INYECTADA"));
    const o2 = await objetosDelLibro(c);
    ok("y tampoco deja triggers ni filas", o2.triggers === 2 && (await contar(c)) === 0, JSON.stringify(o2));

    psql(url, ["-v", "ON_ERROR_STOP=1", "-c", "DROP EVENT TRIGGER prueba_falla_inyectada"]);
    const r3 = psql(url, ["-v", "ON_ERROR_STOP=1", "-c", bloque], { permitirFalla: true });
    ok("sin falla, el mismo DO activa el libro", r3.ok, r3.salida);
    ok(`con una fila de ESTADO_INICIAL por cada una de las ${filas.n} de StockLocal`, (await contar(c, `"tipo" = 'ESTADO_INICIAL'`)) === filas.n);
    const v = await verificarLibroStock(c);
    ok("y el verificador en verde", v.integridad.ok, informeDelLibro(v));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // B. CARRERA DURANTE LA ACTIVACIÓN
  // ══════════════════════════════════════════════════════════════════════════
  seccion(`B. Carrera: escritores concurrentes mientras se activa (${FILAS_CARRERA} filas)`);
  const BASE_CARRERA = `${PREFIJO}b`;
  const urlCarrera = await crearBase(BASE_CARRERA, PLANTILLA);
  {
    const lector = await clienteDe(urlCarrera);
    const ids = (await lector.$queryRaw`SELECT "id" FROM "StockLocal" ORDER BY "id"`).map((f) => f.id);
    const cantidadDe = new Map(
      (await lector.$queryRaw`SELECT "id", "cantidad"::float8 AS c FROM "StockLocal"`).map((f) => [f.id, f.c])
    );
    const sinStock = await lector.$queryRaw`
      SELECT pl."id", pl."localId" FROM "ProductoLocal" pl
      LEFT JOIN "StockLocal" sl ON sl."productoId" = pl."id" WHERE sl."id" IS NULL ORDER BY pl."id"`;
    // Los que se van a borrar no se actualizan: cada escritor tiene su propio
    // conjunto, así no se pisan y el valor esperado de cada fila se sabe.
    const borrables = ids.slice(-60);
    const actualizables = ids.slice(0, -60);

    const escritores = await Promise.all([0, 1, 2].map(() => clienteDe(urlCarrera)));
    const estado = { parar: false, errores: [], updates: 0, altas: 0, bajas: 0, maxMs: 0, esperaron: [] };
    const esperado = new Map(actualizables.map((id) => [id, cantidadDe.get(id)]));
    const altasHechas = [];
    const bajasHechas = [];

    async function escritor(n) {
      let i = 0;
      while (!estado.parar) {
        i += 1;
        const t0 = Date.now();
        try {
          if (i % 25 === 0 && sinStock.length) {
            const pl = sinStock.pop();
            await escritores[n].$transaction(
              async (tx) => {
                await declararOrigenDeStock(tx, { origen: "PRUEBA_CARRERA", referencia: `alta-${pl.id}` });
                await tx.$executeRaw`INSERT INTO "StockLocal" ("localId", "productoId", "cantidad", "updatedAt") VALUES (${pl.localId}, ${pl.id}, 5, now())`;
                await tx.$executeRaw`SELECT pg_sleep(0.005)`;
              },
              { timeout: 30_000, maxWait: 10_000 }
            );
            altasHechas.push(pl.id);
            estado.altas += 1;
          } else if (i % 40 === 0 && borrables.length) {
            const id = borrables.pop();
            await escritores[n].$transaction(
              async (tx) => {
                await declararOrigenDeStock(tx, { origen: "PRUEBA_CARRERA", referencia: `baja-${id}` });
                await tx.$executeRaw`DELETE FROM "StockLocal" WHERE "id" = ${id}`;
                await tx.$executeRaw`SELECT pg_sleep(0.005)`;
              },
              { timeout: 30_000, maxWait: 10_000 }
            );
            bajasHechas.push(id);
            estado.bajas += 1;
          } else {
            const id = actualizables[(n * 7919 + i * 104729) % actualizables.length];
            await escritores[n].$transaction(
              async (tx) => {
                await declararOrigenDeStock(tx, { origen: "PRUEBA_CARRERA", referencia: `upd-${n}-${i}` });
                await tx.$executeRaw`UPDATE "StockLocal" SET "cantidad" = "cantidad" + 1 WHERE "id" = ${id}`;
                await tx.$executeRaw`SELECT pg_sleep(0.005)`;
              },
              { timeout: 30_000, maxWait: 10_000 }
            );
            esperado.set(id, esperado.get(id) + 1);
            estado.updates += 1;
          }
          const ms = Date.now() - t0;
          estado.maxMs = Math.max(estado.maxMs, ms);
          estado.esperaron.push({ inicio: t0, fin: Date.now(), ms });
        } catch (err) {
          estado.errores.push(err?.message?.split("\n").slice(-1)[0] || String(err));
        }
      }
    }

    const hilos = [0, 1, 2].map((n) => escritor(n));
    await esperar(400);
    const r = await migrateDev(schemaConLibro, urlCarrera);
    await esperar(600);
    estado.parar = true;
    await Promise.all(hilos);

    ok("la migración se aplica con los escritores corriendo", r.codigo === 0, r.salida.slice(-400));
    ok(`ningún escritor falló (${estado.updates} actualizaciones, ${estado.altas} altas, ${estado.bajas} bajas)`, estado.errores.length === 0, estado.errores.slice(0, 3).join(" | "));

    const [cero] = await lector.$queryRaw`
      SELECT min("instante") AS i FROM "MovimientoStock" WHERE "origen" = ${ORIGEN_ACTIVACION}`;
    // El instante de la base está en UTC sin zona: Prisma lo devuelve como Date UTC.
    const activacion = new Date(cero.i).getTime();
    const cruzaron = estado.esperaron.filter((e) => e.inicio < activacion && e.fin > activacion);
    ok(
      `hubo escrituras EN VUELO durante la activación (${cruzaron.length}; la más larga esperó ${Math.max(0, ...cruzaron.map((e) => e.ms))} ms)`,
      cruzaron.length > 0,
      "la carrera no se produjo: la prueba no demostró nada"
    );

    const despues = await contar(lector, `"origen" = 'PRUEBA_CARRERA' AND "tipo" = 'CAMBIO'`);
    ok(`hubo actualizaciones antes (${estado.updates - despues}) y después (${despues}) de activar`, despues > 0 && despues < estado.updates);
    ok("ningún movimiento posterior a la activación quedó sin origen", (await contar(lector, `"origen" = '${SIN_ORIGEN}'`)) === 0);

    const reales = new Map(
      (await lector.$queryRaw`SELECT "id", "cantidad"::float8 AS c FROM "StockLocal"`).map((f) => [f.id, f.c])
    );
    const perdidas = [...esperado].filter(([id, v]) => reales.get(id) !== v);
    ok("ninguna escritura perdida: cada fila vale su valor inicial más sus incrementos", perdidas.length === 0, JSON.stringify(perdidas.slice(0, 3)));
    ok("las bajas no están y las altas sí", bajasHechas.every((id) => !reales.has(id)) && altasHechas.length === estado.altas);

    const v = await verificarLibroStock(lector);
    ok("verificador en VERDE después de la carrera", v.integridad.ok, informeDelLibro(v));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // C. CADA FORMA DE ESCRIBIR
  // ══════════════════════════════════════════════════════════════════════════
  seccion("C. Formas de escritura sobre la base principal");
  await sembrarPrincipal();
  {
    const { pls } = await nuevoProducto("formas", { stock: 10 });
    const [pa, pb] = pls;
    let m = await movimientosDe(principal, pa.id);
    ok("create → ALTA 10, anteriores en NULL", m.length === 1 && m[0].tipo === "ALTA" && m[0].ca === null && m[0].cp === 10 && m[0].tp === 0);

    await principal.stockLocal.update({ where: { localId_productoId: { localId: pa.localId, productoId: pa.id } }, data: { cantidad: 12 } });
    m = await movimientosDe(principal, pa.id);
    ok("update con valor → CAMBIO 10 → 12", ultimo(m).tipo === "CAMBIO" && ultimo(m).ca === 10 && ultimo(m).cp === 12);

    await principal.stockLocal.update({ where: { localId_productoId: { localId: pa.localId, productoId: pa.id } }, data: { cantidad: { increment: 3 } } });
    await principal.stockLocal.update({ where: { localId_productoId: { localId: pa.localId, productoId: pa.id } }, data: { cantidad: { decrement: 1.5 } } });
    m = await movimientosDe(principal, pa.id);
    ok("increment y decrement → 12 → 15 → 13,5", m.at(-2).cp === 15 && ultimo(m).ca === 15 && ultimo(m).cp === 13.5);

    await principal.stockLocal.updateMany({ where: { productoId: { in: [pa.id, pb.id] } }, data: { enTransito: { increment: 2 } } });
    const mb = await movimientosDe(principal, pb.id);
    m = await movimientosDe(principal, pa.id);
    ok("updateMany sobre dos filas → un CAMBIO de tránsito en cada una", ultimo(m).ta === 0 && ultimo(m).tp === 2 && ultimo(mb).tp === 2 && ultimo(mb).cp === 10);

    const antes = m.length;
    await principal.stockLocal.update({ where: { localId_productoId: { localId: pa.localId, productoId: pa.id } }, data: { stockMin: 1, stockMax: 50 } });
    ok("un update que solo toca los límites NO deja movimiento", (await movimientosDe(principal, pa.id)).length === antes);

    await principal.stockLocal.upsert({
      where: { localId_productoId: { localId: pa.localId, productoId: pa.id } },
      update: { cantidad: { increment: 1 } },
      create: { localId: pa.localId, productoId: pa.id, cantidad: 0 },
    });
    ok("upsert sobre fila existente → CAMBIO", ultimo(await movimientosDe(principal, pa.id)).cp === 14.5);

    const { pls: nuevos } = await nuevoProducto("upsert-createMany");
    await principal.stockLocal.upsert({
      where: { localId_productoId: { localId: nuevos[0].localId, productoId: nuevos[0].id } },
      update: { cantidad: { increment: 1 } },
      create: { localId: nuevos[0].localId, productoId: nuevos[0].id, cantidad: 4 },
    });
    ok("upsert que crea → ALTA 4", ultimo(await movimientosDe(principal, nuevos[0].id))?.tipo === "ALTA");

    await principal.stockLocal.createMany({ data: [{ localId: nuevos[1].localId, productoId: nuevos[1].id, cantidad: 0 }] });
    const mc = await movimientosDe(principal, nuevos[1].id);
    ok("createMany de una fila en CERO → ALTA 0 (las altas en cero también se registran)", mc.length === 1 && mc[0].tipo === "ALTA" && mc[0].cp === 0);

    await principal.$executeRaw`UPDATE "StockLocal" SET "cantidad" = 99 WHERE "productoId" = ${nuevos[1].id}`;
    ok("UPDATE en SQL crudo → CAMBIO 0 → 99", ultimo(await movimientosDe(principal, nuevos[1].id)).cp === 99);

    await principal.stockLocal.deleteMany({ where: { productoId: nuevos[1].id } });
    const md = ultimo(await movimientosDe(principal, nuevos[1].id));
    ok("deleteMany → BAJA con 99 como último saldo y posteriores en NULL", md.tipo === "BAJA" && md.ca === 99 && md.cp === null && md.tp === null);

    await principal.$executeRaw`INSERT INTO "StockLocal" ("localId","productoId","cantidad","updatedAt") VALUES (${nuevos[1].localId}, ${nuevos[1].id}, 3, now())`;
    await principal.$executeRaw`DELETE FROM "StockLocal" WHERE "productoId" = ${nuevos[1].id}`;
    const mr = await movimientosDe(principal, nuevos[1].id);
    ok("INSERT y DELETE crudos → ALTA después de la BAJA, y otra BAJA", mr.map((x) => x.tipo).join(",") === "ALTA,CAMBIO,BAJA,ALTA,BAJA", mr.map((x) => x.tipo).join(","));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // D. ROLLBACK
  // ══════════════════════════════════════════════════════════════════════════
  seccion("D. Rollback");
  {
    const { pls } = await nuevoProducto("rollback", { stock: 20 });
    const pl = pls[0];
    const n0 = (await movimientosDe(principal, pl.id)).length;
    let error = null;
    try {
      await principal.$transaction(async (tx) => {
        await declararOrigenDeStock(tx, { origen: "PRUEBA_ROLLBACK" });
        await tx.stockLocal.update({ where: { localId_productoId: { localId: pl.localId, productoId: pl.id } }, data: { cantidad: 18 } });
        const dentro = await tx.$queryRaw`SELECT count(*)::int AS n FROM "MovimientoStock" WHERE "productoLocalId" = ${pl.id}`;
        if (dentro[0].n !== n0 + 1) throw new Error("dentro de la transacción el movimiento no se veía");
        throw new Error("REVERTIR A PROPÓSITO");
      });
    } catch (err) {
      error = err.message;
    }
    ok("la transacción se revirtió a propósito (y adentro el movimiento existía)", error === "REVERTIR A PROPÓSITO", error);
    const sl = await principal.stockLocal.findUnique({ where: { localId_productoId: { localId: pl.localId, productoId: pl.id } } });
    ok("StockLocal sigue en 20", Number(sl.cantidad) === 20);
    ok("y el movimiento no quedó", (await movimientosDe(principal, pl.id)).length === n0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // E. CONCURRENCIA SOBRE EL MISMO PRODUCTO
  // ══════════════════════════════════════════════════════════════════════════
  seccion("E. Dos conexiones sobre el mismo producto");
  {
    const { pls } = await nuevoProducto("concurrencia", { stock: 100 });
    const pl = pls[0];
    const otra = await clienteDe(process.env.DATABASE_URL);
    const donde = { localId_productoId: { localId: pl.localId, productoId: pl.id } };
    const t1 = principal.$transaction(
      async (tx) => {
        await tx.stockLocal.update({ where: donde, data: { cantidad: { decrement: 1 } } });
        await tx.$executeRaw`SELECT pg_sleep(1.5)`;
      },
      { timeout: 20_000 }
    );
    await esperar(250);
    const inicioT2 = Date.now();
    const t2 = otra.$transaction(
      async (tx) => {
        const [ahora] = await tx.$queryRaw`SELECT now() AS n`;
        await tx.stockLocal.update({ where: donde, data: { cantidad: { decrement: 10 } } });
        return ahora.n;
      },
      { timeout: 20_000 }
    );
    await t1;
    const nowDeT2 = await t2;
    const m = (await movimientosDe(principal, pl.id)).slice(-2);
    const [a, b] = m;
    ok("los saldos quedan en orden: 100 → 99 → 89", a.ca === 100 && a.cp === 99 && b.ca === 99 && b.cp === 89);
    ok("el segundo va después en la cadena", b.id > a.id);
    const separacion = new Date(b.instante) - new Date(a.instante);
    ok(
      `el reloj del segundo es el de cuando CONSIGUIÓ la fila (${separacion} ms después), no el de cuando empezó`,
      separacion >= 1000 && new Date(b.instante) - new Date(nowDeT2) >= 1000,
      `separación ${separacion} ms; now() de T2 ${new Date(nowDeT2).toISOString()}, empezó ${new Date(inicioT2).toISOString()}`
    );
    ok("el día de cada uno es el día argentino de su instante", [a, b].every((x) => new Date(x.dia).toISOString().slice(0, 10) === fechaArgentinaISO(new Date(x.instante))));

    const [bordes] = await principal.$queryRaw`
      SELECT "libro_stock_dia"('2026-09-28 02:59:59.999'::timestamp)::text AS "antes",
             "libro_stock_dia"('2026-09-28 03:00:00.000'::timestamp)::text AS "despues"`;
    ok("en el borde: 23:59:59.999 argentino es el 27, 00:00:00.000 es el 28", bordes.antes === "2026-09-27" && bordes.despues === "2026-09-28", JSON.stringify(bordes));

    const [tokio] = await principal.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Asia/Tokyo'`);
      await tx.stockLocal.update({ where: donde, data: { cantidad: { increment: 1 } } });
      return tx.$queryRaw`SELECT "instante", "dia" FROM "MovimientoStock" WHERE "productoLocalId" = ${pl.id} ORDER BY "id" DESC LIMIT 1`;
    });
    ok(
      "con la sesión en otra zona horaria, el instante sigue en UTC y el día sigue siendo el argentino",
      new Date(tokio.dia).toISOString().slice(0, 10) === fechaArgentinaISO(new Date(tokio.instante)) && Math.abs(new Date(tokio.instante) - Date.now()) < 60_000,
      JSON.stringify(tokio)
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // F. ORIGEN
  // ══════════════════════════════════════════════════════════════════════════
  seccion("F. Origen declarado y SIN_ORIGEN");
  {
    const { pls } = await nuevoProducto("origen", { stock: 1 });
    const pl = pls[0];
    const donde = { localId_productoId: { localId: pl.localId, productoId: pl.id } };
    // UNA sola conexión: si la configuración se filtrara, la próxima transacción
    // de este cliente la vería.
    const u = new URL(process.env.DATABASE_URL);
    u.searchParams.set("connection_limit", "1");
    const unaConexion = await clienteDe(u.toString());

    await unaConexion.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: "PRUEBA_ORIGEN", referencia: 42 });
      await tx.stockLocal.update({ where: donde, data: { cantidad: 2 } });
    });
    let m = ultimo(await movimientosDe(principal, pl.id));
    ok("declarado → origen y referencia en el movimiento", m.origen === "PRUEBA_ORIGEN" && m.origenRef === "42", JSON.stringify(m));

    await unaConexion.$transaction(async (tx) => {
      await tx.stockLocal.update({ where: donde, data: { cantidad: 3 } });
    });
    m = ultimo(await movimientosDe(principal, pl.id));
    ok("la transacción siguiente, en la MISMA conexión y sin declarar → SIN_ORIGEN", m.origen === SIN_ORIGEN && m.origenRef === null, JSON.stringify(m));

    await unaConexion.stockLocal.update({ where: donde, data: { cantidad: 4 } });
    ok("una escritura suelta, fuera de transacción → SIN_ORIGEN", ultimo(await movimientosDe(principal, pl.id)).origen === SIN_ORIGEN);

    await unaConexion.$transaction(async (tx) => {
      await declararOrigenDeStock(tx, { origen: "PRUEBA_PRIMERO", referencia: "r1" });
      await declararOrigenDeStock(tx, { origen: "PRUEBA_SEGUNDO" });
      await tx.stockLocal.update({ where: donde, data: { cantidad: 5 } });
    });
    m = ultimo(await movimientosDe(principal, pl.id));
    ok("redeclarar reemplaza, y la referencia vieja NO se hereda", m.origen === "PRUEBA_SEGUNDO" && m.origenRef === null, JSON.stringify(m));

    const rechazos = [];
    for (const [nombre, fn] of [
      ["cliente raíz", () => declararOrigenDeStock(principal, { origen: "PRUEBA_X" })],
      ["minúsculas", () => principal.$transaction((tx) => declararOrigenDeStock(tx, { origen: "venta" }))],
      ["reservado", () => principal.$transaction((tx) => declararOrigenDeStock(tx, { origen: SIN_ORIGEN }))],
    ]) {
      try {
        await fn();
      } catch {
        rechazos.push(nombre);
      }
    }
    ok("rechaza el cliente raíz, un origen mal formado y uno reservado", rechazos.length === 3, rechazos.join(", "));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // G. BAJA POR LA RUTA REAL DE ELIMINAR PRODUCTO
  // ══════════════════════════════════════════════════════════════════════════
  seccion("G. BAJA: productos/eliminar/[id], la ruta real");
  {
    const { base, pls } = await nuevoProducto("eliminar", { stock: 7 });
    await principal.stockLocal.update({
      where: { localId_productoId: { localId: pls[1].localId, productoId: pls[1].id } },
      data: { enTransito: 1.25 },
    });
    const ruta = await import("../../app/api/productos/eliminar/[id]/route.js");
    const sesion = jwt.sign(
      { id: 1, nombre: "CI Libro", email: "libro@ci.local", localId: propios.locales[0], grupoId: propios.grupo, permisos: ["productos.eliminar"] },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
    const res = await ruta.DELETE(
      new Request(`http://ci.local/api/productos/eliminar/${base.id}`, { method: "DELETE", headers: { cookie: `erpazul_sesion=${sesion}` } }),
      { params: Promise.resolve({ id: String(base.id) }) }
    );
    const cuerpo = await res.json();
    ok("la ruta eliminó el producto (con stock distinto de cero: hoy lo permite)", res.status === 200 && cuerpo.ok, JSON.stringify(cuerpo));
    propios.bases = propios.bases.filter((id) => id !== base.id);
    const existe = await principal.productoBase.findUnique({ where: { id: base.id } });
    ok("ProductoBase ya no existe", existe === null);
    for (const pl of pls) {
      const b = ultimo(await movimientosDe(principal, pl.id));
      ok(
        `la BAJA del local ${pl.localId} sobrevive con su último saldo y la identidad congelada`,
        b.tipo === "BAJA" && b.ca === 7 && b.productoBaseId === base.id &&
          b.nombreCongelado === base.nombre && b.codigoBarraCongelado === base.codigo_barra && b.unidadMedidaCongelada === "unidad",
        JSON.stringify(b)
      );
    }
    ok("el tránsito de la fila borrada queda como último saldo de tránsito", ultimo(await movimientosDe(principal, pls[1].id)).ta === 1.25);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // H. REINTERPRETACIÓN
  // ══════════════════════════════════════════════════════════════════════════
  seccion("H. Reinterpretación de unidad");
  {
    const { base, pls } = await nuevoProducto("reinterpretacion", { stock: 10 });
    const antes = await principal.$queryRaw`SELECT count(*)::int AS n FROM "ReinterpretacionDeStock" WHERE "entidad" = 'ProductoBase' AND "entidadId" = ${base.id}`;
    const movAntes = (await movimientosDe(principal, pls[0].id)).length;

    await principal.productoBase.update({ where: { id: base.id }, data: { nombre: `${MARCA} renombrado`, unidad_medida: "unidad" } });
    let ev = await principal.$queryRaw`SELECT * FROM "ReinterpretacionDeStock" WHERE "entidad" = 'ProductoBase' AND "entidadId" = ${base.id} ORDER BY "id"`;
    ok("cambiar el nombre, o escribir la MISMA unidad, no deja evidencia", ev.length === antes[0].n);

    await principal.productoBase.update({ where: { id: base.id }, data: { unidad_medida: "kg", pesoReferenciaKg: 2.5 } });
    ev = await principal.$queryRaw`SELECT * FROM "ReinterpretacionDeStock" WHERE "entidad" = 'ProductoBase' AND "entidadId" = ${base.id} ORDER BY "id"`;
    const unidad = ev.find((e) => e.campo === "unidad_medida");
    const peso = ev.find((e) => e.campo === "pesoReferenciaKg");
    ok(
      "unidad → kg con stock: evidencia con campo, antes, después y filas con stock",
      unidad && unidad.valorAnterior === "unidad" && unidad.valorPosterior === "kg" && unidad.filasConStock === pls.length,
      JSON.stringify(unidad)
    );
    ok("un evento por campo: también pesoReferenciaKg", peso && peso.valorAnterior === null && peso.valorPosterior === "2.500");
    const sl = await principal.stockLocal.findMany({ where: { productoId: { in: pls.map((p) => p.id) } } });
    ok("el stock NO se tocó: sigue en 10 y no hay movimiento nuevo", sl.every((s) => Number(s.cantidad) === 10) && (await movimientosDe(principal, pls[0].id)).length === movAntes);

    await principal.local.update({ where: { id: propios.locales[1] }, data: { es_deposito: true } });
    const [evl] = await principal.$queryRaw`SELECT * FROM "ReinterpretacionDeStock" WHERE "entidad" = 'Local' AND "entidadId" = ${propios.locales[1]} ORDER BY "id" DESC LIMIT 1`;
    ok("es_deposito de una ubicación también deja evidencia", evl && evl.campo === "es_deposito" && evl.valorAnterior === "false" && evl.valorPosterior === "true" && evl.filasConStock > 0, JSON.stringify(evl));

    let inmutable = false;
    try {
      await principal.$executeRaw`UPDATE "MovimientoStock" SET "origen" = 'OTRO' WHERE "productoLocalId" = ${pls[0].id}`;
    } catch (err) {
      inmutable = /no se modifica/.test(err.message);
    }
    let inmutable2 = false;
    try {
      await principal.$executeRaw`DELETE FROM "ReinterpretacionDeStock" WHERE "entidadId" = ${base.id}`;
    } catch (err) {
      inmutable2 = /no se modifica/.test(err.message);
    }
    ok("el libro no se edita ni se borra: UPDATE y DELETE rechazados", inmutable && inmutable2);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // I. CONTRAPRUEBA DEL VERIFICADOR
  // ══════════════════════════════════════════════════════════════════════════
  seccion("I. Contraprueba: con el trigger apagado, el verificador se pone rojo");
  {
    await soltarClientes(urlCarrera);
    const url = await crearBase(`${PREFIJO}i`, BASE_CARRERA);
    const c = await clienteDe(url);
    const rojas = async () => (await verificarLibroStock(c)).integridad.reglas.filter((r) => r.cantidad > 0).map((r) => r.clave);
    ok("parte en verde", (await rojas()).length === 0);

    const [fila] = await c.$queryRaw`SELECT "id" FROM "StockLocal" ORDER BY "id" LIMIT 1`;
    const [otra] = await c.$queryRaw`SELECT "id" FROM "StockLocal" ORDER BY "id" DESC LIMIT 1`;
    await c.$executeRawUnsafe(`ALTER TABLE "StockLocal" DISABLE TRIGGER "StockLocal_libro"`);
    await c.$executeRaw`UPDATE "StockLocal" SET "cantidad" = "cantidad" + 1000 WHERE "id" = ${fila.id}`;
    await c.$executeRaw`DELETE FROM "StockLocal" WHERE "id" = ${otra.id}`;
    let r = await rojas();
    ok("con el trigger deshabilitado: rojo por trigger, por saldo distinto y por cadena abierta sin fila", ["trigger-obligatorio", "saldo-distinto", "cadena-abierta-sin-fila"].every((k) => r.includes(k)), r.join(", "));

    await c.$executeRawUnsafe(`ALTER TABLE "StockLocal" ENABLE TRIGGER "StockLocal_libro"`);
    await c.$executeRaw`UPDATE "StockLocal" SET "cantidad" = "cantidad" + 1 WHERE "id" = ${fila.id}`;
    r = await rojas();
    ok("vuelto a encender, el hueco queda a la vista como discontinuidad", r.includes("discontinuidad") && !r.includes("trigger-obligatorio") && !r.includes("saldo-distinto"), r.join(", "));

    await c.$executeRawUnsafe(`ALTER TABLE "MovimientoStock" DISABLE TRIGGER "MovimientoStock_inmutable"`);
    await c.$executeRawUnsafe(`UPDATE "MovimientoStock" SET "instante" = "instante" - interval '10 days', "dia" = "dia" - 10 WHERE "id" = (SELECT max("id") FROM "MovimientoStock")`);
    await c.$executeRawUnsafe(`UPDATE "MovimientoStock" SET "cantidadPosterior" = NULL WHERE "tipo" = 'CAMBIO' AND "id" = (SELECT min("id") FROM "MovimientoStock" WHERE "tipo" = 'CAMBIO')`);
    r = await rojas();
    ok("un retroceso en el tiempo y un movimiento mal formado también ponen rojo", r.includes("retroceso") && r.includes("movimiento-invalido") && r.includes("trigger-obligatorio"), r.join(", "));

    const sinOrigen = await verificarLibroStock(c);
    ok("SIN_ORIGEN solo se informa: la clasificación está en su propia sección", typeof sinOrigen.clasificacion.sinOrigen === "number" && !sinOrigen.integridad.reglas.some((x) => /origen/i.test(x.clave)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // J. DUMP Y RESTORE
  // ══════════════════════════════════════════════════════════════════════════
  seccion("J. Dump plano y restore, como el backup documentado");
  {
    const version = execFileSync("pg_dump", ["--version"], { encoding: "utf8" }).trim();
    const fp = path.join(os.tmpdir(), `libro-dump-${process.pid}.sql`);
    // Los mismos flags que `ops/backup/vps-backup-erpazul.sh`: plano, completo,
    // sin dueño ni permisos.
    execFileSync("pg_dump", ["--no-owner", "--no-acl", "-f", fp, urlCarrera], { stdio: "pipe" });
    const url = await crearBase(`${PREFIJO}j`);
    // Como `docs/RESTAURACION-BACKUP.md`: psql plano sobre una base vacía, sin
    // ON_ERROR_STOP. Así psql sale con 0 aunque falle una sentencia, y por eso se
    // mira stderr: ahí es donde un error pasaría callado.
    const restore = spawnSync("psql", [url, "-X", "-q", "-f", fp], { encoding: "utf8" });
    const errores = `${restore.stderr || ""}${restore.error ? String(restore.error) : ""}`;
    fs.rmSync(fp, { force: true });
    console.log(`     (${version})`);

    const origen = await clienteDe(urlCarrera);
    const destino = await clienteDe(url);
    const [a] = await origen.$queryRaw`SELECT count(*)::int AS n, max("id") AS m FROM "MovimientoStock"`;
    const [b] = await destino.$queryRaw`SELECT count(*)::int AS n, max("id") AS m FROM "MovimientoStock"`;
    ok("el restore no dio errores", !/ERROR/.test(errores), errores.slice(0, 300));
    ok(`el libro llegó entero y sin movimientos inventados por el restore (${b.n} = ${a.n})`, a.n === b.n && a.m === b.m);
    const o = await objetosDelLibro(destino);
    ok("con sus funciones y sus cinco triggers", o.triggers === TRIGGERS_OBLIGATORIOS.length && o.funciones >= 8, JSON.stringify(o));
    const v = await verificarLibroStock(destino);
    ok("verificador en VERDE sobre la base restaurada", v.integridad.ok, informeDelLibro(v));
    const [f] = await destino.$queryRaw`SELECT "id" FROM "StockLocal" ORDER BY "id" LIMIT 1`;
    await destino.$executeRaw`UPDATE "StockLocal" SET "cantidad" = "cantidad" + 1 WHERE "id" = ${f.id}`;
    ok("y el trigger restaurado captura la escritura siguiente", (await contar(destino)) === b.n + 1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // K. LA BAJA NO DEPENDE DEL ORDEN DE LAS SENTENCIAS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `20260928180000_libro_stock_baja_atomica`. Una sola sentencia que borra el
  // StockLocal y su ProductoLocal —o re-vincula la fila y borra el producto
  // viejo— perdía la BAJA: el trigger AFTER corre al final de la sentencia y el
  // producto ya no estaba. Primero se reproduce el defecto sobre el libro tal
  // como se desplegó, para saber que estas afirmaciones lo ven; después, cada
  // caso sobre el libro corregido.
  seccion("K. La BAJA no depende del orden de las sentencias");
  {
    const CTE_ATOMICO = (pl) =>
      `WITH s AS (DELETE FROM "StockLocal" WHERE "productoId" = ${pl} RETURNING "id") DELETE FROM "ProductoLocal" WHERE "id" = ${pl}`;

    /** Un producto con su fila de stock en la primera ubicación que no es depósito. */
    async function productoK(c, sufijo, cantidad, transito, { conStock = true } = {}) {
      const [b] = await c.$queryRawUnsafe(
        `INSERT INTO "ProductoBase" ("grupoId","nombre","codigo_barra","unidad_medida","precio_costo","precio_venta","updatedAt")
         VALUES ((SELECT min("id") FROM "Grupo"), 'K ${sufijo}', 'K-${sufijo}', 'kg', 1, 2, now()) RETURNING "id"`
      );
      const [l] = await c.$queryRawUnsafe(`SELECT min("id") AS "id" FROM "Local" WHERE NOT "es_deposito"`);
      const [pl] = await c.$queryRawUnsafe(`INSERT INTO "ProductoLocal" ("localId","baseId","updatedAt") VALUES (${l.id}, ${b.id}, now()) RETURNING "id"`);
      let sl = null;
      if (conStock) {
        [sl] = await c.$queryRawUnsafe(
          `INSERT INTO "StockLocal" ("localId","productoId","cantidad","enTransito","updatedAt") VALUES (${l.id}, ${pl.id}, ${cantidad}, ${transito}, now()) RETURNING "id"`
        );
      }
      return { base: b.id, pl: pl.id, sl: sl?.id ?? null, local: l.id, nombre: `K ${sufijo}`, codigo: `K-${sufijo}` };
    }

    const cadena = (c, pl) => c.$queryRaw`
      SELECT "id", "tipo"::text AS "tipo", "stockLocalId", "localId", "productoLocalId", "productoBaseId",
             "cantidadAnterior"::float8 AS "ca", "cantidadPosterior"::float8 AS "cp",
             "enTransitoAnterior"::float8 AS "ta", "enTransitoPosterior"::float8 AS "tp",
             "nombreCongelado", "codigoBarraCongelado", "unidadMedidaCongelada"
      FROM "MovimientoStock" WHERE "productoLocalId" = ${pl} ORDER BY "id"`;

    /** La BAJA con TODO el contrato: ubicación, cadena, base, fila, saldos e identidad. */
    const bajaCompleta = (b, p, cantidad, transito) =>
      !!b && b.tipo === "BAJA" && b.localId === p.local && b.productoLocalId === p.pl && b.productoBaseId === p.base &&
      b.stockLocalId === p.sl && b.ca === cantidad && b.ta === transito && b.cp === null && b.tp === null &&
      b.nombreCongelado === p.nombre && b.codigoBarraCongelado === p.codigo && b.unidadMedidaCongelada === "kg";

    const rojasDe = async (c) => (await verificarLibroStock(c)).integridad.reglas.filter((r) => r.cantidad > 0).map((r) => r.clave);

    // ── K.0 El defecto, sobre el libro tal como se desplegó ─────────────────
    {
      const url = await crearBase(`${PREFIJO}k0`, PLANTILLA);
      const r = aplicarPendientes(dirPrisma(true, { soloHastaElLibro: true }), url);
      ok("K.0 una base con el libro SIN la corrección", r.codigo === 0, r.salida.slice(-300));
      const c = await clienteDe(url);
      const p = await productoK(c, "defecto", 5, 0);
      await c.$executeRawUnsafe(CTE_ATOMICO(p.pl));
      const movs = await cadena(c, p.pl);
      ok(
        "K.0 CONTRAPRUEBA: sin la corrección, el DELETE atómico borra la fila y NO deja BAJA",
        movs.length === 1 && movs[0].tipo === "ALTA",
        JSON.stringify(movs.map((m) => m.tipo))
      );
      ok("K.0 y el verificador se pone ROJO por cadena abierta sin fila", (await rojasDe(c)).includes("cadena-abierta-sin-fila"));
      await soltarClientes(url);
    }

    // ── K.0b La corrección sobre un libro que ya tiene movimientos ─────────
    //
    // Como producción: el libro activado, movimientos reales encima, y recién
    // después la migración nueva. No puede tocar ni una fila del libro.
    {
      const url = await crearBase(`${PREFIJO}k1`, PLANTILLA);
      const hastaElLibro = aplicarPendientes(dirPrisma(true, { soloHastaElLibro: true }), url);
      ok("K.0b una base con el libro tal como se desplegó", hastaElLibro.codigo === 0, hastaElLibro.salida.slice(-300));
      const c = await clienteDe(url);
      await c.$executeRawUnsafe(`UPDATE "StockLocal" SET "cantidad" = "cantidad" + 1 WHERE "id" % 3 = 0`);
      await c.$executeRawUnsafe(`UPDATE "StockLocal" SET "enTransito" = 1.5 WHERE "id" % 5 = 0`);
      await c.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" % 7 = 0`);
      const huella = async () =>
        (await c.$queryRawUnsafe(`SELECT count(*)::int AS "n", max("id") AS "m", md5(string_agg(t::text, '|' ORDER BY "id")) AS "h" FROM "MovimientoStock" t`))[0];
      const antes = await huella();
      const [cero] = await c.$queryRawUnsafe(`SELECT min("instante")::text AS "i", count(*)::int AS "n" FROM "MovimientoStock" WHERE "tipo" = 'ESTADO_INICIAL'`);
      await soltarClientes(url);
      // Lo pendiente, como en el despliegue: `migrate deploy` sobre el árbol entero.
      const r = aplicarPendientes(dirPrisma(true), url);
      ok("K.0b la migración de la corrección se aplica sobre un libro con movimientos", r.codigo === 0 && /20260928180000_libro_stock_baja_atomica/.test(r.salida), r.salida.slice(-300));
      // Las pendientes posteriores al libro se aplican juntas y en el orden de sus
      // nombres: el índice del Stock Diario antes que la corrección. Son
      // independientes; esto comprueba que Prisma las aplica las dos, en ese orden.
      const posteriores = fs
        .readdirSync(path.join(RAIZ, "prisma", "migrations"), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name > NOMBRE_MIGRACION)
        .map((e) => e.name)
        .sort();
      const posiciones = posteriores.map((n) => r.salida.indexOf(n));
      ok(
        `K.0b Prisma aplica las ${posteriores.length} posteriores al libro, en orden: ${posteriores.join(", ")}`,
        posteriores.length >= 1 && posiciones.every((p) => p >= 0) && posiciones.every((p, i) => i === 0 || p > posiciones[i - 1]),
        JSON.stringify(posiciones)
      );
      const c2 = await clienteDe(url);
      const registradas = (
        await c2.$queryRawUnsafe(
          `SELECT migration_name AS "n" FROM "_prisma_migrations" WHERE migration_name > '${NOMBRE_MIGRACION}' AND finished_at IS NOT NULL ORDER BY finished_at, started_at`
        )
      ).map((f) => f.n);
      ok("K.0b y _prisma_migrations las registra terminadas en ese mismo orden", JSON.stringify(registradas) === JSON.stringify(posteriores), JSON.stringify(registradas));
      const despues = (await c2.$queryRawUnsafe(`SELECT count(*)::int AS "n", max("id") AS "m", md5(string_agg(t::text, '|' ORDER BY "id")) AS "h" FROM "MovimientoStock" t`))[0];
      const [cero2] = await c2.$queryRawUnsafe(`SELECT min("instante")::text AS "i", count(*)::int AS "n" FROM "MovimientoStock" WHERE "tipo" = 'ESTADO_INICIAL'`);
      ok(
        `K.0b el libro queda idéntico, fila por fila (${antes.n} movimientos), y el punto cero no se mueve`,
        antes.n > 0 && antes.n === despues.n && antes.m === despues.m && antes.h === despues.h && cero.i === cero2.i && cero.n === cero2.n,
        JSON.stringify({ antes, despues })
      );
      ok("K.0b verificador en VERDE después de aplicarla", (await rojasDe(c2)).length === 0);
      const p = await productoK(c2, "despues-de-migrar", 5, 0);
      await c2.$executeRawUnsafe(CTE_ATOMICO(p.pl));
      ok("K.0b y desde ahí el DELETE atómico deja su BAJA", (await cadena(c2, p.pl)).filter((m) => m.tipo === "BAJA").length === 1);
      await soltarClientes(url);
    }

    await soltarClientes(urlCarrera);
    const url = await crearBase(`${PREFIJO}k`, BASE_CARRERA);
    const c = await clienteDe(url);
    ok("K parte en VERDE, con la corrección aplicada", (await rojasDe(c)).length === 0);

    // ── 1. DELETE normal ──────────────────────────────────────────────────
    {
      const p = await productoK(c, "normal", 5, 0);
      await c.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" = ${p.sl}`);
      const bajas = (await cadena(c, p.pl)).filter((m) => m.tipo === "BAJA");
      ok("K.1 DELETE normal: exactamente UNA BAJA, con todo el contrato", bajas.length === 1 && bajaCompleta(bajas[0], p, 5, 0), JSON.stringify(bajas));
    }

    // ── 2. El camino de la aplicación: dos sentencias, una transacción ─────
    {
      const p = await productoK(c, "dos-sentencias", 0, 2.5);
      await c.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "productoId" = ${p.pl}`);
        await tx.$executeRawUnsafe(`DELETE FROM "ProductoLocal" WHERE "id" = ${p.pl}`);
      });
      const bajas = (await cadena(c, p.pl)).filter((m) => m.tipo === "BAJA");
      ok("K.2 dos sentencias en una transacción: exactamente UNA BAJA", bajas.length === 1 && bajaCompleta(bajas[0], p, 0, 2.5), JSON.stringify(bajas));
    }

    // ── 3, 5, 6, 7. Una sola sentencia, con los tres estados de saldo ──────
    for (const [nombre, cantidad, transito] of [["atomico-5-0", 5, 0], ["atomico-0-2.5", 0, 2.5], ["atomico-0-0", 0, 0]]) {
      const p = await productoK(c, nombre, cantidad, transito);
      await c.$executeRawUnsafe(CTE_ATOMICO(p.pl));
      const movs = await cadena(c, p.pl);
      const bajas = movs.filter((m) => m.tipo === "BAJA");
      const [quedan] = await c.$queryRawUnsafe(
        `SELECT (SELECT count(*) FROM "StockLocal" WHERE "id" = ${p.sl})::int AS "sl", (SELECT count(*) FROM "ProductoLocal" WHERE "id" = ${p.pl})::int AS "pl"`
      );
      ok(
        `K.3 UNA sentencia borra StockLocal y ProductoLocal (cantidad ${cantidad}, tránsito ${transito}): las dos filas se van y queda exactamente UNA BAJA completa`,
        quedan.sl === 0 && quedan.pl === 0 && bajas.length === 1 && bajaCompleta(bajas[0], p, cantidad, transito) && movs[movs.length - 1].tipo === "BAJA",
        JSON.stringify({ quedan, bajas })
      );
    }

    // El orden de las dos mitades dentro de la sentencia no es parte del
    // contrato de PostgreSQL: se prueba al revés, y con el producto base también.
    {
      const p = await productoK(c, "atomico-al-reves", 3, 1);
      await c.$executeRawUnsafe(
        `WITH x AS (DELETE FROM "ProductoLocal" WHERE "id" = ${p.pl} RETURNING "id") DELETE FROM "StockLocal" WHERE "productoId" = ${p.pl}`
      );
      const bajas = (await cadena(c, p.pl)).filter((m) => m.tipo === "BAJA");
      ok("K.3 las dos mitades al revés dentro de la sentencia: UNA BAJA completa", bajas.length === 1 && bajaCompleta(bajas[0], p, 3, 1), JSON.stringify(bajas));

      const q = await productoK(c, "atomico-tres-tablas", 7, 1.25);
      await c.$executeRawUnsafe(
        `WITH s AS (DELETE FROM "StockLocal" WHERE "productoId" = ${q.pl} RETURNING "id"),
              p AS (DELETE FROM "ProductoLocal" WHERE "id" = ${q.pl} RETURNING "id")
         DELETE FROM "ProductoBase" WHERE "id" = ${q.base}`
      );
      const bajasQ = (await cadena(c, q.pl)).filter((m) => m.tipo === "BAJA");
      ok(
        "K.3 UNA sentencia que borra también el ProductoBase: la identidad sale de lo recordado al borrarlo",
        bajasQ.length === 1 && bajaCompleta(bajasQ[0], q, 7, 1.25),
        JSON.stringify(bajasQ)
      );
    }

    // ── 4. La re-vinculación atómica ─────────────────────────────────────
    {
      const vieja = await productoK(c, "revinculo-viejo", 4, 0.5);
      const nueva = await productoK(c, "revinculo-nuevo", 0, 0, { conStock: false });
      await c.$executeRawUnsafe(
        `WITH s AS (UPDATE "StockLocal" SET "productoId" = ${nueva.pl} WHERE "id" = ${vieja.sl} RETURNING 1)
         DELETE FROM "ProductoLocal" WHERE "id" = ${vieja.pl}`
      );
      const movVieja = await cadena(c, vieja.pl);
      const movNueva = await cadena(c, nueva.pl);
      ok(
        "K.4 re-vinculación atómica: la cadena vieja CERRADA con su BAJA completa",
        movVieja.filter((m) => m.tipo === "BAJA").length === 1 && bajaCompleta(movVieja[movVieja.length - 1], vieja, 4, 0.5),
        JSON.stringify(movVieja.map((m) => m.tipo))
      );
      const alta = movNueva[movNueva.length - 1];
      ok(
        "K.4 y la nueva ABIERTA con un ALTA de los mismos saldos y la misma fila, como siempre",
        movNueva.length === 1 && alta.tipo === "ALTA" && alta.cp === 4 && alta.tp === 0.5 && alta.stockLocalId === vieja.sl && alta.productoBaseId === nueva.base && alta.id > movVieja[movVieja.length - 1].id,
        JSON.stringify(movNueva)
      );
    }

    // ── 8. Rollback ───────────────────────────────────────────────────────
    {
      const p = await productoK(c, "rollback", 9, 0);
      const antes = (await cadena(c, p.pl)).length;
      let adentro = null;
      await c
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(CTE_ATOMICO(p.pl));
          adentro = (await tx.$queryRawUnsafe(`SELECT count(*)::int AS "n" FROM "MovimientoStock" WHERE "productoLocalId" = ${p.pl} AND "tipo" = 'BAJA'`))[0].n;
          throw new Error("rollback a propósito");
        })
        .catch(() => {});
      const [quedan] = await c.$queryRawUnsafe(
        `SELECT (SELECT count(*) FROM "StockLocal" WHERE "id" = ${p.sl})::int AS "sl", (SELECT count(*) FROM "ProductoLocal" WHERE "id" = ${p.pl})::int AS "pl"`
      );
      ok(
        "K.8 rollback: la BAJA existió adentro y se fue con la transacción; StockLocal y ProductoLocal vuelven",
        adentro === 1 && quedan.sl === 1 && quedan.pl === 1 && (await cadena(c, p.pl)).length === antes,
        JSON.stringify({ adentro, quedan })
      );
    }

    // ── 9. Una falla al escribir el movimiento: la fila no desaparece ──────
    {
      const p = await productoK(c, "sin-identidad", 6, 0);
      await c.$executeRawUnsafe(`ALTER TABLE "ProductoLocal" DISABLE TRIGGER "ProductoLocal_libro_identidad"`);
      let error = "";
      try {
        await c.$executeRawUnsafe(CTE_ATOMICO(p.pl));
      } catch (err) {
        error = String(err?.message || err);
      }
      await c.$executeRawUnsafe(`ALTER TABLE "ProductoLocal" ENABLE TRIGGER "ProductoLocal_libro_identidad"`);
      const [quedan] = await c.$queryRawUnsafe(
        `SELECT (SELECT count(*) FROM "StockLocal" WHERE "id" = ${p.sl})::int AS "sl", (SELECT count(*) FROM "ProductoLocal" WHERE "id" = ${p.pl})::int AS "pl"`
      );
      ok(
        "K.9 sin la identidad recordada, la sentencia FALLA: el stock y el producto siguen ahí, sin BAJA a medias",
        /no se puede registrar la BAJA/.test(error) && quedan.sl === 1 && quedan.pl === 1 && !(await cadena(c, p.pl)).some((m) => m.tipo === "BAJA"),
        error.slice(0, 200)
      );

      // Una falla provocada DENTRO del INSERT del movimiento, con un DELETE normal.
      const q = await productoK(c, "insert-fallido", 2, 0);
      await c.$executeRawUnsafe(`ALTER TABLE "MovimientoStock" ADD CONSTRAINT "prueba_falla_k" CHECK ("origen" <> 'FALLA_PROVOCADA') NOT VALID`);
      let error2 = "";
      try {
        await c.$transaction(async (tx) => {
          await declararOrigenDeStock(tx, { origen: "FALLA_PROVOCADA" });
          await tx.$executeRawUnsafe(`DELETE FROM "StockLocal" WHERE "id" = ${q.sl}`);
        });
      } catch (err) {
        error2 = String(err?.message || err);
      }
      await c.$executeRawUnsafe(`ALTER TABLE "MovimientoStock" DROP CONSTRAINT "prueba_falla_k"`);
      const [sigue] = await c.$queryRawUnsafe(`SELECT count(*)::int AS "n" FROM "StockLocal" WHERE "id" = ${q.sl}`);
      ok("K.9 si el INSERT del movimiento falla, el DELETE de StockLocal se revierte con él", /prueba_falla_k/.test(error2) && sigue.n === 1, error2.slice(0, 200));
    }

    // ── 10. Concurrencia ─────────────────────────────────────────────────
    {
      const p = await productoK(c, "concurrencia", 10, 0);
      const otra = await clienteDe(url);
      let soltar;
      const suelto = new Promise((r) => (soltar = r));
      const tenedor = otra.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`UPDATE "StockLocal" SET "cantidad" = 11 WHERE "id" = ${p.sl}`);
          await suelto;
        },
        { timeout: 60_000 }
      );
      await esperar(300);
      const borrado = c.$executeRawUnsafe(CTE_ATOMICO(p.pl));
      await esperar(500);
      soltar();
      await tenedor;
      await borrado;
      const movs = await cadena(c, p.pl);
      ok(
        "K.10 un DELETE atómico que espera a otra transacción sobre la misma fila: CAMBIO y después BAJA, en orden, con el saldo que dejó la otra",
        movs.map((m) => m.tipo).join() === "ALTA,CAMBIO,BAJA" && movs[1].cp === 11 && bajaCompleta(movs[2], p, 11, 0) && movs[1].id < movs[2].id,
        JSON.stringify(movs.map((m) => [m.id, m.tipo, m.ca, m.cp]))
      );
    }

    const v = await verificarLibroStock(c);
    ok("K con todos los casos escritos: verificador en VERDE", v.integridad.ok, informeDelLibro(v).split("\n").filter((l) => l.includes("✗")).join(" | "));

    // ── Y la corrección sobrevive al backup ──────────────────────────────
    const fp = path.join(os.tmpdir(), `libro-k-dump-${process.pid}.sql`);
    await soltarClientes(url);
    execFileSync("pg_dump", ["--no-owner", "--no-acl", "-f", fp, url], { stdio: "pipe" });
    const urlR = await crearBase(`${PREFIJO}kr`);
    const restore = spawnSync("psql", [urlR, "-X", "-q", "-f", fp], { encoding: "utf8" });
    fs.rmSync(fp, { force: true });
    const r = await clienteDe(urlR);
    ok("K dump y restore sin errores", !/ERROR/.test(restore.stderr || ""), (restore.stderr || "").slice(0, 300));
    const p = await productoK(r, "restaurado", 5, 0);
    await r.$executeRawUnsafe(CTE_ATOMICO(p.pl));
    const bajas = (await cadena(r, p.pl)).filter((m) => m.tipo === "BAJA");
    ok("K sobre la base restaurada, el DELETE atómico deja su BAJA completa", bajas.length === 1 && bajaCompleta(bajas[0], p, 5, 0), JSON.stringify(bajas));
    ok("K y el verificador sigue en VERDE sobre la restaurada", (await rojasDe(r)).length === 0);
  }

  // ── Cierre sobre la base principal ────────────────────────────────────────
  seccion("Verificador sobre la base principal, con todo lo de arriba escrito");
  {
    const v = await verificarLibroStock(principal);
    console.log(informeDelLibro(v).split("\n").map((l) => `     ${l}`).join("\n"));
    ok("integridad física en VERDE", v.integridad.ok);
  }
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err}`);
  console.error(err);
} finally {
  // Limpieza de la base principal: los datos propios se borran por el camino
  // normal, así sus bajas quedan en el libro y las cadenas cerradas.
  try {
    if (propios.bases.length) {
      const pls = await principal.productoLocal.findMany({ where: { baseId: { in: propios.bases } }, select: { id: true } });
      await principal.stockLocal.deleteMany({ where: { productoId: { in: pls.map((p) => p.id) } } });
      await principal.productoLocal.deleteMany({ where: { baseId: { in: propios.bases } } });
      await principal.productoBase.deleteMany({ where: { id: { in: propios.bases } } });
    }
    if (propios.locales.length) await principal.local.deleteMany({ where: { id: { in: propios.locales } } });
    if (propios.grupo) await principal.grupo.delete({ where: { id: propios.grupo } });
  } catch (err) {
    console.error("limpieza de la base principal:", err?.message || err);
  }
  for (const x of clientes) await x.c.$disconnect().catch(() => {});
  await borrarBases();
  await principal.$disconnect();
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  for (const f of fallas) console.log(`  ✗ ${f.split("\n")[0]}`);
  process.exit(1);
}
