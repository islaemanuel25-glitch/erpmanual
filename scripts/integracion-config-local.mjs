// Harness de integración: CONFIGURACIÓN POR UBICACIÓN.
// Verifica que la config operativa de un local (operario obligatorio, vender sin
// stock, cliente obligatorio, apariencia) esté aislada por ubicación y gateada por
// permiso, sin confiar en localId del frontend. Contra el dev server real + DB de test.
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_term_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3011" \
//   node scripts/integracion-config-local.mjs

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { DEFAULT_PERMISOS_SISTEMA, DUENO_LOCAL, CAJERO } from "../lib/rbac/systemRoles.js";

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("ABORT: falta AUTH_SECRET."); process.exit(2); }
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });

let pass = 0, fail = 0;
const S = {};

function cookieFor(user, { contextoLocalId = null, contextoEsDeposito = false, grupoActivo = null, global = false } = {}) {
  const token = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? null, esDuenoLocal: !!user.esDuenoLocal, esDeposito: !!user.esDeposito },
    AUTH_SECRET, { expiresIn: "8h" }
  );
  const cookies = [`erpazul_sesion=${token}`];
  if (grupoActivo) cookies.push(`erpazul_grupo_activo=${grupoActivo}`);
  if (global) cookies.push(`erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ global: true }))}`);
  else if (contextoLocalId) cookies.push(`erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: contextoLocalId, esDeposito: contextoEsDeposito }))}`);
  return cookies.join("; ");
}

async function req(method, path, { cookie = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function check(name, r, expectedStatus, extra = null) {
  const res = await r;
  const okStatus = Array.isArray(expectedStatus) ? expectedStatus.includes(res.status) : res.status === expectedStatus;
  const okExtra = extra ? extra(res) : true;
  if (okStatus && okExtra) { console.log(`✔ ${name} → ${res.status}`); pass++; }
  else { console.log(`✖ ${name} → ${res.status} (esp ${expectedStatus}) ${JSON.stringify(res.json)?.slice(0, 160)}`); fail++; }
  return res;
}
function assertOk(name, cond, detail = "") { if (cond) { console.log(`✔ ${name}`); pass++; } else { console.log(`✖ ${name} ${detail}`); fail++; } }

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`
  );
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

async function seed() {
  const hash = await bcrypt.hash("secret123", 8);
  const rolAdmin = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"], esSistema: true } });
  const rolDueno = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });
  const rolCajero = await prisma.rol.create({ data: { nombre: CAJERO, permisos: DEFAULT_PERMISOS_SISTEMA[CAJERO], esSistema: true } });

  const g = await prisma.grupo.create({ data: { nombre: "G-Config" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localB.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: g.id, allowNegativeStock: false } });

  const mk = (nombre, email, rolId, localId) => prisma.usuario.create({ data: { nombre, email, passwordHash: hash, rolId, localId } });
  const admin = await mk("Admin", "adm@cfg.test", rolAdmin.id, null);
  const duenoA = await mk("DuenoA", "da@cfg.test", rolDueno.id, localA.id);
  const duenoB = await mk("DuenoB", "db@cfg.test", rolDueno.id, localB.id);
  const duenoDepo = await mk("DuenoDepo", "dd@cfg.test", rolDueno.id, depo.id);
  const duenoSinLocal = await mk("DuenoSinLocal", "dsl@cfg.test", rolDueno.id, null);
  const cajeroA = await mk("CajeroA", "ca@cfg.test", rolCajero.id, localA.id);

  // Local B arranca con una config PROPIA y distintiva. Sirve de línea base para
  // comprobar que las operaciones ajenas (de duenoA) NO la revelan ni la modifican.
  await prisma.configuracionLocal.create({
    data: {
      localId: localB.id,
      exigirOperador: true,        // obligatorio
      exigirClienteVenta: true,
      allowNegativeStock: false,
      aparienciaJson: { tema: "B-base" },
    },
  });

  Object.assign(S, {
    g: g.id, depo: depo.id, localA: localA.id, localB: localB.id,
    admin: { ...admin, permisos: ["*"] },
    duenoA: { ...duenoA, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    duenoB: { ...duenoB, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    duenoDepo: { ...duenoDepo, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true, esDeposito: true },
    duenoSinLocal: { ...duenoSinLocal, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    cajeroA: { ...cajeroA, permisos: DEFAULT_PERMISOS_SISTEMA[CAJERO] },
  });
}

async function clRow(localId) {
  return prisma.configuracionLocal.findUnique({ where: { localId } });
}

// Snapshot canónico de la config de un local, para comparar aislamiento.
async function snap(localId) {
  const r = await clRow(localId);
  return JSON.stringify({
    exigirOperador: r?.exigirOperador ?? null,
    exigirClienteVenta: r?.exigirClienteVenta ?? null,
    allowNegativeStock: r?.allowNegativeStock ?? null,
    aparienciaJson: r?.aparienciaJson ?? null,
  });
}

async function run() {
  await truncateAll();
  await seed();

  const cfgPos = "/api/config/pos-ventas-cliente";
  const cfgStock = "/api/config/stock-negativo";
  const cfgApar = "/api/config/apariencia-local";
  const cfgTicket = "/api/config/ticket";
  const caja = "/api/pos-ventas/caja-movimientos/crear";

  // Línea base de Local B (config propia y distintiva). NADA ajeno debe cambiarla.
  const baseB = await snap(S.localB);

  // ============================================================
  // 1) OPERARIO OBLIGATORIO configurable por local
  // ============================================================
  // 1a. Default (localA sin fila → null = obligatorio). CAJERO sin operador → 428.
  await check("CAJERO A, localA exigirOperador=default(null→true), caja sin operador → 428",
    req("POST", caja, { cookie: cookieFor(S.cajeroA), body: {} }), 428);

  // 1b. GET efectivo default expone exigirOperador=true (null→true).
  await check("duenoA GET config POS → 200 con exigirOperador=true (default null)",
    req("GET", cfgPos, { cookie: cookieFor(S.duenoA) }), 200,
    (r) => r.json?.exigirOperador === true);

  // 1c. duenoA desactiva operario obligatorio en SU local.
  await check("duenoA POST {exigirOperador:false} en localA → 200",
    req("POST", cfgPos, { cookie: cookieFor(S.duenoA), body: { exigirOperador: false } }), 200,
    (r) => r.json?.exigirOperador === false);
  assertOk("localA persistió exigirOperador=false", (await clRow(S.localA))?.exigirOperador === false);
  assertOk("localB intacto tras editar localA (aislado)", (await snap(S.localB)) === baseB);
  assertOk("depósito sin fila (aislado)", ((await clRow(S.depo))?.exigirOperador ?? null) === null);

  // 1d. Ahora el gate NO exige operario en A: CAJERO pasa la puerta (400 por turnoId, no 428).
  await check("CAJERO A, localA exigirOperador=false, caja sin operador → NO 428 (pasa gate → 400 turnoId)",
    req("POST", caja, { cookie: cookieFor(S.cajeroA), body: {} }), 400,
    (r) => r.json?.needsOperador !== true);

  // ============================================================
  // 2) CONTRATO DEL RECURSO AJENO: lectura → 404, escritura → 403,
  //    sin revelar ni modificar datos de Local B.
  // ============================================================
  // 2a. LECTURA ajena (GET) → 404 y SIN filtrar la config de B.
  await check("duenoA GET config POS ?localId=localB → 404 (no revela)",
    req("GET", `${cfgPos}?localId=${S.localB}`, { cookie: cookieFor(S.duenoA) }), 404,
    (r) => r.json?.exigirOperador === undefined && r.json?.exigirClienteVenta === undefined && r.json?.ok !== true);
  await check("duenoA GET stock-negativo ?localId=localB → 404 (no revela)",
    req("GET", `${cfgStock}?localId=${S.localB}`, { cookie: cookieFor(S.duenoA) }), 404,
    (r) => r.json?.allowNegativeStock === undefined && r.json?.ok !== true);
  await check("duenoA GET apariencia ?localId=localB → 404 (no revela)",
    req("GET", `${cfgApar}?localId=${S.localB}`, { cookie: cookieFor(S.duenoA) }), 404,
    (r) => r.json?.apariencia === undefined && r.json?.ok !== true);
  await check("duenoA GET ticket ?localId=localB → 404 (no revela)",
    req("GET", `${cfgTicket}?localId=${S.localB}`, { cookie: cookieFor(S.duenoA) }), 404,
    (r) => r.json?.config === undefined && r.json?.ok !== true);

  // 2b. ESCRITURA ajena (POST/PUT) → 403 y SIN modificar la config de B.
  await check("duenoA POST config POS ?localId=localB → 403 (escritura ajena)",
    req("POST", `${cfgPos}?localId=${S.localB}`, { cookie: cookieFor(S.duenoA), body: { exigirOperador: false } }), 403);
  await check("duenoA POST stock-negativo ?localId=localB → 403 (escritura ajena)",
    req("POST", `${cfgStock}?localId=${S.localB}`, { cookie: cookieFor(S.duenoA), body: { allowNegativeStock: true } }), 403);
  await check("duenoA PUT apariencia ?localId=localB → 403 (escritura ajena)",
    req("PUT", `${cfgApar}?localId=${S.localB}`, { cookie: cookieFor(S.duenoA), body: { apariencia: { tema: "hackeado" } } }), 403);

  // 2c. Tras TODOS los intentos ajenos, Local B queda IDÉNTICO a su línea base.
  assertOk("Local B NO fue modificado por ninguna operación ajena de duenoA", (await snap(S.localB)) === baseB);

  // ============================================================
  // 3) PERMISO / FAIL-CLOSED
  // ============================================================
  await check("CAJERO A POST config POS → 403 (sin config_local.pos)",
    req("POST", cfgPos, { cookie: cookieFor(S.cajeroA), body: { exigirOperador: true } }), 403);
  await check("duenoSinLocal POST config POS → 403 (fail-closed)",
    req("POST", cfgPos, { cookie: cookieFor(S.duenoSinLocal), body: { exigirOperador: false } }), 403);
  // Un dueño sin local tampoco puede LEER (no tiene alcance) → 403 (no ajena, sin local).
  await check("duenoSinLocal GET config POS → 403 (sin alcance)",
    req("GET", cfgPos, { cookie: cookieFor(S.duenoSinLocal) }), 403);

  // ============================================================
  // 4) DEPÓSITO: config propia, aislada de los locales
  // ============================================================
  await check("duenoDepo POST {exigirOperador:false} en depósito → 200",
    req("POST", cfgPos, { cookie: cookieFor(S.duenoDepo), body: { exigirOperador: false } }), 200);
  assertOk("depósito persistió exigirOperador=false", (await clRow(S.depo))?.exigirOperador === false);
  assertOk("localB intacto tras editar depósito (aislado)", (await snap(S.localB)) === baseB);

  // ============================================================
  // 5) ADMIN: sin contexto → 409; con contexto edita SOLO esa ubicación
  // ============================================================
  await check("admin POST config POS sin contexto → 409 (debe elegir contexto)",
    req("POST", cfgPos, { cookie: cookieFor(S.admin, { grupoActivo: S.g }), body: { exigirOperador: false } }), 409,
    (r) => /contexto/i.test(r.json?.error || ""));
  // Admin con contexto localB edita SOLO localB (cambio AUTORIZADO).
  await check("admin (contexto localB) POST {exigirClienteVenta:false} → 200",
    req("POST", cfgPos, { cookie: cookieFor(S.admin, { grupoActivo: S.g, contextoLocalId: S.localB }), body: { exigirClienteVenta: false } }), 200);
  assertOk("localB.exigirClienteVenta=false (editado por admin autorizado)", (await clRow(S.localB))?.exigirClienteVenta === false);
  assertOk("localA NO cambió por la edición admin de localB", (await clRow(S.localA))?.exigirClienteVenta == null);

  // ============================================================
  // 6) VENDER SIN STOCK aislado por local
  // ============================================================
  const baseBStock = (await clRow(S.localB))?.allowNegativeStock ?? null; // línea base (false)
  await check("duenoA POST stock-negativo {allowNegativeStock:true} en localA → 200",
    req("POST", cfgStock, { cookie: cookieFor(S.duenoA), body: { allowNegativeStock: true } }), 200);
  assertOk("localA allowNegativeStock=true", (await clRow(S.localA))?.allowNegativeStock === true);
  assertOk("localB allowNegativeStock NO cambió (aislado)", ((await clRow(S.localB))?.allowNegativeStock ?? null) === baseBStock);

  // ============================================================
  // 7) APARIENCIA aislada por local
  // ============================================================
  await check("duenoA PUT apariencia-local {tema} en localA → 200",
    req("PUT", cfgApar, { cookie: cookieFor(S.duenoA), body: { apariencia: { tema: "oscuro" } } }), 200);
  assertOk("localA aparienciaJson persistida (tema oscuro)", (await clRow(S.localA))?.aparienciaJson?.tema === "oscuro");
  assertOk("localB aparienciaJson NO cambió (sigue B-base)", (await clRow(S.localB))?.aparienciaJson?.tema === "B-base");
}

run()
  .then(async () => {
    await prisma.$disconnect();
    console.log(`\n== CONFIG-LOCAL: ${pass} pass / ${fail} fail ==`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error("HARNESS ERROR:", e);
    await prisma.$disconnect();
    process.exit(2);
  });
