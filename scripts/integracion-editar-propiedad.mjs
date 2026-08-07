// Harness de integración: PROPIEDAD DE EDICIÓN de productos (Opción C).
// El alcance de edición se decide por PROPIEDAD, no por es_deposito:
//   - Local dueño de un exclusivo → edita ficha maestra (base) + costo + override.
//   - Local sobre producto de depósito → solo override; ficha maestra bloqueada
//     (guardado engañoso RECHAZADO en vez de descartado en silencio).
//   - Local sobre exclusivo de otro local → acceso denegado.
//   - Admin conserva el comportamiento por ubicación.
// Contra dev server + DB test (mismo setup que integracion-costo-propiedad.mjs).
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_term_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3011" \
//   node scripts/integracion-editar-propiedad.mjs

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { DEFAULT_PERMISOS_SISTEMA, DUENO_LOCAL } from "../lib/rbac/systemRoles.js";

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("ABORT: falta AUTH_SECRET."); process.exit(2); }
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });

let pass = 0, fail = 0;
const S = {};

function cookieFor(user, { contextoLocalId = null, contextoEsDeposito = false, grupoActivo = null } = {}) {
  const token = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? null, esDuenoLocal: !!user.esDuenoLocal, esDeposito: !!user.esDeposito },
    AUTH_SECRET, { expiresIn: "8h" }
  );
  const cookies = [`erpazul_sesion=${token}`];
  if (grupoActivo) cookies.push(`erpazul_grupo_activo=${grupoActivo}`);
  if (contextoLocalId) cookies.push(`erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: contextoLocalId, esDeposito: contextoEsDeposito }))}`);
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
  else { console.log(`✖ ${name} → ${res.status} (esp ${expectedStatus}) ${JSON.stringify(res.json)?.slice(0, 180)}`); fail++; }
  return res;
}
function assertOk(name, cond, detail = "") { if (cond) { console.log(`✔ ${name}`); pass++; } else { console.log(`✖ ${name} ${detail}`); fail++; } }

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

async function baseRow(baseId) {
  return prisma.productoBase.findUnique({ where: { id: baseId }, select: { nombre: true, categoria_id: true, precio_costo: true, precio_venta: true } });
}
async function ventaLocal(baseId, localId) {
  const pl = await prisma.productoLocal.findFirst({ where: { baseId, localId }, select: { precio_venta: true } });
  return pl?.precio_venta == null ? null : Number(pl.precio_venta);
}

async function seed() {
  const hash = await bcrypt.hash("secret123", 8);
  const rolAdmin = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"], esSistema: true } });
  const rolDueno = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });

  const g = await prisma.grupo.create({ data: { nombre: "G-Editar" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localB.id } });

  const catG = await prisma.categoria.create({ data: { nombre: "Bebidas", grupoId: g.id } }).catch(() => null);

  const mk = (nombre, email, rolId, localId) => prisma.usuario.create({ data: { nombre, email, passwordHash: hash, rolId, localId } });
  const admin = await mk("Admin", "adm@editar.test", rolAdmin.id, null);
  const duenoDepo = await mk("DuenoDepo", "dd@editar.test", rolDueno.id, depo.id);
  const duenoA = await mk("DuenoA", "da@editar.test", rolDueno.id, localA.id);
  const duenoB = await mk("DuenoB", "db@editar.test", rolDueno.id, localB.id);

  // Producto de DEPÓSITO (creadoEnLocalId = depósito), materializado en los 3 locales.
  // redondeo_100 explícito (el default del schema es true): el payload de edición debe
  // echoar el valor guardado, igual que el form real (campo maestro deshabilitado).
  const baseDepo = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "Coca 2L", unidad_medida: "unidad", factor_pack: 1, precio_costo: 100, precio_venta: 150, margen: 50, redondeo_100: false },
  });
  await prisma.productoLocal.create({ data: { localId: depo.id, baseId: baseDepo.id, precio_costo: 100, precio_venta: 150, activo: true } });
  await prisma.productoLocal.create({ data: { localId: localA.id, baseId: baseDepo.id, precio_venta: 150, activo: true } });
  await prisma.productoLocal.create({ data: { localId: localB.id, baseId: baseDepo.id, activo: true } });

  // Producto EXCLUSIVO de Local A (creadoEnLocalId = localA), solo en A.
  const baseA = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: localA.id, nombre: "Sandwich A", unidad_medida: "unidad", factor_pack: 1, precio_costo: 80, precio_venta: 120, margen: 50, redondeo_100: false },
  });
  await prisma.productoLocal.create({ data: { localId: localA.id, baseId: baseA.id, precio_costo: 80, precio_venta: 120, activo: true } });

  // Producto LEGACY (creadoEnLocalId = null): se trata como de DEPÓSITO (decisión D2).
  const baseLegacy = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: null, nombre: "Legacy X", unidad_medida: "unidad", factor_pack: 1, precio_costo: 70, precio_venta: 100, margen: 40, redondeo_100: false },
  });
  await prisma.productoLocal.create({ data: { localId: depo.id, baseId: baseLegacy.id, precio_costo: 70, precio_venta: 100, activo: true } });
  await prisma.productoLocal.create({ data: { localId: localA.id, baseId: baseLegacy.id, precio_venta: 100, activo: true } });

  Object.assign(S, {
    baseLegacy: baseLegacy.id,
    g: g.id, depo: depo.id, localA: localA.id, localB: localB.id,
    catId: catG?.id ?? null,
    admin: { ...admin, permisos: ["*"] },
    duenoDepo: { ...duenoDepo, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true, esDeposito: true },
    duenoA: { ...duenoA, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    duenoB: { ...duenoB, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    baseDepo: baseDepo.id, baseA: baseA.id,
  });
}

// Payload de edición mínimo. Por defecto reenvía los valores actuales de la base.
function editPayload(nombre, over = {}) {
  return { nombre, unidad_medida: "unidad", factor_pack: 1, precio_venta: 150, margen: 50, redondeo_100: false, activo: true, es_combo: false, ...over };
}

async function run() {
  await truncateAll();
  await seed();
  const ed = (id, localId) => `/api/productos/editar/${id}?localId=${localId}`;
  const get = (id, localId) => `/api/productos/obtener?id=${id}&localId=${localId}`;

  // (a) Local dueño edita la FICHA MAESTRA (nombre + categoría) de su exclusivo → persiste en base.
  await check("Local A edita nombre/categoría de su exclusivo → 200",
    req("PUT", ed(S.baseA, S.localA), { cookie: cookieFor(S.duenoA),
      body: editPayload("Sandwich A PREMIUM", { precio_venta: 120, categoria_id: S.catId ?? undefined }) }), 200);
  {
    const b = await baseRow(S.baseA);
    assertOk("nombre del exclusivo persistido en base", b?.nombre === "Sandwich A PREMIUM", `(=${b?.nombre})`);
    if (S.catId) assertOk("categoría del exclusivo persistida en base", Number(b?.categoria_id) === Number(S.catId));
  }

  // (a.2) Local dueño edita el COSTO de su exclusivo → permitido.
  await check("Local A edita costo de su exclusivo → 200",
    req("PUT", ed(S.baseA, S.localA), { cookie: cookieFor(S.duenoA), body: editPayload("Sandwich A PREMIUM", { precio_venta: 120, precio_costo: 95 }) }), 200);
  assertOk("costo del exclusivo actualizado a 95", Number((await baseRow(S.baseA)).precio_costo) === 95);

  // (b) Local sobre producto de DEPÓSITO: edita SOLO precio de venta (override) → 200.
  //     Debe cambiar SOLO su ProductoLocal; la base (precio_venta y nombre) queda intacta.
  const ventaBaseAntes = Number((await baseRow(S.baseDepo)).precio_venta);
  await check("Local A edita venta de producto de depósito (override) → 200",
    req("PUT", ed(S.baseDepo, S.localA), { cookie: cookieFor(S.duenoA), body: editPayload("Coca 2L", { precio_venta: 210 }) }), 200);
  assertOk("override (ProductoLocal) de venta de A actualizado a 210", (await ventaLocal(S.baseDepo, S.localA)) === 210);
  assertOk("ficha maestra del depósito intacta (nombre)", (await baseRow(S.baseDepo)).nombre === "Coca 2L");
  assertOk("precio_venta de la BASE del depósito NO cambió (solo el ProductoLocal)", Number((await baseRow(S.baseDepo)).precio_venta) === ventaBaseAntes);
  assertOk("override de venta del DEPÓSITO no fue tocado por la edición de A", (await ventaLocal(S.baseDepo, S.depo)) === 150);

  // (c) Local sobre producto de DEPÓSITO: intenta cambiar el NOMBRE (ficha maestra) → 403 SIN guardado engañoso.
  await check("Local A intenta cambiar nombre de producto de depósito → 403 (sin guardado engañoso)",
    req("PUT", ed(S.baseDepo, S.localA), { cookie: cookieFor(S.duenoA), body: editPayload("Coca 2L HACKEADA", { precio_venta: 210 }) }), 403,
    (r) => r.json?.campo === "nombre" && /ficha maestra/i.test(r.json?.error || ""));
  assertOk("nombre del depósito NO cambió tras intento (sigue Coca 2L)", (await baseRow(S.baseDepo)).nombre === "Coca 2L");

  // (d) Local sobre exclusivo de OTRO local → acceso denegado.
  await check("Local B abre exclusivo de A (obtener) → 404 (aislamiento)",
    req("GET", get(S.baseA, S.localB), { cookie: cookieFor(S.duenoB) }), 404);
  await check("Local B edita exclusivo de A → 403 (denegado)",
    req("PUT", ed(S.baseA, S.localB), { cookie: cookieFor(S.duenoB), body: editPayload("Robado", { precio_venta: 1 }) }), 403,
    (r) => /pertenece a otro local/i.test(r.json?.error || ""));
  assertOk("nombre del exclusivo de A intacto tras intento de B", (await baseRow(S.baseA)).nombre === "Sandwich A PREMIUM");

  // (e) Flags de obtener: puedeEditarBase por propiedad.
  await check("obtener: A sobre su exclusivo → puedeEditarBase=true",
    req("GET", get(S.baseA, S.localA), { cookie: cookieFor(S.duenoA) }), 200,
    (r) => r.json?.puedeEditarBase === true && r.json?.puedeEditarCosto === true);
  await check("obtener: A sobre producto de depósito → puedeEditarBase=false (y costo=false)",
    req("GET", get(S.baseDepo, S.localA), { cookie: cookieFor(S.duenoA) }), 200,
    (r) => r.json?.puedeEditarBase === false && r.json?.puedeEditarCosto === false);
  await check("obtener: depósito sobre su producto → puedeEditarBase=true",
    req("GET", get(S.baseDepo, S.depo), { cookie: cookieFor(S.duenoDepo) }), 200,
    (r) => r.json?.puedeEditarBase === true);

  // (f) Admin: en contexto depósito edita la base del producto de depósito → 200 (comportamiento vigente).
  await check("Admin (contexto depósito) edita nombre de producto de depósito → 200",
    req("PUT", ed(S.baseDepo, S.depo), { cookie: cookieFor(S.admin, { grupoActivo: S.g, contextoLocalId: S.depo, contextoEsDeposito: true }),
      body: editPayload("Coca 2L Retornable", { precio_venta: 150 }) }), 200);
  assertOk("admin cambió el nombre maestro del depósito", (await baseRow(S.baseDepo)).nombre === "Coca 2L Retornable");

  // (g) Admin: en contexto Local A sobre producto de depósito, intento de cambiar nombre → 403 (tampoco guardado engañoso).
  await check("Admin (contexto Local A) intenta cambiar nombre de producto de depósito → 403",
    req("PUT", ed(S.baseDepo, S.localA), { cookie: cookieFor(S.admin, { grupoActivo: S.g, contextoLocalId: S.localA }),
      body: editPayload("Coca 2L OtraVez", { precio_venta: 150 }) }), 403,
    (r) => /ficha maestra/i.test(r.json?.error || ""));
  assertOk("nombre del depósito intacto tras intento admin-en-local", (await baseRow(S.baseDepo)).nombre === "Coca 2L Retornable");

  // (h) LEGACY (creadoEnLocalId=null): el DEPÓSITO es dueño → edita la base.
  await check("obtener LEGACY desde el depósito → puedeEditarBase=true",
    req("GET", get(S.baseLegacy, S.depo), { cookie: cookieFor(S.duenoDepo) }), 200, (r) => r.json?.puedeEditarBase === true);
  await check("Depósito edita nombre del LEGACY → 200",
    req("PUT", ed(S.baseLegacy, S.depo), { cookie: cookieFor(S.duenoDepo), body: editPayload("Legacy X Renombrado", { precio_venta: 100 }) }), 200);
  assertOk("nombre del legacy persistido en base", (await baseRow(S.baseLegacy)).nombre === "Legacy X Renombrado");

  // (i) LEGACY visto desde un LOCAL → tratado como de depósito: solo override, base bloqueada.
  await check("obtener LEGACY desde Local A → puedeEditarBase=false",
    req("GET", get(S.baseLegacy, S.localA), { cookie: cookieFor(S.duenoA) }), 200, (r) => r.json?.puedeEditarBase === false);
  await check("Local A intenta cambiar nombre del LEGACY → 403 (base del legacy la gobierna el depósito)",
    req("PUT", ed(S.baseLegacy, S.localA), { cookie: cookieFor(S.duenoA), body: editPayload("Legacy HACK", { precio_venta: 100 }) }), 403,
    (r) => /ficha maestra/i.test(r.json?.error || ""));
  assertOk("nombre del legacy intacto tras intento del local", (await baseRow(S.baseLegacy)).nombre === "Legacy X Renombrado");

  // (j) Manipular manualmente localId: un no-admin NO puede operar como otro local.
  await check("Local A fuerza ?localId=Local B en editar → 403 (fuera de alcance)",
    req("PUT", ed(S.baseDepo, S.localB), { cookie: cookieFor(S.duenoA), body: editPayload("Coca 2L", { precio_venta: 999 }) }), 403,
    (r) => /alcance/i.test(r.json?.error || ""));
  await check("Local A fuerza ?localId=Local B en obtener → 403 (fuera de alcance)",
    req("GET", get(S.baseDepo, S.localB), { cookie: cookieFor(S.duenoA) }), 403,
    (r) => /alcance/i.test(r.json?.error || ""));
}

run()
  .then(async () => { await prisma.$disconnect(); console.log(`\n== EDITAR-PROPIEDAD: ${pass} pass / ${fail} fail ==`); process.exit(fail === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(2); });
