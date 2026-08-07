// Harness de integración: TEMA INSTITUCIONAL en SSR (anti-FOUC).
// Verifica que el HTML del server ya trae `data-theme` con el tema institucional
// del local (o default), sin depender de fetch cliente. Contra dev server + DB test.
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_term_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3011" \
//   node scripts/integracion-tema-ssr.mjs

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

function cookieFor(user, { contextoLocalId = null, grupoActivo = null } = {}) {
  const token = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? null, esDuenoLocal: !!user.esDuenoLocal },
    AUTH_SECRET, { expiresIn: "8h" }
  );
  const cookies = [`erpazul_sesion=${token}`];
  if (grupoActivo) cookies.push(`erpazul_grupo_activo=${grupoActivo}`);
  if (contextoLocalId) cookies.push(`erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId: contextoLocalId, esDeposito: false }))}`);
  return cookies.join("; ");
}

// Extrae el valor de data-theme del <html> en el HTML SSR.
function dataTheme(html) {
  const m = html.match(/<html[^>]*\sdata-theme="([^"]+)"/i);
  return m ? m[1] : null;
}

async function getHtml(path, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { headers });
  const html = await res.text();
  return { status: res.status, theme: dataTheme(html) };
}

function assertOk(name, cond, detail = "") { if (cond) { console.log(`✔ ${name}`); pass++; } else { console.log(`✖ ${name} ${detail}`); fail++; } }

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

async function seed() {
  const hash = await bcrypt.hash("secret123", 8);
  const rolAdmin = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"], esSistema: true } });
  const rolDueno = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });

  const g = await prisma.grupo.create({ data: { nombre: "G-Tema" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localB.id } });

  // Local A tiene tema institucional CLARO (sunmiLight); Local B no tiene config.
  await prisma.configuracionLocal.create({ data: { localId: localA.id, aparienciaJson: { tema: "sunmiLight" } } });

  const mk = (nombre, email, rolId, localId) => prisma.usuario.create({ data: { nombre, email, passwordHash: hash, rolId, localId } });
  const admin = await mk("Admin", "adm@tema.test", rolAdmin.id, null);
  const duenoA = await mk("DuenoA", "da@tema.test", rolDueno.id, localA.id);
  const duenoB = await mk("DuenoB", "db@tema.test", rolDueno.id, localB.id);

  Object.assign(S, {
    g: g.id, depo: depo.id, localA: localA.id, localB: localB.id,
    admin: { ...admin, permisos: ["*"] },
    duenoA: { ...duenoA, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    duenoB: { ...duenoB, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
  });
}

async function run() {
  await truncateAll();
  await seed();

  // 1. Usuario de Local A (tema institucional sunmiLight) → el HTML SSR ya trae sunmiLight.
  const a = await getHtml("/inicio", cookieFor(S.duenoA));
  assertOk("Local A: HTML SSR con data-theme=sunmiLight (sin flash)", a.theme === "sunmiLight", `got=${a.theme} status=${a.status}`);

  // 2. Usuario de Local B (sin config) → default sunmiDark en SSR.
  const b = await getHtml("/inicio", cookieFor(S.duenoB));
  assertOk("Local B: HTML SSR con data-theme=sunmiDark (default, sin config)", b.theme === "sunmiDark", `got=${b.theme} status=${b.status}`);

  // 3. Sin sesión (login) → default sunmiDark.
  const login = await getHtml("/login", null);
  assertOk("Sin sesión: HTML SSR con data-theme=sunmiDark (default)", login.theme === "sunmiDark", `got=${login.theme} status=${login.status}`);

  // 4. Admin con contexto activo = Local A → toma el tema del local vía cookie de contexto.
  const admin = await getHtml("/inicio", cookieFor(S.admin, { grupoActivo: S.g, contextoLocalId: S.localA }));
  assertOk("Admin (contexto Local A): HTML SSR con data-theme=sunmiLight", admin.theme === "sunmiLight", `got=${admin.theme} status=${admin.status}`);

  // 5. Admin SIN contexto → sin local → default sunmiDark.
  const adminSinCtx = await getHtml("/inicio", cookieFor(S.admin, { grupoActivo: S.g }));
  assertOk("Admin sin contexto: HTML SSR con data-theme=sunmiDark (default)", adminSinCtx.theme === "sunmiDark", `got=${adminSinCtx.theme} status=${adminSinCtx.status}`);

  // 6. Cambiar el tema institucional de Local A → el SSR refleja el nuevo tema.
  await prisma.configuracionLocal.update({ where: { localId: S.localA }, data: { aparienciaJson: { tema: "operixNight" } } });
  const a2 = await getHtml("/inicio", cookieFor(S.duenoA));
  assertOk("Local A tras cambiar a operixNight: HTML SSR lo refleja", a2.theme === "operixNight", `got=${a2.theme}`);

  // 7. Tema institucional inválido en DB → fallback a default (no rompe).
  await prisma.configuracionLocal.update({ where: { localId: S.localA }, data: { aparienciaJson: { tema: "temaQueNoExiste" } } });
  const a3 = await getHtml("/inicio", cookieFor(S.duenoA));
  assertOk("Local A con tema inválido: HTML SSR cae a sunmiDark (fail-safe)", a3.theme === "sunmiDark", `got=${a3.theme}`);
}

run()
  .then(async () => { await prisma.$disconnect(); console.log(`\n== TEMA-SSR: ${pass} pass / ${fail} fail ==`); process.exit(fail === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(2); });
