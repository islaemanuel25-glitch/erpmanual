// PRUEBAS DE BASE DE OPERADORES Y EMPLEADOS POR LOCAL (2026-10-15).
//
//   AUTH_SECRET=... node --import ./scripts/alias-loader.mjs scripts/pruebas-db/operadoresPorLocal.mjs
//
// Regla de Emanuel: un operador y un empleado son de UN local, el que los
// contrata. Todo lo suyo —cajas, sueldo, adelanto, consumo— es de ese local.
//
// ── QUÉ SE PRUEBA ACÁ QUE NINGÚN CANDADO PUEDE PROBAR ──────────────────────
//
//   A. LA MIGRACIÓN `20261015232632_operadores_y_empleados_por_local` sobre una
//      base AISLADA con los 6 operadores y 6 empleados de producción tal como
//      están (Mariangel en Casiano casas; Belén, Roxana, Alexis, Samira y
//      Tiffany en Mini unidas, uno a uno): cada uno queda en su local, el
//      relleno corrido otra vez no cambia nada, y el nombre pasa a ser único
//      por local.
//   B. EL FRENO: sobre otra base aislada con un operador —y aparte un
//      empleado— en dos locales, la migración se frena con error y no aplica
//      nada.
//   C. Administración, con las rutas reales: listas del local activo (también
//      para un admin, por el selector), el alta en el local activo, el mismo
//      nombre en dos locales sí y repetido en el mismo no, ni elegir ni mudar
//      de local, y un operador nuevo con su empleado en su local.
//   D. El POS: la lista de operadores y el login por local; Pagar → Sueldo y
//      Consumo del personal ofrecen solo empleados del local de la caja y
//      rechazan con 403 uno de otro local; el gasto es del local del empleado.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });
const prisma = principal;
const jwt = (await import("jsonwebtoken")).default;
const fs = await import("node:fs");
const path = await import("node:path");
const { execFileSync } = await import("node:child_process");
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");

const MIGRACION = "20261015232632_operadores_y_empleados_por_local";
const ARCHIVO_MIGRACION = path.join(process.cwd(), "prisma", "migrations", MIGRACION, "migration.sql");

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`); };
function ok(t, c, d = "falló") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t} — ${d}`); console.log(`  ✗ ${t} — ${d}`); }
}
const igual = (t, o, e) => ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);

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
/** El relleno, tal cual está escrito en la migración, entre sus marcas. */
function bloqueDeRelleno() {
  const texto = fs.readFileSync(ARCHIVO_MIGRACION, "utf8");
  const desde = texto.indexOf("-- RELLENO:INICIO");
  const hasta = texto.indexOf("-- RELLENO:FIN");
  if (desde < 0 || hasta < 0) throw new Error("La migración perdió las marcas del relleno.");
  return texto.slice(desde, hasta);
}
const correrSql = (url, sql) =>
  execFileSync("psql", [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-1", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const consultar = (url, sql) =>
  execFileSync("psql", [url, "-X", "-q", "-At", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// ═══════════════════════════════════════════════════════════════════════════
// A y B · LA MIGRACIÓN, SOBRE BASES AISLADAS CON LOS DATOS DE ANTES
// ═══════════════════════════════════════════════════════════════════════════

const PRODUCCION = Object.freeze({
  "Casiano casas": ["Mariangel"],
  "Mini unidas": ["Belén", "Roxana", "Alexis", "Samira", "Tiffany"],
});

/**
 * Siembra la forma de producción: un OperadorLocal con UNA fila de
 * OperadorEnLocal, y su Empleado con UNA de EmpleadoEnLocal. Con `select` en
 * todo: el cliente es el de hoy y la base todavía no tiene `localId`.
 */
async function sembrarAntes(url, { extra = null } = {}) {
  const p = await crearClientePrisma({ nivel: ESCRITURA, url });
  try {
    const locales = {};
    for (const nombre of Object.keys(PRODUCCION)) {
      locales[nombre] = (await p.local.create({ data: { nombre }, select: { id: true } })).id;
    }
    const ids = {};
    for (const [local, personas] of Object.entries(PRODUCCION)) {
      for (const nombre of personas) {
        const op = await p.operadorLocal.create({ data: { nombre, pinHash: "x" }, select: { id: true } });
        await p.operadorEnLocal.create({ data: { operadorId: op.id, localId: locales[local] } });
        const emp = await p.empleado.create({ data: { nombre, operadorId: op.id }, select: { id: true } });
        await p.empleadoEnLocal.create({ data: { empleadoId: emp.id, localId: locales[local] } });
        ids[nombre] = { operador: op.id, empleado: emp.id };
      }
    }
    if (extra) await extra(p, { locales, ids });
    return { locales, ids };
  } finally {
    await p.$disconnect();
  }
}

async function baseAislada(nombre, fn) {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${nombre}"`);
  try {
    await fn(sinParametros(urlDe(nombre)), urlDe(nombre));
  } finally {
    await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`).catch(() => {});
  }
}

const estadoDeLocales = (url) =>
  consultar(url, `SELECT string_agg(t || ':' || nombre || ':' || coalesce("localId"::text, 'null'), '|' ORDER BY t, nombre)
    FROM (SELECT 'o' AS t, nombre, "localId" FROM "OperadorLocal" UNION ALL SELECT 'e', nombre, "localId" FROM "Empleado") x`);

async function casoMigracion() {
  seccion("A · La migración, con los 6 operadores y 6 empleados de hoy");
  await baseAislada("erpazul_por_local_prueba", async (url, urlCompleta) => {
    aplicarMigraciones(url, { hasta: MIGRACION });
    const s = await sembrarAntes(urlCompleta);
    aplicarMigraciones(url, { solo: [MIGRACION] });

    const c = await crearClientePrisma({ nivel: ESCRITURA, url: urlCompleta });
    try {
      const operadores = await c.operadorLocal.findMany({ select: { nombre: true, localId: true }, orderBy: { nombre: "asc" } });
      const empleados = await c.empleado.findMany({ select: { nombre: true, localId: true }, orderBy: { nombre: "asc" } });
      const esperado = Object.entries(PRODUCCION)
        .flatMap(([local, personas]) => personas.map((nombre) => ({ nombre, localId: s.locales[local] })))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      igual("cada operador queda en su local", operadores, esperado);
      igual("cada empleado queda en su local", empleados, esperado);
      igual("los vínculos viejos quedan, no se borran", [await c.operadorEnLocal.count(), await c.empleadoEnLocal.count()], [6, 6]);

      const antes = estadoDeLocales(url);
      let errorDelRelleno = null;
      try {
        correrSql(url, bloqueDeRelleno());
        correrSql(url, bloqueDeRelleno());
      } catch (e) {
        errorDelRelleno = `${e.stderr || e.message}`.split("\n")[0];
      }
      ok("el relleno corrido dos veces más no cambia nada", errorDelRelleno === null && estadoDeLocales(url) === antes, errorDelRelleno ?? "cambió");

      // Un operador creado por el código viejo en la ventana: sin localId.
      // Volver a correr el relleno lo asigna.
      const tarde = await c.operadorLocal.create({ data: { nombre: "Tarde", pinHash: "x" }, select: { id: true } });
      await c.operadorEnLocal.create({ data: { operadorId: tarde.id, localId: s.locales["Mini unidas"] } });
      correrSql(url, bloqueDeRelleno());
      igual("el de la ventana toma su local al volver a correr el relleno",
        (await c.operadorLocal.findUnique({ where: { id: tarde.id }, select: { localId: true } })).localId, s.locales["Mini unidas"]);

      // La unicidad: por local.
      const otraBelen = await c.operadorLocal.create({ data: { nombre: "Belén", pinHash: "x", localId: s.locales["Casiano casas"] }, select: { id: true } }).catch((e) => e);
      ok("otra Belén en OTRO local se puede", Boolean(otraBelen?.id), String(otraBelen?.message));
      const repetida = await c.operadorLocal.create({ data: { nombre: "Belén", pinHash: "x", localId: s.locales["Mini unidas"] }, select: { id: true } }).catch((e) => e);
      igual("otra Belén en el MISMO local no", repetida?.code, "P2002");
      const empRepetido = await c.empleado.create({ data: { nombre: "Roxana", localId: s.locales["Mini unidas"] }, select: { id: true } }).catch((e) => e);
      igual("tampoco un empleado repetido en el mismo local", empRepetido?.code, "P2002");
    } finally {
      await c.$disconnect();
    }
  });

  seccion("B · El freno: alguien en dos locales, la migración no elige");
  for (const [quien, extra] of [
    ["un operador", async (p, { locales, ids }) => p.operadorEnLocal.create({ data: { operadorId: ids["Belén"].operador, localId: locales["Casiano casas"] } })],
    ["un empleado", async (p, { locales, ids }) => p.empleadoEnLocal.create({ data: { empleadoId: ids["Mariangel"].empleado, localId: locales["Mini unidas"] } })],
  ]) {
    await baseAislada("erpazul_por_local_freno", async (url, urlCompleta) => {
      aplicarMigraciones(url, { hasta: MIGRACION });
      await sembrarAntes(urlCompleta, { extra });
      let error = null;
      try {
        aplicarMigraciones(url, { solo: [MIGRACION] });
      } catch (e) {
        error = `${e.stderr || e.message}`;
      }
      ok(`con ${quien} en dos locales, la migración se frena`, /OPERADORES_Y_EMPLEADOS_POR_LOCAL/.test(error ?? ""), error ? error.split("\n")[0] : "aplicó");
      ok(`y lo nombra`, quien === "un operador" ? /Belén/.test(error ?? "") : /Mariangel/.test(error ?? ""), error?.split("\n")[0]);
      const columnas = consultar(url, `SELECT count(*) FROM information_schema.columns WHERE table_name IN ('OperadorLocal','Empleado') AND column_name = 'localId'`);
      const indiceViejo = consultar(url, `SELECT count(*) FROM pg_indexes WHERE indexname = 'OperadorLocal_nombre_key'`);
      igual(`y no aplicó nada (${quien})`, [columnas, indiceViejo], ["0", "1"]);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// C y D · SOBRE LA BASE DE LA PRUEBA, CON LAS RUTAS REALES
// ═══════════════════════════════════════════════════════════════════════════

const SECRETO = process.env.AUTH_SECRET;
const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const ruta = {
  opCrear: await import("../../app/api/operador/crear/route.js"),
  opEditar: await import("../../app/api/operador/editar/route.js"),
  opEliminar: await import("../../app/api/operador/eliminar/route.js"),
  opListarTodos: await import("../../app/api/operador/listar-todos/route.js"),
  opListar: await import("../../app/api/operador/listar/route.js"),
  opLogin: await import("../../app/api/operador/login/route.js"),
  empCrear: await import("../../app/api/empleados/crear/route.js"),
  empEditar: await import("../../app/api/empleados/editar/route.js"),
  empListar: await import("../../app/api/empleados/listar-todos/route.js"),
  pagar: await import("../../app/api/pos-ventas/pagar/route.js"),
  consumo: await import("../../app/api/pos-ventas/consumo-personal/route.js"),
};

const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const cookieDe = (quien) =>
  [
    `erpazul_sesion=${quien.sesion}`,
    quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null,
    quien.contexto ? `erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: quien.contexto }))}` : null,
    quien.grupo ? `erpazul_grupo_activo=${quien.grupo}` : null,
  ].filter(Boolean).join("; ");
function pedido(url, quien, { metodo = "POST", cuerpo } = {}) {
  const req = new Request(url, {
    method: metodo,
    headers: { cookie: cookieDe(quien), "content-type": "application/json" },
    body: metodo === "GET" ? undefined : JSON.stringify(cuerpo ?? {}),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}
const BASE = "http://ci/api";
const marca = `ci-por-local-${Date.now()}`;
let n = 0;
const clave = () => `${marca}-${(n += 1)}`;
const creado = { grupoId: null, locales: [], bases: [] };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: [] } });
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const L1 = await prisma.local.create({ data: { nombre: `${marca}-uno`, tipo: "local" } });
  const L2 = await prisma.local.create({ data: { nombre: `${marca}-dos`, tipo: "local" } });
  creado.locales.push(L1.id, L2.id);
  for (const l of [L1, L2]) {
    await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: l.id } });
    await prisma.configuracionLocal.create({ data: { localId: l.id, exigirOperador: true, allowNegativeStock: true } });
  }
  const usuario = async (nombre, localId, permisos) => {
    const u = await prisma.usuario.create({
      data: { nombre: `${marca}-${nombre}`, email: `${marca}-${nombre}@ci.local`, passwordHash: "x", rolId: rol.id, localId: localId ?? L1.id },
    });
    return { u, sesion: jwt.sign({ id: u.id, nombre: u.nombre, email: u.email, localId, permisos }, SECRETO, { expiresIn: "1h" }) };
  };
  const enc1 = await usuario("enc1", L1.id, ["config_local.operadores"]);
  const enc2 = await usuario("enc2", L2.id, ["config_local.operadores"]);
  const admin = await usuario("admin", null, ["*"]);
  const cajero1 = await usuario("cajero1", L1.id, ["pos.usar"]);
  const base = await prisma.productoBase.create({
    data: { grupoId: grupo.id, nombre: `${marca}-gaseosa`, precio_costo: 100, precio_venta: 150, unidad_medida: "unidad" },
  });
  creado.bases.push(base.id);
  await prisma.productoLocal.create({ data: { localId: L1.id, baseId: base.id, precio_costo: 100, precio_venta: 150 } });
  return { grupo, L1, L2, enc1, enc2, admin, cajero1, base };
}

async function desmontar() {
  const locales = creado.locales;
  if (!locales.length) return;
  const turnos = (await prisma.turno.findMany({ where: { localId: { in: locales } }, select: { id: true } })).map((t) => t.id);
  await prisma.consumoPersonalLinea.deleteMany({ where: { consumo: { localId: { in: locales } } } }).catch(() => {});
  await prisma.consumoPersonal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.pagoGasto.deleteMany({ where: { gasto: { grupoId: creado.grupoId } } });
  await prisma.gasto.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { localId: { in: locales } } });
  const pls = (await prisma.productoLocal.findMany({ where: { baseId: { in: creado.bases } }, select: { id: true } })).map((p) => p.id);
  await prisma.stockLocal.deleteMany({ where: { productoId: { in: pls } } });
  await prisma.empleado.deleteMany({ where: { localId: { in: locales } } });
  await prisma.operadorLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: locales } } });
}

async function casosAdministracion(f) {
  seccion("C · Administración: todo en el local activo");
  const enc1 = { sesion: f.enc1.sesion };
  const enc2 = { sesion: f.enc2.sesion };
  const opCrear = async (quien, cuerpo, q = "") => leer(await ruta.opCrear.POST(pedido(`${BASE}/operador/crear${q}`, quien, { cuerpo })));
  const empCrear = async (quien, cuerpo) => leer(await ruta.empCrear.POST(pedido(`${BASE}/empleados/crear`, quien, { cuerpo })));

  const juan1 = await opCrear(enc1, { nombre: `${marca}-Juan`, pin: "1234" });
  igual("el alta crea en el local activo", [juan1.status, juan1.operador?.localId], [200, f.L1.id]);
  const suyo = await prisma.empleado.findUnique({ where: { operadorId: juan1.operador.id }, select: { localId: true, nombre: true } });
  igual("y su empleado nace en el mismo local", [suyo?.localId, suyo?.nombre], [f.L1.id, `${marca}-Juan`]);
  const juan2 = await opCrear(enc2, { nombre: `${marca}-Juan`, pin: "1234" });
  igual("el mismo nombre en OTRO local se puede", [juan2.status, juan2.operador?.localId], [200, f.L2.id]);
  igual("repetido en el mismo local, no", (await opCrear(enc1, { nombre: `${marca}-Juan`, pin: "9999" })).status, 409);
  igual("crear operador ya no acepta locales", (await opCrear(enc1, { nombre: `${marca}-Varios`, pin: "1234", localIds: [f.L1.id, f.L2.id] })).status, 400);
  igual("ni uno solo", (await opCrear(enc1, { nombre: `${marca}-Uno`, pin: "1234", localIds: [f.L1.id] })).status, 400);
  igual("ni el local de otro por la query", (await opCrear(enc1, { nombre: `${marca}-Ajeno`, pin: "1234" }, `?localId=${f.L2.id}`)).status, 403);

  const pedro1 = await empCrear(enc1, { nombre: `${marca}-Pedro` });
  igual("un empleado sin operador, en el local activo", [pedro1.status, pedro1.empleado?.localId], [200, f.L1.id]);
  igual("otro Pedro en otro local se puede", (await empCrear(enc2, { nombre: `${marca}-Pedro` })).status, 200);
  igual("repetido en el mismo local, no", (await empCrear(enc1, { nombre: `${marca}-Pedro` })).status, 409);
  igual("el empleado tampoco elige local", (await empCrear(enc1, { nombre: `${marca}-Lucas`, localIds: [f.L2.id] })).status, 400);
  igual("ni se asocia a un operador de otro local", (await empCrear(enc1, { nombre: `${marca}-Lucas`, operadorId: juan2.operador.id })).status, 403);

  // Pedro ya trabajaba en L1 sin caja: al darle un operador, es la misma persona.
  const pedroOp = await opCrear(enc1, { nombre: `${marca}-Pedro`, pin: "1234" });
  igual("un operador con el nombre de un empleado del local se le asocia", pedroOp.status, 200);
  const pedros = await prisma.empleado.findMany({ where: { localId: f.L1.id, nombre: `${marca}-Pedro` }, select: { id: true, operadorId: true } });
  igual("sin duplicarlo", pedros.map((p) => [p.id, p.operadorId]), [[pedro1.empleado.id, pedroOp.operador.id]]);

  const listaOp = async (quien) => (await leer(await ruta.opListarTodos.GET(pedido(`${BASE}/operador/listar-todos`, quien, { metodo: "GET" })))).items?.map((o) => o.id) ?? null;
  const listaEmp = async (quien) => (await leer(await ruta.empListar.GET(pedido(`${BASE}/empleados/listar-todos`, quien, { metodo: "GET" })))).items?.map((e) => e.id) ?? null;
  const deL = async (modelo, localId) => (await prisma[modelo].findMany({ where: { localId }, select: { id: true }, orderBy: { nombre: "asc" } })).map((x) => x.id);
  igual("la lista de operadores es la del local activo", await listaOp(enc1), await deL("operadorLocal", f.L1.id));
  igual("la de empleados también", await listaEmp(enc1), await deL("empleado", f.L1.id));
  const adminEnL2 = { sesion: f.admin.sesion, contexto: f.L2.id, grupo: f.grupo.id };
  igual("un admin ve la del local que eligió arriba, no todas", await listaOp(adminEnL2), await deL("operadorLocal", f.L2.id));
  igual("también en empleados", await listaEmp(adminEnL2), await deL("empleado", f.L2.id));
  const adminCrea = await opCrear(adminEnL2, { nombre: `${marca}-DelAdmin`, pin: "1234" });
  igual("y su alta va a ese local", adminCrea.operador?.localId, f.L2.id);

  const opEditar = async (quien, cuerpo) => leer(await ruta.opEditar.POST(pedido(`${BASE}/operador/editar`, quien, { cuerpo })));
  const empEditar = async (quien, cuerpo) => leer(await ruta.empEditar.POST(pedido(`${BASE}/empleados/editar`, quien, { cuerpo })));
  igual("no se edita un operador de otro local", (await opEditar(enc1, { id: juan2.operador.id, nombre: "x-hack" })).status, 403);
  igual("ni un empleado", (await empEditar(enc1, { id: (await prisma.empleado.findUnique({ where: { operadorId: juan2.operador.id }, select: { id: true } })).id, nombre: "x-hack" })).status, 403);
  igual("no se muda un operador a otro local", (await opEditar(enc1, { id: juan1.operador.id, localId: f.L2.id })).status, 400);
  igual("ni un empleado", (await empEditar(enc1, { id: pedro1.empleado.id, localIds: [f.L2.id] })).status, 400);
  igual("renombrar a uno repetido del local, no", (await opEditar(enc1, { id: pedroOp.operador.id, nombre: `${marca}-Juan` })).status, 409);
  igual("y no se elimina uno de otro local", (await leer(await ruta.opEliminar.POST(pedido(`${BASE}/operador/eliminar`, enc1, { cuerpo: { id: juan2.operador.id } })))).status, 403);
  igual("después de todo eso, sigue en su local", (await prisma.operadorLocal.findUnique({ where: { id: juan1.operador.id }, select: { localId: true } })).localId, f.L1.id);
  return { juan1, juan2, pedro1 };
}

async function casosPos(f, { juan1, juan2, pedro1 }) {
  seccion("D · El POS: login, Pagar y Consumo del personal, por local");
  const cajero = { sesion: f.cajero1.sesion };
  const lista = await leer(await ruta.opListar.GET(pedido(`${BASE}/operador/listar`, cajero, { metodo: "GET" })));
  const nombres = (lista.items || []).map((o) => o.id);
  ok("el login del POS muestra los operadores del local", nombres.includes(juan1.operador.id) && !nombres.includes(juan2.operador.id), JSON.stringify(nombres));
  const login = async (operadorId) => leer(await ruta.opLogin.POST(pedido(`${BASE}/operador/login`, cajero, { cuerpo: { operadorId, pin: "1234" } })));
  igual("y uno de otro local no entra", (await login(juan2.operador.id)).status, 404);
  igual("el del local, sí", (await login(juan1.operador.id)).status, 200);

  const turno = await prisma.turno.create({
    data: { localId: f.L1.id, vendedorId: f.cajero1.u.id, operadorId: juan1.operador.id, montoInicial: 50000, apertura: new Date() },
  });
  const quienCaja = { sesion: f.cajero1.sesion, operador: firmarTokenOperador({ operadorId: juan1.operador.id, nombre: juan1.operador.nombre, localId: f.L1.id }) };
  const opciones = await leer(await ruta.pagar.GET(pedido(`${BASE}/pos-ventas/pagar?turnoId=${turno.id}`, quienCaja, { metodo: "GET" })));
  const ofrecidos = (opciones.empleados || []).map((e) => e.id);
  const deL1 = await prisma.empleado.findMany({ where: { localId: f.L1.id, activo: true }, select: { id: true }, orderBy: { nombre: "asc" } });
  igual("Pagar ofrece solo los empleados activos del local de la caja", ofrecidos, deL1.map((e) => e.id));
  const empleadoL2 = await prisma.empleado.findUnique({ where: { operadorId: juan2.operador.id }, select: { id: true } });

  const pagar = async (cuerpo) => leer(await ruta.pagar.POST(pedido(`${BASE}/pos-ventas/pagar`, quienCaja, { cuerpo: { turnoId: turno.id, idempotencyKey: clave(), ...cuerpo } })));
  const movsAntes = await prisma.cajaMovimiento.count({ where: { turnoId: turno.id } });
  // 400 y no 403 desde el 2026-10-19: la regla única de sueldos de `crearGasto`
  // trata al empleado de otro local como uno que no se ofrece, igual desde el
  // POS que desde Finanzas.
  const ajeno = await pagar({ tipo: "SUELDO", modalidad: "SUELDO", monto: "1000", empleadoId: empleadoL2.id });
  igual("Sueldo de un empleado de otro local: 400", [ajeno.status, ajeno.error], [400, "Ese empleado es de otro local."]);
  const adelanto = await pagar({ tipo: "SUELDO", modalidad: "ADELANTO", monto: "500", empleadoId: empleadoL2.id });
  igual("ni como adelanto", adelanto.status, 400);
  igual("y la caja no se movió", await prisma.cajaMovimiento.count({ where: { turnoId: turno.id } }), movsAntes);
  const propio = await pagar({ tipo: "SUELDO", modalidad: "SUELDO", monto: "1000", empleadoId: pedro1.empleado.id });
  igual("el del local, sí", [propio.status, propio.ok], [200, true]);
  const gasto = await prisma.gasto.findFirst({ where: { empleadoId: pedro1.empleado.id }, select: { localId: true } });
  igual("y el gasto del sueldo es del local del empleado", gasto?.localId, f.L1.id);

  const consumir = async (empleadoId) => leer(await ruta.consumo.POST(pedido(`${BASE}/pos-ventas/consumo-personal`, quienCaja, {
    cuerpo: {
      turnoId: turno.id,
      empleadoId,
      idempotencyKey: clave(),
      items: [{ productoBaseId: f.base.id, nombre: "Gaseosa", precio: 150, cantidad: 1, precioCosto: 100, modoVentaLinea: "NORMAL" }],
    },
  })));
  igual("Consumo de un empleado de otro local: 403", (await consumir(empleadoL2.id)).status, 403);
  igual("y no quedó ningún consumo", await prisma.consumoPersonal.count({ where: { turnoId: turno.id } }), 0);
  const consumo = await consumir(pedro1.empleado.id);
  igual("el del local, sí", [consumo.status, consumo.ok], [200, true]);
  const gastoConsumo = await prisma.consumoPersonal.findFirst({ where: { turnoId: turno.id }, select: { localId: true, gasto: { select: { localId: true } } } });
  igual("y el consumo y su gasto son del local del empleado", [gastoConsumo?.localId, gastoConsumo?.gasto?.localId], [f.L1.id, f.L1.id]);
}

// ═══════════════════════════════════════════════════════════════════════════

try {
  await casoMigracion();
} catch (e) {
  fallas.push(`[excepción en A/B] ${e.stderr || ""}${e.stack || e.message}`);
  console.error(e);
}

let f;
try {
  f = await montar();
  const hechos = await casosAdministracion(f);
  await casosPos(f, hechos);
} catch (e) {
  fallas.push(`[excepción] ${e.stack || e.message}`);
  console.error(e);
} finally {
  await desmontar().catch((e) => console.error("desmontar:", e.message));
  await prisma.$disconnect();
}

// La primera línea es la que lee contrapruebasRevision.mjs para saber que corrió.
console.log(`\nAfirmaciones que pasaron: ${pasadas}`);
console.log(`${pasadas} en verde, ${fallas.length} en rojo`);
if (fallas.length) {
  for (const x of fallas) console.log(`  ✗ ${x}`);
  process.exit(1);
}
