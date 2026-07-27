// Harness de integración: REPORTES DE VENTAS — scope por ubicación/grupo.
// Regresión del bug "Local fuera de tu grupo activo": el admin con contexto de un
// local (sin cookie erpazul_grupo_activo) debe poder consultar ESE local; y no debe
// poder cruzar a otro grupo pasando otro localId. general y listado: misma regla.
// Uso: DATABASE_URL=<test> AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/integracion-reportes-ventas.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) { console.error("ABORT: no test DB"); process.exit(2); }
const AUTH_SECRET = process.env.AUTH_SECRET;
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
let pass = 0, fail = 0;
const S = {};
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

// Cookie: sesión + (opcional) contexto activo (local) + (opcional) grupo activo.
function cookie(user, { contextoLocalId, grupoActivo } = {}) {
  const t = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? undefined, esDuenoLocal: true },
    AUTH_SECRET, { expiresIn: "8h" }
  );
  const parts = [`erpazul_sesion=${t}`];
  if (contextoLocalId != null) parts.push(`erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: contextoLocalId }))}`);
  if (grupoActivo != null) parts.push(`erpazul_grupo_activo=${grupoActivo}`);
  return parts.join("; ");
}
async function get(path, ck) {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: ck } });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
async function truncate() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const n = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`);
}

async function seed() {
  const hash = await bcrypt.hash("x", 8);
  const rolAdmin = await prisma.rol.create({ data: { nombre: "AdminTest", permisos: ["*"], esSistema: false } });
  const rolRep = await prisma.rol.create({ data: { nombre: "RepTest", permisos: ["reportes.ver"], esSistema: false } });
  // Grupo A: local X + depósito D. Grupo B: local Y.
  const gA = await prisma.grupo.create({ data: { nombre: "GA" } });
  const gB = await prisma.grupo.create({ data: { nombre: "GB" } });
  const localX = await prisma.local.create({ data: { nombre: "X", es_deposito: false } });
  const depoD = await prisma.local.create({ data: { nombre: "D", es_deposito: true } });
  const localY = await prisma.local.create({ data: { nombre: "Y", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: gA.id, localId: localX.id } });
  await prisma.grupoDeposito.create({ data: { grupoId: gA.id, localId: depoD.id } });
  await prisma.grupoLocal.create({ data: { grupoId: gB.id, localId: localY.id } });
  const admin = await prisma.usuario.create({ data: { nombre: "Adm", email: "adm@t.test", passwordHash: hash, rolId: rolAdmin.id } });
  const uLocal = await prisma.usuario.create({ data: { nombre: "UX", email: "ux@t.test", passwordHash: hash, rolId: rolRep.id, localId: localX.id } });
  const uDepo = await prisma.usuario.create({ data: { nombre: "UD", email: "ud@t.test", passwordHash: hash, rolId: rolRep.id, localId: depoD.id } });
  Object.assign(S, {
    gA: gA.id, gB: gB.id, localX: localX.id, depoD: depoD.id, localY: localY.id,
    admin: { id: admin.id, rolId: rolAdmin.id, permisos: ["*"] }, // sin localId → admin sin local fijo
    uLocal: { id: uLocal.id, rolId: rolRep.id, permisos: ["reportes.ver"], localId: localX.id },
    uDepo: { id: uDepo.id, rolId: rolRep.id, permisos: ["reportes.ver"], localId: depoD.id },
  });
}

const Q = "fechaDesde=2026-07-01&fechaHasta=2026-07-31";
const ep = (name, extra = "") => `/api/reportes-ventas/${name}?${Q}${extra}`;

async function run() {
  await truncate(); await seed();

  for (const name of ["general", "listado"]) {
    // 1) Admin con contexto local X, SIN cookie grupo_activo, consultando X → 200 (regresión del bug)
    const r1 = await get(ep(name, `&localId=${S.localX}`), cookie(S.admin, { contextoLocalId: S.localX }));
    ok(`[${name}] admin ctx=X sin grupo_activo, localId=X → 200`, r1.status === 200, `status=${r1.status} ${JSON.stringify(r1.j).slice(0, 90)}`);

    // 2) Admin con contexto en grupo A (local X) consultando local del grupo B → 403 (aislamiento)
    const r2 = await get(ep(name, `&localId=${S.localY}`), cookie(S.admin, { contextoLocalId: S.localX }));
    ok(`[${name}] admin ctx grupoA, localId=Y(grupoB) → 403`, r2.status === 403 && /grupo activo/i.test(r2.j?.error || ""), `status=${r2.status} ${r2.j?.error}`);

    // 3) Admin con session.grupoId correcto (cookie grupo_activo=A) → 200
    const r3 = await get(ep(name, `&localId=${S.localX}`), cookie(S.admin, { grupoActivo: S.gA }));
    ok(`[${name}] admin grupo_activo=A, localId=X → 200`, r3.status === 200, `status=${r3.status}`);

    // 4) No-admin consultando OTRO local → 403 (comportamiento intacto)
    const r4 = await get(ep(name, `&localId=${S.localY}`), cookie(S.uLocal));
    ok(`[${name}] no-admin localId=Y → 403 alcance`, r4.status === 403 && /alcance/i.test(r4.j?.error || ""), `status=${r4.status} ${r4.j?.error}`);

    // 5) Usuario de depósito consultando SU depósito → 200
    const r5 = await get(ep(name, `&localId=${S.depoD}`), cookie(S.uDepo));
    ok(`[${name}] user depósito localId=D → 200`, r5.status === 200, `status=${r5.status} ${JSON.stringify(r5.j).slice(0, 90)}`);

    // 6) Admin sin contexto activo (sin localId, sin cookies) → 409 needsContexto
    const r6 = await get(ep(name), cookie(S.admin));
    ok(`[${name}] admin sin contexto (sin localId) → 409 needsContexto`, r6.status === 409 && r6.j?.needsContexto === true, `status=${r6.status} ${JSON.stringify(r6.j).slice(0, 90)}`);

    // 7) Seguridad extra: admin con grupo_activo=A pero pidiendo Y (grupo B) → 403
    const r7 = await get(ep(name, `&localId=${S.localY}`), cookie(S.admin, { grupoActivo: S.gA }));
    ok(`[${name}] admin grupo_activo=A, localId=Y(grupoB) → 403`, r7.status === 403 && /grupo activo/i.test(r7.j?.error || ""), `status=${r7.status}`);
  }

  // Paridad general vs listado (mismo status y error para las mismas entradas)
  const cAdmin = cookie(S.admin, { contextoLocalId: S.localX });
  const gOk = await get(ep("general", `&localId=${S.localX}`), cAdmin);
  const lOk = await get(ep("listado", `&localId=${S.localX}`), cAdmin);
  ok("paridad OK: general/listado ambos 200", gOk.status === 200 && lOk.status === 200);
  const gNo = await get(ep("general", `&localId=${S.localY}`), cAdmin);
  const lNo = await get(ep("listado", `&localId=${S.localY}`), cAdmin);
  ok("paridad 403: general/listado mismo status y error", gNo.status === 403 && lNo.status === 403 && gNo.j?.error === lNo.j?.error, `g=${gNo.status}:${gNo.j?.error} l=${lNo.status}:${lNo.j?.error}`);

  console.log(`\nRESULTADO REPORTES-VENTAS: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

run().catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(1); });
