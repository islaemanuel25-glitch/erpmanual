// EL LIBRO DE COSTOS CONTRA POSTGRESQL.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/libroCostos.mjs
//
// Ejerce, sobre bases descartables construidas con las migraciones del árbol:
//
//   A. antes de activar: el libro está inerte y no registra nada;
//   B. la activación que no consigue el candado: falla entera, sin restos;
//   C. el reintento: punto cero completo, cantidades y huella;
//   D. la captura por cada escritor —Prisma create, createMany, update,
//      updateMany, upsert, SQL directo, la ruta real de eliminar producto—;
//   E. ProductoLocal y Local.es_deposito;
//   F. origen declarado y SIN_ORIGEN; txid y orden total;
//   G. la historia no se modifica ni se escribe a mano;
//   H. la escala: el libro alcanza para que `costoPorUnidadFisica` —la función
//      canónica, sin adaptador— dé lo mismo que sobre las tablas vivas;
//   I. la activación por migración: el camino de producción, con el candado
//      tomado, P3018/55P03, INTENTO_FALLIDO, `resolve --rolled-back` y reintento.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production. Las bases se
// borran al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const fs = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");
const { spawn, spawnSync } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");
const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones, MIGRACIONES } = await import("./lib/libroEnElTiempo.mjs");
const { declararOrigenDeCosto, ORIGEN_COSTO } = await import("../../lib/precios/origenDeCosto.js");
const { costoPorUnidadFisica } = await import("../../lib/conversiones/costoPorUnidadFisica.js");
const { TRIGGERS_DE_ACTIVACION, ORIGEN_ACTIVACION_COSTOS, SUFIJO_MIGRACION_ACTIVACION } = await import("../../lib/libros/libroCostos.js");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PREFIJO = "erpazul_libro_costos_prueba";
const urlDe = (db) => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${db}`;
  return u.toString();
};
const sinParametros = (url) => {
  const u = new URL(url);
  u.search = "";
  return u.toString();
};

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
const json = (x) => JSON.stringify(x, (_, v) => (typeof v === "bigint" ? Number(v) : v));
const igual = (titulo, real, esperado) => ok(titulo, json(real) === json(esperado), `real ${json(real)} · esperado ${json(esperado)}`);
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v === null || v === undefined ? null : Number(v));

const creadas = new Set();
async function crearBase(db) {
  if (!db.startsWith(PREFIJO)) throw new Error(`nombre de base de prueba inválido: ${db}`);
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${db}"`);
  creadas.add(db);
  return db;
}

/** Una transacción de OTRA conexión que escribe ProductoBase y no confirma. */
function retener(db, segundos) {
  return new Promise((resolve) => {
    const h = spawn("psql", [sinParametros(urlDe(db)), "-X", "-q", "-c",
      `BEGIN; UPDATE "ProductoBase" SET "nombre" = "nombre" WHERE "id" = (SELECT min("id") FROM "ProductoBase"); SELECT pg_sleep(${segundos}); ROLLBACK;`]);
    h.on("close", resolve);
  });
}

/** Espera a que otra sesión tenga el RowExclusiveLock de un UPDATE sobre ProductoBase. */
async function esperarRetencion(c) {
  for (let i = 0; i < 50; i += 1) {
    const [{ n }] = await c.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_locks l JOIN pg_class k ON k.oid = l.relation
      WHERE k.relname = 'ProductoBase' AND l.mode = 'RowExclusiveLock' AND l.granted AND l.pid <> pg_backend_pid()
        AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
    if (n > 0) return;
    await esperar(100);
  }
  throw new Error("la retención no tomó su candado en 5 s");
}


async function fotoDelLibro(c) {
  const [f] = await c.$queryRawUnsafe(`SELECT
      (SELECT count(*)::int FROM "CostoBaseVersion") AS base,
      (SELECT count(*)::int FROM "CostoUbicacionVersion") AS ubicacion,
      (SELECT count(*)::int FROM "LibroCostoActivacion") AS activacion,
      (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1)) AS triggers`,
    TRIGGERS_DE_ACTIVACION);
  return f;
}
const estadoDe = async (c) => (await c.$queryRawUnsafe(`SELECT * FROM "libro_costo_estado"()`))[0];
const versionesBase = (c, id) => c.$queryRawUnsafe(`SELECT * FROM "CostoBaseVersion" WHERE "productoBaseId" = $1 ORDER BY "version"`, id);
const versionesUbicacion = (c, id) => c.$queryRawUnsafe(`SELECT * FROM "CostoUbicacionVersion" WHERE "productoLocalId" = $1 ORDER BY "version"`, id);
const ultima = (filas) => filas[filas.length - 1];

/** El estado de la base en el libro a un instante: la consulta que usa el índice. */
const baseAlInstante = async (c, id, instante) =>
  (await c.$queryRawUnsafe(`SELECT * FROM "CostoBaseVersion" WHERE "productoBaseId" = $1 AND "instante" <= $2::timestamp
    ORDER BY "instante" DESC, "version" DESC LIMIT 1`, id, instante))[0] ?? null;

/** Lo que el trigger de la base tiene que haber copiado, leído de la fila viva. */
const estadoVivoBase = (b) => ({
  grupoId: b.grupoId, precioCosto: num(b.precio_costo), unidadMedida: b.unidad_medida, factorPack: b.factor_pack,
  pesoReferenciaKg: num(b.pesoReferenciaKg), pesoEsFijo: b.pesoEsFijo, modoCompraProveedor: b.modoCompraProveedor,
  modoVentaDeposito: b.modoVentaDeposito, esCombo: b.es_combo,
});
const estadoDeVersion = (v) => ({
  grupoId: v.grupoId, precioCosto: num(v.precioCosto), unidadMedida: v.unidadMedida, factorPack: v.factorPack,
  pesoReferenciaKg: num(v.pesoReferenciaKg), pesoEsFijo: v.pesoEsFijo, modoCompraProveedor: v.modoCompraProveedor,
  modoVentaDeposito: v.modoVentaDeposito, esCombo: v.esCombo,
});

/** Espera un error de PostgreSQL y devuelve su texto; null si no hubo error. */
async function error(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return `${e?.message ?? e} ${json(e?.meta ?? {})}`;
  }
}

let c = null;
let cMig = null;
try {
  // ══════════════════════════════════════════════════════════════════════════
  seccion("A. Antes de activar: inerte");
  // ══════════════════════════════════════════════════════════════════════════
  const DB = await crearBase(PREFIJO);
  aplicarMigraciones(sinParametros(urlDe(DB)));
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlDe(DB) });

  const grupo = await c.grupo.create({ data: { nombre: "Libro de costos" } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const localA = await c.local.create({ data: { nombre: "Local A" } });
  const localB = await c.local.create({ data: { nombre: "Local B" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  for (const l of [localA, localB]) await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: l.id } });

  // Las familias del negocio, con la configuración que el formulario permite.
  const FAMILIAS = {
    MANI: { nombre: "MANI CON CASCARA x2KG", unidad_medida: "kg", factor_pack: 2, pesoReferenciaKg: 2, pesoEsFijo: true, modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD", precio_costo: 4500 },
    CHISITO: { nombre: "QUETH CHISITOS 400G", unidad_medida: "kg", pesoReferenciaKg: 0.4, pesoEsFijo: true, modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD", precio_costo: 5000 },
    MORTADELA: { nombre: "Mortadela", unidad_medida: "kg", pesoReferenciaKg: 4.5, pesoEsFijo: true, modoVentaDeposito: "PIEZA", modoCompraProveedor: "UNIDAD", precio_costo: 10000 },
    CREMOSO: { nombre: "Cremoso por peso", unidad_medida: "kg", pesoReferenciaKg: 4.5, modoVentaDeposito: "PESO", modoCompraProveedor: "UNIDAD", precio_costo: 3800 },
    PACK: { nombre: "Gaseosa pack x6", unidad_medida: "pack", factor_pack: 6, precio_costo: 12000 },
    CAJON: { nombre: "Cerveza cajón x8", unidad_medida: "cajon", factor_pack: 8, precio_costo: 24000 },
    UNIDAD: { nombre: "Alfajor", unidad_medida: "unidad", precio_costo: 1000 },
    COMBO: { nombre: "Combo picada", unidad_medida: "unidad", es_combo: true, precio_costo: 0 },
    SIN_COSTO: { nombre: "Sin costo cargado", unidad_medida: "unidad", precio_costo: 0 },
  };
  const bases = {};
  const pls = {};
  for (const [clave, datos] of Object.entries(FAMILIAS)) {
    bases[clave] = await c.productoBase.create({
      data: { grupoId: grupo.id, creadoEnLocalId: deposito.id, codigo_barra: `cb-${clave}`, precio_venta: 1, ...datos },
    });
    pls[clave] = {};
    for (const [donde, l] of [["deposito", deposito], ["A", localA], ["B", localB]]) {
      pls[clave][donde] = await c.productoLocal.create({ data: { localId: l.id, baseId: bases[clave].id } });
    }
  }
  // Un costo propio en A y un cero cargado en B: los dos son datos crudos.
  await c.productoLocal.update({ where: { id: pls.PACK.A.id }, data: { precio_costo: 13000 } });
  await c.productoLocal.update({ where: { id: pls.UNIDAD.B.id }, data: { precio_costo: 0 } });

  let est = await estadoDe(c);
  ok("estado NO_ACTIVADO", est.estado === "NO_ACTIVADO", json(est));
  igual("sin versiones, sin fila de activación y sin triggers de captura", await fotoDelLibro(c), { base: 0, ubicacion: 0, activacion: 0, triggers: 0 });
  await c.productoBase.update({ where: { id: bases.UNIDAD.id }, data: { precio_costo: 1000 } });
  await c.$executeRawUnsafe(`UPDATE "ProductoBase" SET "precio_costo" = "precio_costo" + 0 WHERE "id" = $1`, bases.UNIDAD.id);
  igual("escribir antes de activar no deja historia: el libro no inventa lo anterior", await fotoDelLibro(c), { base: 0, ubicacion: 0, activacion: 0, triggers: 0 });
  ok("antes de activar, TRUNCATE de las tablas vacías se permite (los scripts que vacían la base siguen andando)",
    (await error(() => c.$executeRawUnsafe(`TRUNCATE "CostoBaseVersion", "CostoUbicacionVersion", "LibroCostoActivacion"`))) === null);
  ok("aun antes de activar, nadie inserta una versión a mano",
    /solo lo escriben sus triggers/.test((await error(() => c.$executeRawUnsafe(
      `INSERT INTO "CostoBaseVersion" ("version","productoBaseId","grupoId","tipo","instante","dia","precioCosto","unidadMedida","pesoEsFijo","modoCompraProveedor","modoVentaDeposito","esCombo","origen","txid")
       VALUES (1, 1, 1, 'ALTA', now(), current_date, 1, 'unidad', false, 'BULTO', 'PESO', false, 'X', 1)`))) ?? ""));

  // ══════════════════════════════════════════════════════════════════════════
  seccion("B. La activación sin candado falla entera (21)");
  // ══════════════════════════════════════════════════════════════════════════
  {
    const ret = retener(DB, 8);
    await esperarRetencion(c);
    const t0 = Date.now();
    const e = await error(() => c.$queryRawUnsafe(`SELECT "libro_costo_activar"()::text AS r`));
    const demora = Date.now() - t0;
    await ret;
    ok("falla por el tope de espera: SQLSTATE 55P03, lock timeout", e !== null && /55P03|lock timeout/i.test(e), e ?? "no falló");
    ok(`y falla rápido, a los ~3 s (${demora} ms), no detrás de la transacción larga`, demora >= 2500 && demora < 7000);
    igual("no dejó triggers, ni versiones, ni fila de activación", await fotoDelLibro(c), { base: 0, ubicacion: 0, activacion: 0, triggers: 0 });
    est = await estadoDe(c);
    ok("el estado sigue NO_ACTIVADO", est.estado === "NO_ACTIVADO", json(est));
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("C. El reintento: punto cero (1, 2, 17, 22)");
  // ══════════════════════════════════════════════════════════════════════════
  const [huellaAntes] = await c.$queryRawUnsafe(`SELECT * FROM "libro_costo_huella_fuente"()`);
  const [{ r: activacionTexto }] = await c.$queryRawUnsafe(`SELECT "libro_costo_activar"()::text AS r`);
  const act = JSON.parse(activacionTexto);
  const nBases = await c.productoBase.count();
  const nUbicaciones = await c.productoLocal.count();
  est = await estadoDe(c);
  ok("el segundo intento activa: estado ACTIVADO", est.estado === "ACTIVADO", json(est));
  igual("cantidades del punto cero = filas vivas", [act.cantidadBase, act.cantidadUbicacion], [nBases, nUbicaciones]);
  igual("seis triggers instalados, una fila de activación", await fotoDelLibro(c), { base: nBases, ubicacion: nUbicaciones, activacion: 1, triggers: 6 });
  igual("la huella guardada es la de las tablas en ese instante", [act.huellaBase, act.huellaUbicacion], [huellaAntes.base, huellaAntes.ubicacion]);
  const cero = await c.$queryRawUnsafe(`SELECT "version", "instante", "txid", "origen" FROM "CostoBaseVersion" WHERE "tipo" = 'PUNTO_CERO'
    UNION ALL SELECT "version", "instante", "txid", "origen" FROM "CostoUbicacionVersion" WHERE "tipo" = 'PUNTO_CERO' ORDER BY 1`);
  ok("un único instante, una única transacción y el origen de la activación",
    new Set(cero.map((x) => x.instante.toISOString())).size === 1 && new Set(cero.map((x) => String(x.txid))).size === 1 &&
      cero.every((x) => x.origen === ORIGEN_ACTIVACION_COSTOS));
  ok("mismo instante, versiones distintas: el orden lo da la secuencia (17)",
    new Set(cero.map((x) => String(x.version))).size === cero.length);
  ok("todas las versiones del punto cero están estrictamente entre versionDesde y versionHasta",
    cero.every((x) => Number(x.version) > act.versionDesde && Number(x.version) < act.versionHasta));
  const vivas = await c.productoBase.findMany({ orderBy: { id: "asc" } });
  let todasIguales = true;
  for (const b of vivas) {
    const [v] = await versionesBase(c, b.id);
    if (json(estadoDeVersion(v)) !== json(estadoVivoBase(b))) todasIguales = false;
  }
  ok("cada PUNTO_CERO de base es el estado completo de su fila", todasIguales);
  const [depCero] = await versionesUbicacion(c, pls.PACK.deposito.id);
  const [aCero] = await versionesUbicacion(c, pls.PACK.A.id);
  ok("cada PUNTO_CERO de ubicación congela su costo crudo y si es depósito",
    depCero.esDeposito === true && depCero.precioCosto === null && aCero.esDeposito === false && num(aCero.precioCosto) === 13000);
  ok("activar dos veces se rechaza y no duplica el punto cero",
    /LIBRO_COSTO_YA_ACTIVADO/.test((await error(() => c.$queryRawUnsafe(`SELECT "libro_costo_activar"()::text`))) ?? "") &&
      (await fotoDelLibro(c)).base === nBases);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("D. La captura, por cada escritor (3, 4, 5, 6, 7, 15, 23)");
  // ══════════════════════════════════════════════════════════════════════════
  const nuevo = await c.productoBase.create({
    data: { grupoId: grupo.id, creadoEnLocalId: deposito.id, nombre: "Nace hoy", codigo_barra: "cb-nace", unidad_medida: "unidad", precio_costo: 700, precio_venta: 1 },
  });
  let vs = await versionesBase(c, nuevo.id);
  ok("Prisma create → ALTA con el estado completo", vs.length === 1 && vs[0].tipo === "ALTA" && json(estadoDeVersion(vs[0])) === json(estadoVivoBase(nuevo)), json(vs));

  await c.productoBase.createMany({
    data: [
      { grupoId: grupo.id, creadoEnLocalId: deposito.id, nombre: "Lote 1", codigo_barra: "cb-l1", unidad_medida: "unidad", precio_costo: 11, precio_venta: 1 },
      { grupoId: grupo.id, creadoEnLocalId: deposito.id, nombre: "Lote 2", codigo_barra: "cb-l2", unidad_medida: "pack", factor_pack: 12, precio_costo: 22, precio_venta: 1 },
    ],
  });
  const lote = await c.productoBase.findMany({ where: { codigo_barra: { in: ["cb-l1", "cb-l2"] } } });
  ok("Prisma createMany → un ALTA por fila", (await Promise.all(lote.map((b) => versionesBase(c, b.id)))).every((v) => v.length === 1 && v[0].tipo === "ALTA"));

  await c.$executeRawUnsafe(`INSERT INTO "ProductoBase" ("grupoId","creadoEnLocalId",nombre,codigo_barra,unidad_medida,precio_costo,precio_venta,"updatedAt")
    VALUES ($1, $2, 'Por SQL', 'cb-sql', 'kg', 3100, 1, now())`, grupo.id, deposito.id);
  const porSql = await c.productoBase.findFirst({ where: { codigo_barra: "cb-sql" } });
  vs = await versionesBase(c, porSql.id);
  ok("SQL directo (INSERT) → ALTA", vs.length === 1 && vs[0].tipo === "ALTA" && num(vs[0].precioCosto) === 3100);

  await c.productoBase.update({ where: { id: nuevo.id }, data: { precio_costo: 800 } });
  vs = await versionesBase(c, nuevo.id);
  ok("Prisma update del precio → CAMBIO [precio_costo] con el estado completo",
    ultima(vs).tipo === "CAMBIO" && json(ultima(vs).camposCambiados) === json(["precio_costo"]) && num(ultima(vs).precioCosto) === 800 &&
      ultima(vs).unidadMedida === "unidad" && ultima(vs).grupoId === grupo.id);

  await c.productoBase.update({
    where: { id: nuevo.id },
    data: { unidad_medida: "kg", factor_pack: 3, pesoReferenciaKg: 1.25, pesoEsFijo: true, modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA" },
  });
  const escalaNueva = await c.productoBase.findUnique({ where: { id: nuevo.id } });
  vs = await versionesBase(c, nuevo.id);
  igual("cambio de escala → CAMBIO con los seis campos que se movieron", [...ultima(vs).camposCambiados].sort(),
    ["factor_pack", "modoCompraProveedor", "modoVentaDeposito", "pesoEsFijo", "pesoReferenciaKg", "unidad_medida"]);
  igual("y la versión es el estado completo, no el delta", estadoDeVersion(ultima(vs)), estadoVivoBase(escalaNueva));

  const antesIrrelevante = (await versionesBase(c, nuevo.id)).length;
  await c.productoBase.update({ where: { id: nuevo.id }, data: { nombre: "Nace hoy (renombrado)", precio_venta: 99, activo: false } });
  await c.productoBase.update({ where: { id: nuevo.id }, data: { precio_costo: 800 } });
  await c.$executeRawUnsafe(`UPDATE "ProductoBase" SET "precio_costo" = "precio_costo", "updatedAt" = now() WHERE "id" = $1`, nuevo.id);
  ok("UPDATE irrelevante, o que deja el mismo valor, no deja versión", (await versionesBase(c, nuevo.id)).length === antesIrrelevante);

  await c.productoBase.updateMany({ where: { id: { in: lote.map((b) => b.id) } }, data: { precio_costo: 50 } });
  ok("Prisma updateMany → un CAMBIO por fila",
    (await Promise.all(lote.map((b) => versionesBase(c, b.id)))).every((v) => v.length === 2 && ultima(v).tipo === "CAMBIO" && num(ultima(v).precioCosto) === 50));

  await c.productoBase.upsert({ where: { id: porSql.id }, update: { precio_costo: 3300 }, create: { grupoId: grupo.id, nombre: "x", unidad_medida: "kg", precio_costo: 1, precio_venta: 1 } });
  ok("Prisma upsert (rama update) → CAMBIO", num(ultima(await versionesBase(c, porSql.id)).precioCosto) === 3300);

  await c.$executeRawUnsafe(`UPDATE "ProductoBase" SET "precio_costo" = 3400 WHERE "id" = $1`, porSql.id);
  ok("SQL directo (UPDATE) → CAMBIO", num(ultima(await versionesBase(c, porSql.id)).precioCosto) === 3400);

  // El borrado por la RUTA REAL de la aplicación, con su origen declarado.
  const rol = await c.rol.create({ data: { nombre: "CI libro costos", permisos: ["productos.eliminar"] } });
  const usuario = await c.usuario.create({ data: { nombre: "CI", email: "ci-libro-costos@ci.local", passwordHash: "x", rolId: rol.id, localId: deposito.id } });
  process.env.DATABASE_URL = urlDe(DB);
  const rutaEliminar = await import("../../app/api/productos/eliminar/[id]/route.js");
  const sesion = jwt.sign({ id: usuario.id, nombre: "CI", email: "ci-libro-costos@ci.local", localId: deposito.id, permisos: ["productos.eliminar"] },
    process.env.AUTH_SECRET, { expiresIn: "1h" });
  const aBorrar = bases.CREMOSO;
  const antesDeBorrar = await c.$queryRawUnsafe(`SELECT "libro_stock_instante"() AS t`);
  const res = await rutaEliminar.DELETE(
    new Request(`http://ci/api/productos/eliminar/${aBorrar.id}`, { method: "DELETE", headers: { cookie: `erpazul_sesion=${sesion}` } }),
    { params: Promise.resolve({ id: String(aBorrar.id) }) }
  );
  ok("la ruta de eliminar producto contesta 200", res.status === 200, `${res.status} ${await res.text().catch(() => "")}`);
  ok("el producto ya no existe", (await c.productoBase.findUnique({ where: { id: aBorrar.id } })) === null);
  vs = await versionesBase(c, aBorrar.id);
  const baja = ultima(vs);
  ok("DELETE → BAJA con el último estado y la identidad congelada",
    baja.tipo === "BAJA" && baja.nombreCongelado === FAMILIAS.CREMOSO.nombre && baja.codigoBarraCongelado === "cb-CREMOSO" &&
      num(baja.precioCosto) === 3800 && baja.unidadMedida === "kg");
  ok("con el origen que declara la ruta: ELIMINACION_PRODUCTO",
    baja.origen === ORIGEN_COSTO.ELIMINACION_PRODUCTO && baja.origenRef === String(aBorrar.id), `${baja.origen} ${baja.origenRef}`);
  const ubicBorradas = await Promise.all(["deposito", "A", "B"].map((d) => versionesUbicacion(c, pls.CREMOSO[d].id)));
  ok("y sus tres ubicaciones, BAJA en la misma transacción que la base",
    ubicBorradas.every((v) => ultima(v).tipo === "BAJA" && String(ultima(v).txid) === String(baja.txid)));
  const reconstruido = await baseAlInstante(c, aBorrar.id, antesDeBorrar[0].t);
  ok("borrado, sigue reconstruible: su estado antes de la baja sale del libro (23)",
    reconstruido?.tipo === "PUNTO_CERO" && num(reconstruido.precioCosto) === 3800 && reconstruido.modoVentaDeposito === "PESO");

  // La baja de un Grupo arrastra sus ProductoBase por la cascada de la clave:
  // el trigger de fila la ve igual que un DELETE directo.
  const grupoEfimero = await c.grupo.create({ data: { nombre: "Grupo que se borra" } });
  const enCascada = await c.productoBase.create({
    data: { grupoId: grupoEfimero.id, nombre: "Arrastrado", codigo_barra: "cb-cascada", unidad_medida: "unidad", precio_costo: 55, precio_venta: 1 },
  });
  await c.grupo.delete({ where: { id: grupoEfimero.id } });
  vs = await versionesBase(c, enCascada.id);
  ok("DELETE en cascada desde Grupo → BAJA con la identidad congelada",
    (await c.productoBase.findUnique({ where: { id: enCascada.id } })) === null &&
      ultima(vs).tipo === "BAJA" && ultima(vs).nombreCongelado === "Arrastrado" && ultima(vs).grupoId === grupoEfimero.id, json(vs));

  // ══════════════════════════════════════════════════════════════════════════
  seccion("E. Ubicaciones y depósito (8, 9, 10, 11, 12)");
  // ══════════════════════════════════════════════════════════════════════════
  const plNuevo = await c.productoLocal.create({ data: { localId: localA.id, baseId: nuevo.id } });
  let vu = await versionesUbicacion(c, plNuevo.id);
  ok("INSERT ProductoLocal → ALTA, heredando (costo NULL) y con esDeposito del local",
    vu.length === 1 && vu[0].tipo === "ALTA" && vu[0].precioCosto === null && vu[0].esDeposito === false && vu[0].productoBaseId === nuevo.id);
  await c.productoLocal.update({ where: { id: plNuevo.id }, data: { precio_costo: 950 } });
  vu = await versionesUbicacion(c, plNuevo.id);
  ok("costo propio → CAMBIO [precio_costo]", ultima(vu).tipo === "CAMBIO" && num(ultima(vu).precioCosto) === 950 && json(ultima(vu).camposCambiados) === json(["precio_costo"]));
  await c.productoLocal.update({ where: { id: plNuevo.id }, data: { precio_costo: null } });
  vu = await versionesUbicacion(c, plNuevo.id);
  ok("quitar el costo propio (NULL) → CAMBIO con precioCosto NULL", ultima(vu).tipo === "CAMBIO" && ultima(vu).precioCosto === null);
  const antesVenta = vu.length;
  await c.productoLocal.update({ where: { id: plNuevo.id }, data: { precio_venta: 5, nombre: "alias" } });
  ok("cambiar la venta o el nombre de la ubicación no deja versión", (await versionesUbicacion(c, plNuevo.id)).length === antesVenta);
  await c.productoLocal.delete({ where: { id: plNuevo.id } });
  vu = await versionesUbicacion(c, plNuevo.id);
  ok("delete ProductoLocal → BAJA con su último estado", ultima(vu).tipo === "BAJA" && ultima(vu).localId === localA.id);

  const deB = await c.productoLocal.findMany({ where: { localId: localB.id }, orderBy: { id: "asc" } });
  const deA = await c.productoLocal.findMany({ where: { localId: localA.id } });
  const versionesDeA = async () => (await Promise.all(deA.map((pl) => versionesUbicacion(c, pl.id)))).reduce((n, v) => n + v.length, 0);
  const aAntes = await versionesDeA();
  await c.local.update({ where: { id: localB.id }, data: { es_deposito: true } });
  const cambiosB = await Promise.all(deB.map((pl) => versionesUbicacion(c, pl.id)));
  ok(`Local B pasa a depósito → CAMBIO [esDeposito] en sus ${deB.length} ubicaciones, con el costo que tenían`,
    cambiosB.every((v, i) => ultima(v).tipo === "CAMBIO" && ultima(v).esDeposito === true &&
      json(ultima(v).camposCambiados) === json(["esDeposito"]) && num(ultima(v).precioCosto) === num(deB[i].precio_costo)));
  ok("y las ubicaciones de otro local no se tocan", (await versionesDeA()) === aAntes);
  const vuelta = await c.local.update({ where: { id: localB.id }, data: { nombre: "Local B (renombrado)" } });
  ok("renombrar el local no deja versión", vuelta && (await Promise.all(deB.map((pl) => versionesUbicacion(c, pl.id)))).every((v, i) => v.length === cambiosB[i].length));

  // ══════════════════════════════════════════════════════════════════════════
  seccion("F. Origen, txid y orden total (13, 14, 16)");
  // ══════════════════════════════════════════════════════════════════════════
  await c.$transaction(async (tx) => {
    await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.COMPRA_PROVEEDOR, referencia: "77" });
    await tx.productoBase.update({ where: { id: bases.UNIDAD.id }, data: { precio_costo: 1200 } });
    await tx.productoLocal.updateMany({ where: { baseId: bases.UNIDAD.id, localId: { in: [localA.id, localB.id] } }, data: { precio_costo: 1200 } });
  });
  const vB = ultima(await versionesBase(c, bases.UNIDAD.id));
  const vA = ultima(await versionesUbicacion(c, pls.UNIDAD.A.id));
  const vBB = ultima(await versionesUbicacion(c, pls.UNIDAD.B.id));
  ok("origen declarado → COMPRA_PROVEEDOR con su referencia, en la base y en sus ubicaciones",
    [vB, vA, vBB].every((v) => v.origen === ORIGEN_COSTO.COMPRA_PROVEEDOR && v.origenRef === "77"), json([vB.origen, vA.origen, vBB.origen]));
  ok("la base y la propagación comparten txid (16)", new Set([vB, vA, vBB].map((v) => String(v.txid))).size === 1);
  ok("y quedan en orden total: base antes que ubicaciones, versiones crecientes",
    BigInt(vB.version) < BigInt(vA.version) && BigInt(vA.version) !== BigInt(vBB.version));
  await c.productoBase.update({ where: { id: bases.UNIDAD.id }, data: { precio_costo: 1300 } });
  const sinOrigen = ultima(await versionesBase(c, bases.UNIDAD.id));
  ok("sin declarar → SIN_ORIGEN, y la transacción siguiente no hereda el origen anterior (14)",
    sinOrigen.origen === "SIN_ORIGEN" && sinOrigen.origenRef === null && String(sinOrigen.txid) !== String(vB.txid));

  // ══════════════════════════════════════════════════════════════════════════
  seccion("G. La historia no se modifica (18, 19, 20)");
  // ══════════════════════════════════════════════════════════════════════════
  const fotoAntes = await fotoDelLibro(c);
  for (const tabla of ["CostoBaseVersion", "CostoUbicacionVersion", "LibroCostoActivacion"]) {
    const clave = tabla === "LibroCostoActivacion" ? `"id"` : `"version"`;
    ok(`UPDATE de ${tabla} rechazado`, /no se modifica: UPDATE/.test((await error(() => c.$executeRawUnsafe(`UPDATE "${tabla}" SET ${clave} = ${clave}`))) ?? ""));
    ok(`DELETE de ${tabla} rechazado`, /no se modifica: DELETE/.test((await error(() => c.$executeRawUnsafe(`DELETE FROM "${tabla}"`))) ?? ""));
    ok(`TRUNCATE de ${tabla} rechazado`, /no se modifica: TRUNCATE/.test((await error(() => c.$executeRawUnsafe(`TRUNCATE "${tabla}"`))) ?? ""));
  }
  ok("INSERT a mano rechazado",
    /solo lo escriben sus triggers/.test((await error(() => c.$executeRawUnsafe(`INSERT INTO "CostoBaseVersion" SELECT * FROM "CostoBaseVersion" LIMIT 1`))) ?? ""));
  igual("después de todos los intentos, el libro está igual", await fotoDelLibro(c), fotoAntes);
  ok("y la huella del punto cero sigue siendo la guardada (ACTIVADO)", (await estadoDe(c)).estado === "ACTIVADO");
  const [huellaAhora] = await c.$queryRawUnsafe(`SELECT * FROM "libro_costo_huella_fuente"()`);
  ok("CONTRAPRUEBA: la huella mira los datos —la de las tablas vivas ya no es la del punto cero—",
    huellaAhora.base !== act.huellaBase);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("H. La escala alcanza para la función canónica (24–28)");
  // ══════════════════════════════════════════════════════════════════════════
  // La versión del libro va DIRECTO a `costoPorUnidadFisica`: sus columnas son
  // los nombres que la función acepta. Lo que se compara es contra la misma
  // función sobre las filas vivas: el libro no puede perder nada de la escala.
  const COMPARAR = ["MANI", "CHISITO", "MORTADELA", "PACK", "CAJON", "COMBO", "SIN_COSTO", "UNIDAD"];
  for (const clave of COMPARAR) {
    const vivo = await c.productoBase.findUnique({ where: { id: bases[clave].id } });
    const vBase = ultima(await versionesBase(c, vivo.id));
    for (const donde of ["deposito", "A", "B"]) {
      const plVivo = await c.productoLocal.findUnique({ where: { id: pls[clave][donde].id }, include: { local: true } });
      const vUb = ultima(await versionesUbicacion(c, plVivo.id));
      const desdeLibro = costoPorUnidadFisica({ costoBase: vBase.precioCosto, costoLocal: vUb.precioCosto, producto: vBase, esDeposito: vUb.esDeposito });
      const desdeTablas = costoPorUnidadFisica({ costoBase: vivo.precio_costo, costoLocal: plVivo.precio_costo, producto: vivo, esDeposito: plVivo.local.es_deposito });
      igual(`${clave} en ${donde}: el libro da ${desdeLibro.estado} ${desdeLibro.unidadFisica ?? "—"} a ${desdeLibro.costoPorUnidadFisica ?? "—"}`,
        desdeLibro, desdeTablas);
    }
  }
  const valor = async (clave, donde) => {
    const vBase = ultima(await versionesBase(c, bases[clave].id));
    const vUb = ultima(await versionesUbicacion(c, pls[clave][donde].id));
    return costoPorUnidadFisica({ costoBase: vBase.precioCosto, costoLocal: vUb.precioCosto, producto: vBase, esDeposito: vUb.esDeposito });
  };
  const mani = await valor("MANI", "deposito");
  const maniLocal = await valor("MANI", "A");
  ok("MANÍ: $4.500/kg, pieza de 2 kg = $9.000 en el depósito; $4.500/kg en el local (el factor 2 no participa) (25, 26)",
    mani.unidadFisica === "PIEZA" && mani.costoPorUnidadFisica === 9000 && maniLocal.unidadFisica === "KG" && maniLocal.costoPorUnidadFisica === 4500, json([mani, maniLocal]));
  const chisito = await valor("CHISITO", "deposito");
  ok("CHISITO 400 g: pieza $2.000 en el depósito (26)", chisito.unidadFisica === "PIEZA" && chisito.costoPorUnidadFisica === 2000);
  const pack = await valor("PACK", "deposito");
  const packA = await valor("PACK", "A");
  ok("PACK x6 $12.000 → $2.000 la unidad; con costo propio de A $13.000 → $2.166,67 (27)",
    pack.costoPorUnidadFisica === 2000 && Math.abs(packA.costoPorUnidadFisica - 13000 / 6) < 0.01, json([pack, packA]));
  const combo = await valor("COMBO", "deposito");
  ok("COMBO: identificado como combo, NO_APLICA (24)", combo.estado === "NO_APLICA" && ultima(await versionesBase(c, bases.COMBO.id)).esCombo === true);
  const sinCosto = await valor("SIN_COSTO", "deposito");
  ok("costo cero en la base → SIN_COSTO (28)", sinCosto.estado === "SIN_COSTO", json(sinCosto));
  const [ceroCrudo] = await versionesUbicacion(c, pls.UNIDAD.B.id);
  ok("el cero cargado en una ubicación se guarda CRUDO (0, no NULL): que no vale lo decide la regla de precios (28)",
    num(ceroCrudo.precioCosto) === 0);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("I. Contraprueba del estado");
  // ══════════════════════════════════════════════════════════════════════════
  await c.$executeRawUnsafe(`DROP TRIGGER "Local_costo_version" ON "Local"`);
  est = await estadoDe(c);
  ok("sin uno de los triggers, el estado dice INCONSISTENTE y no ACTIVADO", est.estado === "INCONSISTENTE", json(est));

  // ══════════════════════════════════════════════════════════════════════════
  seccion("J. La activación por migración: el camino de producción (21, 22)");
  // ══════════════════════════════════════════════════════════════════════════
  // La activación de producción va a ser una migración que solo llama a la
  // función. Se arma acá con un nombre de ejemplo, sobre una base con las
  // migraciones reales aplicadas por `migrate deploy`, y se ejerce el caso
  // malo: una transacción reteniendo ProductoBase.
  const DBM = await crearBase(`${PREFIJO}_migracion`);
  const ACTIVACION = `20991231000000${SUFIJO_MIGRACION_ACTIVACION}`;
  const armarDir = (conActivacion) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "libro-costos-"));
    const d = path.join(dir, "prisma");
    fs.mkdirSync(path.join(d, "migrations"), { recursive: true });
    fs.copyFileSync(path.join(RAIZ, "prisma/schema.prisma"), path.join(d, "schema.prisma"));
    fs.copyFileSync(path.join(RAIZ, "prisma/migrations/migration_lock.toml"), path.join(d, "migrations", "migration_lock.toml"));
    for (const m of MIGRACIONES) fs.cpSync(path.join(RAIZ, "prisma/migrations", m), path.join(d, "migrations", m), { recursive: true });
    if (conActivacion) {
      fs.mkdirSync(path.join(d, "migrations", ACTIVACION));
      fs.writeFileSync(path.join(d, "migrations", ACTIVACION, "migration.sql"), `SELECT "libro_costo_activar"();\n`);
    }
    return path.join(d, "schema.prisma");
  };
  const prisma = (args, schema) => {
    const r = spawnSync("npx", ["prisma", ...args, "--schema", schema], {
      cwd: RAIZ, encoding: "utf8", env: { ...process.env, DATABASE_URL: urlDe(DBM) },
    });
    return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
  };
  let r = prisma(["migrate", "deploy"], armarDir(false));
  ok("las migraciones del árbol se aplican con migrate deploy", r.codigo === 0, r.salida.slice(-300));
  cMig = await crearClientePrisma({ nivel: ESCRITURA, url: urlDe(DBM) });
  const gM = await cMig.grupo.create({ data: { nombre: "g" } });
  const lM = await cMig.local.create({ data: { nombre: "Dep", es_deposito: true } });
  for (let i = 0; i < 50; i += 1) {
    const b = await cMig.productoBase.create({ data: { grupoId: gM.id, nombre: `p${i}`, codigo_barra: `m${i}`, unidad_medida: "unidad", precio_costo: 10 + i, precio_venta: 1 } });
    await cMig.productoLocal.create({ data: { localId: lM.id, baseId: b.id } });
  }
  est = await estadoDe(cMig);
  ok("recién desplegada, sin la migración de activación: NO_ACTIVADO", est.estado === "NO_ACTIVADO", json(est));

  const schemaConActivacion = armarDir(true);
  {
    const ret = retener(DBM, 8);
    await esperarRetencion(cMig);
    r = prisma(["migrate", "deploy"], schemaConActivacion);
    await ret;
  }
  ok("con una transacción reteniendo ProductoBase, migrate deploy falla: P3018 y 55P03",
    r.codigo !== 0 && /P3018/.test(r.salida) && /55P03|lock timeout/i.test(r.salida), r.salida.slice(-400));
  igual("sin triggers, sin versiones y sin fila de activación", await fotoDelLibro(cMig), { base: 0, ubicacion: 0, activacion: 0, triggers: 0 });
  est = await estadoDe(cMig);
  ok("el estado lo nombra: INTENTO_FALLIDO", est.estado === "INTENTO_FALLIDO", json(est));

  r = prisma(["migrate", "resolve", "--rolled-back", ACTIVACION], schemaConActivacion);
  ok("migrate resolve --rolled-back sale con 0", r.codigo === 0, r.salida.slice(-300));
  est = await estadoDe(cMig);
  ok("resuelta: NO_ACTIVADO, con un intento revertido contado", est.estado === "NO_ACTIVADO" && est.intentos_revertidos === 1, json(est));

  r = prisma(["migrate", "deploy"], schemaConActivacion);
  ok("el reintento, sin bloqueo, aplica la activación", r.codigo === 0, r.salida.slice(-300));
  est = await estadoDe(cMig);
  ok("ACTIVADO, con 50 bases y 50 ubicaciones en el punto cero", est.estado === "ACTIVADO" && /50 bases y 50 ubicaciones/.test(est.detalle), json(est));
  ok("y la historia del intento revertido sigue a la vista", est.intentos_revertidos === 1);
} catch (e) {
  fallas.push(`la prueba se cayó: ${e?.stack || e}`);
  console.log(`  ✗ la prueba se cayó: ${e?.stack || e}`);
} finally {
  await c?.$disconnect().catch(() => {});
  await cMig?.$disconnect().catch(() => {});
  for (const db of creadas) await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
