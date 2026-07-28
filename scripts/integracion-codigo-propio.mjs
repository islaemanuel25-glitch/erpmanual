// Harness de integración: CÓDIGO DE BARRAS PROPIO POR UBICACIÓN.
// Tercer código opcional en ProductoLocal (codigo_barra_propio), local por ubicación,
// que NO reemplaza los dos globales de ProductoBase. Búsqueda POS por ubicación,
// aislamiento entre locales, colisiones y persistencia sin tocar la base.
// Contra dev server + DB test (mismo setup que integracion-editar-propiedad.mjs).
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_cbpropio_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3041" \
//   node scripts/integracion-codigo-propio.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) { console.error("ABORT: DATABASE_URL no apunta a *test*."); process.exit(2); }
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("ABORT: falta AUTH_SECRET."); process.exit(2); }
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3041";
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });

let pass = 0, fail = 0;
const S = {};
const PERMS = ["pos.usar", "productos.ver", "productos.crear", "productos.editar"];

function cookieFor(user) {
  const token = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? null },
    AUTH_SECRET, { expiresIn: "8h" }
  );
  return `erpazul_sesion=${token}`;
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
  else { console.log(`✖ ${name} → ${res.status} (esp ${expectedStatus}) ${JSON.stringify(res.json)?.slice(0, 200)}`); fail++; }
  return res;
}
function assertOk(name, cond, detail = "") { if (cond) { console.log(`✔ ${name}`); pass++; } else { console.log(`✖ ${name} ${detail}`); fail++; } }

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

async function baseRow(id) {
  return prisma.productoBase.findUnique({ where: { id }, select: { codigo_barra: true, codigo_barra_secundario: true } });
}
async function plRow(baseId, localId) {
  return prisma.productoLocal.findFirst({ where: { baseId, localId }, select: { id: true, baseId: true, localId: true, codigo_barra_propio: true } });
}
// ¿La búsqueda POS del local `localId` encuentra el producto `baseId` con query `q`?
async function posEncuentra(user, q, baseId) {
  const r = await req("GET", `/api/pos-ventas/buscar-producto?q=${encodeURIComponent(q)}&localId=${user.localId}`, { cookie: cookieFor(user) });
  if (r.status !== 200 || !Array.isArray(r.json?.items)) return false;
  return r.json.items.some((it) => it.productoBaseId === baseId);
}

async function seed() {
  const hash = await bcrypt.hash("secret123", 8);
  const rol = await prisma.rol.create({ data: { nombre: "DUEÑO_LOCAL", permisos: PERMS, esSistema: true } });
  const g = await prisma.grupo.create({ data: { nombre: "G-CB" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const lA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const lB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: lA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: lB.id } });
  const mk = (nombre, email, localId) => prisma.usuario.create({ data: { nombre, email, passwordHash: hash, rolId: rol.id, localId } });
  const uDepo = await mk("UDepo", "d@cb.test", depo.id);
  const uA = await mk("UA", "a@cb.test", lA.id);
  const uB = await mk("UB", "b@cb.test", lB.id);

  // Producto de DEPÓSITO con dos códigos globales, materializado en depo + A + B.
  const bDepo = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "Coca 2L", unidad_medida: "unidad", factor_pack: 1,
      codigo_barra: "GLOBAL-P", codigo_barra_secundario: "GLOBAL-S", precio_costo: 100, precio_venta: 150, margen: 50, redondeo_100: false },
  });
  for (const l of [depo.id, lA.id, lB.id]) {
    const pl = await prisma.productoLocal.create({ data: { localId: l, baseId: bDepo.id, precio_venta: 150, activo: true } });
    await prisma.stockLocal.create({ data: { localId: l, productoId: pl.id, cantidad: 10 } });
  }

  // Producto EXCLUSIVO de Local A con globales propios (para colisiones), solo en A.
  const bA = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: lA.id, nombre: "Sandwich A", unidad_medida: "unidad", factor_pack: 1,
      codigo_barra: "EXCLA-P", codigo_barra_secundario: "EXCLA-S", precio_costo: 80, precio_venta: 120, margen: 50, redondeo_100: false },
  });
  const plA = await prisma.productoLocal.create({ data: { localId: lA.id, baseId: bA.id, precio_venta: 120, activo: true } });
  await prisma.stockLocal.create({ data: { localId: lA.id, productoId: plA.id, cantidad: 10 } });

  Object.assign(S, {
    g: g.id, depo: depo.id, lA: lA.id, lB: lB.id, bDepo: bDepo.id, bA: bA.id,
    uDepo: { ...uDepo, permisos: PERMS }, uA: { ...uA, permisos: PERMS }, uB: { ...uB, permisos: PERMS },
  });
}

function editPayload(over = {}) {
  // Reenvía los globales tal cual (bloqueados para un local sobre producto de depósito).
  return { nombre: "Coca 2L", codigo_barra: "GLOBAL-P", codigo_barra_secundario: "GLOBAL-S",
    unidad_medida: "unidad", factor_pack: 1, precio_venta: 150, margen: 50, redondeo_100: false, activo: true, es_combo: false, ...over };
}
const ed = (id, localId) => `/api/productos/editar/${id}?localId=${localId}`;
const get = (id, localId) => `/api/productos/obtener?id=${id}&localId=${localId}`;

async function run() {
  await truncateAll();
  await seed();

  // ── COMPAT: producto existente sin código propio ──────────────────────
  await check("compat: obtener producto de depósito sin código propio → codigoBarraPropio null",
    req("GET", get(S.bDepo, S.lA), { cookie: cookieFor(S.uA) }), 200,
    (r) => r.json?.item?.codigoBarraPropio == null && r.json?.item?.codigoBarra === "GLOBAL-P");
  assertOk("POS de A encuentra el producto por el global principal (fallback)", await posEncuentra(S.uA, "GLOBAL-P", S.bDepo));
  assertOk("POS de A encuentra el producto por el global secundario (fallback)", await posEncuentra(S.uA, "GLOBAL-S", S.bDepo));

  // ── ALTA de código propio (Local A sobre producto de depósito) ────────
  await check("A agrega su código propio 'PROP-A' al producto de depósito → 200",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uA), body: editPayload({ codigo_barra_propio: "PROP-A" }) }), 200);
  await check("obtener desde A refleja los TRES códigos (global P/S + propio)",
    req("GET", get(S.bDepo, S.lA), { cookie: cookieFor(S.uA) }), 200,
    (r) => r.json?.item?.codigoBarra === "GLOBAL-P" && r.json?.item?.codigoBarraSecundario === "GLOBAL-S" && r.json?.item?.codigoBarraPropio === "PROP-A");
  assertOk("cambiar el propio NO tocó ProductoBase (globales intactos)",
    (await baseRow(S.bDepo)).codigo_barra === "GLOBAL-P" && (await baseRow(S.bDepo)).codigo_barra_secundario === "GLOBAL-S");

  // ── BÚSQUEDA POS por código propio, AISLADA por local ─────────────────
  assertOk("POS de A encuentra el producto por su código propio 'PROP-A'", await posEncuentra(S.uA, "PROP-A", S.bDepo));
  assertOk("POS de B NO encuentra 'PROP-A' (aislamiento: es propio de A)", !(await posEncuentra(S.uB, "PROP-A", S.bDepo)));
  assertOk("POS de A SIGUE encontrando por ambos globales", (await posEncuentra(S.uA, "GLOBAL-P", S.bDepo)) && (await posEncuentra(S.uA, "GLOBAL-S", S.bDepo)));
  assertOk("POS de B encuentra por el global (el producto de depósito también está en B)", await posEncuentra(S.uB, "GLOBAL-P", S.bDepo));

  // ── EDICIÓN del propio ────────────────────────────────────────────────
  await check("A cambia su propio a 'PROP-A2' → 200",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uA), body: editPayload({ codigo_barra_propio: "PROP-A2" }) }), 200);
  assertOk("POS de A encuentra por 'PROP-A2' y ya NO por 'PROP-A'", (await posEncuentra(S.uA, "PROP-A2", S.bDepo)) && !(await posEncuentra(S.uA, "PROP-A", S.bDepo)));

  // ── El propio NO puede cambiar baseId/localId/ownership ───────────────
  await check("A intenta forzar productoBaseId/localId en el payload → 200 (ignorados)",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uA), body: editPayload({ codigo_barra_propio: "PROP-A2", productoBaseId: 99999, localId: S.lB, baseId: 99999 }) }), 200);
  {
    const pl = await plRow(S.bDepo, S.lA);
    assertOk("el ProductoLocal conserva baseId/localId correctos (sin cambio de ownership)", pl.baseId === S.bDepo && pl.localId === S.lA);
  }

  // ── COLISIONES (error claro ANTES de guardar) ─────────────────────────
  // (a) contra código propio de otro producto del mismo local.
  await check("A pone 'DUP' como propio del EXCLUSIVO de A → 200",
    req("PUT", ed(S.bA, S.lA), { cookie: cookieFor(S.uA), body: { nombre: "Sandwich A", codigo_barra: "EXCLA-P", codigo_barra_secundario: "EXCLA-S", unidad_medida: "unidad", factor_pack: 1, precio_venta: 120, margen: 50, redondeo_100: false, activo: true, es_combo: false, codigo_barra_propio: "DUP" } }), 200);
  await check("A intenta poner 'DUP' también en el producto de depósito → 409 (choca con propio de otro producto)",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uA), body: editPayload({ codigo_barra_propio: "DUP" }) }), 409,
    (r) => /código propio de otro producto/i.test(r.json?.error || ""));
  assertOk("tras el 409, el propio del producto de depósito NO cambió (sigue PROP-A2)", (await plRow(S.bDepo, S.lA)).codigo_barra_propio === "PROP-A2");

  // (b) contra código PRINCIPAL global de otro producto visible en el local.
  await check("A intenta poner el propio = 'EXCLA-P' (principal global de otro producto visible) → 409",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uA), body: editPayload({ codigo_barra_propio: "EXCLA-P" }) }), 409,
    (r) => /código principal/i.test(r.json?.error || ""));
  // (c) contra código SECUNDARIO global de otro producto visible en el local.
  await check("A intenta poner el propio = 'EXCLA-S' (secundario global de otro producto visible) → 409",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uA), body: editPayload({ codigo_barra_propio: "EXCLA-S" }) }), 409,
    (r) => /código secundario/i.test(r.json?.error || ""));

  // ── REDUNDANCIA: propio == un global del propio producto → se colapsa a null ──
  await check("A pone el propio = 'GLOBAL-P' (su propio principal) → 200",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uA), body: editPayload({ codigo_barra_propio: "GLOBAL-P" }) }), 200);
  assertOk("el propio quedó null (redundante con el global del propio producto)", (await plRow(S.bDepo, S.lA)).codigo_barra_propio == null);

  // ── MISMO código propio en DOS locales aislados (permitido) ───────────
  await check("A pone propio 'SHARED' en el producto de depósito → 200",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uA), body: editPayload({ codigo_barra_propio: "SHARED" }) }), 200);
  await check("B pone el MISMO propio 'SHARED' en el mismo producto de depósito → 200 (aislado por local)",
    req("PUT", ed(S.bDepo, S.lB), { cookie: cookieFor(S.uB), body: editPayload({ codigo_barra_propio: "SHARED" }) }), 200);
  assertOk("cada local encuentra 'SHARED' en su propia ubicación", (await posEncuentra(S.uA, "SHARED", S.bDepo)) && (await posEncuentra(S.uB, "SHARED", S.bDepo)));

  // ── ELIMINACIÓN (dejar null) ──────────────────────────────────────────
  await check("A elimina su propio (envía '') → 200",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uA), body: editPayload({ codigo_barra_propio: "" }) }), 200);
  assertOk("el propio de A quedó null y ya no se encuentra por 'SHARED' en A", (await plRow(S.bDepo, S.lA)).codigo_barra_propio == null && !(await posEncuentra(S.uA, "SHARED", S.bDepo)));
  assertOk("B conserva su propio 'SHARED' (no lo afectó A)", (await plRow(S.bDepo, S.lB)).codigo_barra_propio === "SHARED");

  // ── AISLAMIENTO fuerte: producto exclusivo de otro local + manipular localId ──
  // B pone un propio en su exclusivo? B no tiene exclusivo; probamos que B no puede
  // ver/editar el exclusivo de A ni por localId manipulado.
  await check("B intenta abrir el EXCLUSIVO de A → 404 (aislamiento)",
    req("GET", get(S.bA, S.lB), { cookie: cookieFor(S.uB) }), 404);
  assertOk("POS de B NO encuentra el exclusivo de A por su global 'EXCLA-P'", !(await posEncuentra(S.uB, "EXCLA-P", S.bA)));
  await check("B fuerza ?localId=A en editar del producto de depósito → 403 (fuera de alcance)",
    req("PUT", ed(S.bDepo, S.lA), { cookie: cookieFor(S.uB), body: editPayload({ codigo_barra_propio: "HACK" }) }), 403,
    (r) => /alcance/i.test(r.json?.error || ""));
  await check("B fuerza ?localId=A en obtener → 403 (no consulta propios ajenos)",
    req("GET", get(S.bDepo, S.lA), { cookie: cookieFor(S.uB) }), 403);
  assertOk("el propio de A NO fue tocado por el intento de B (sigue null)", (await plRow(S.bDepo, S.lA)).codigo_barra_propio == null);

  // ── El depósito administra sus globales + puede tener su propio tercer código ──
  await check("Depósito agrega su propio 'DEPO-3' a su producto → 200",
    req("PUT", ed(S.bDepo, S.depo), { cookie: cookieFor(S.uDepo), body: editPayload({ codigo_barra_propio: "DEPO-3" }) }), 200);
  assertOk("POS del depósito encuentra por su propio 'DEPO-3'; A no", (await posEncuentra(S.uDepo, "DEPO-3", S.bDepo)) && !(await posEncuentra(S.uA, "DEPO-3", S.bDepo)));
}

run()
  .then(async () => { await prisma.$disconnect(); console.log(`\n== CÓDIGO-PROPIO: ${pass} pass / ${fail} fail ==`); process.exit(fail === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(2); });
