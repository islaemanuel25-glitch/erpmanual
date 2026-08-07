// Harness de integración: POS "ventas del día" (historial-dia + stats-dia).
// Regresión del bug de zona horaria: la ventana del día debe ser el día ARGENTINO
// (getRangoArgentina), no el día UTC del contenedor. Verifica que una venta de las
// 23:30 ART (ya día siguiente en UTC) siga contando como HOY, y que ayer/mañana ART
// no aparezcan. Además: contexto admin (depósito) y aislamiento no-admin intactos.
// Uso: DATABASE_URL=...erpazul_term_test AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/integracion-pos-historial-dia.mjs

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const AUTH_SECRET = process.env.AUTH_SECRET;
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });
let pass = 0, fail = 0;
const S = {};
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

const TZ = "America/Argentina/Cordoba";
function fechaAR_ISO(d) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
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
function cookieAdmin(localId) {
  const t = jwt.sign({ id: S.admin.id, rolId: S.admin.rolId, permisos: ["*"], esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  return `erpazul_sesion=${t}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId }))}`;
}
function cookieUser(u) {
  const t = jwt.sign({ id: u.id, rolId: u.rolId, permisos: ["pos.usar"], localId: u.localId, esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  return `erpazul_sesion=${t}`;
}

async function crearVenta(localId, vendedorId, numero, fecha, total = 1000) {
  return prisma.venta.create({ data: { localId, vendedorId, numero, fecha, subtotal: total, total, formaPago: "efectivo" } });
}

async function seed() {
  const hash = await bcrypt.hash("x", 8);
  const rolAdmin = await prisma.rol.create({ data: { nombre: "AdminTest", permisos: ["*"], esSistema: false } });
  const rolPos = await prisma.rol.create({ data: { nombre: "PosTest", permisos: ["pos.usar"], esSistema: false } }); // sin turnos.ver_todos
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const local = await prisma.local.create({ data: { nombre: "L", es_deposito: false } });
  const depo = await prisma.local.create({ data: { nombre: "D", es_deposito: true } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  const admin = await prisma.usuario.create({ data: { nombre: "Adm", email: "adm@t.test", passwordHash: hash, rolId: rolAdmin.id } });
  const uLocal = await prisma.usuario.create({ data: { nombre: "UX", email: "ux@t.test", passwordHash: hash, rolId: rolPos.id, localId: local.id } });
  Object.assign(S, { g: g.id, local: local.id, depo: depo.id,
    admin: { id: admin.id, rolId: rolAdmin.id },
    uLocal: { id: uLocal.id, rolId: rolPos.id, localId: local.id } });

  // Fechas ancla en hora Argentina (UTC-3, sin DST)
  const now = new Date();
  const hoyAR = fechaAR_ISO(now);
  const noon = new Date(`${hoyAR}T12:00:00-03:00`);
  const ayerAR = fechaAR_ISO(new Date(noon.getTime() - 86400000));
  const mananaAR = fechaAR_ISO(new Date(noon.getTime() + 86400000));
  const F = {
    hoy15: new Date(`${hoyAR}T15:00:00-03:00`),     // 15:00 ART hoy
    hoy2330: new Date(`${hoyAR}T23:30:00-03:00`),   // 23:30 ART hoy = 02:30 UTC del día siguiente
    ayer15: new Date(`${ayerAR}T15:00:00-03:00`),   // ayer ART
    manana15: new Date(`${mananaAR}T15:00:00-03:00`), // mañana ART
  };
  S.F = F;
  console.log(`   [fechas] hoyAR=${hoyAR} | hoy23:30 ART = ${F.hoy2330.toISOString()} (UTC)`);

  // En LOCAL, vendedor = uLocal (para que el no-admin, filtrado por vendedor, las vea)
  await crearVenta(local.id, uLocal.id, 1, F.hoy15);
  await crearVenta(local.id, uLocal.id, 2, F.hoy2330);
  await crearVenta(local.id, uLocal.id, 3, F.ayer15);
  await crearVenta(local.id, uLocal.id, 4, F.manana15);
  // En DEPÓSITO, vendedor = admin (para el test de contexto=depósito)
  await crearVenta(depo.id, admin.id, 5, F.hoy15);
}

async function run() {
  await truncate(); await seed();

  // 1) Admin con contexto=LOCAL: historial-dia debe traer SOLO las 2 de hoy ART
  const h = await get("/api/pos-ventas/historial-dia?limit=50", cookieAdmin(S.local));
  const items = h.j?.items || [];
  const nums = items.map((v) => v.numero).sort();
  ok("historial-dia admin ctx=L → 2 ventas de hoy ART", items.length === 2, `len=${items.length} nums=${JSON.stringify(nums)}`);
  ok("incluye venta 15:00 ART (numero 1)", nums.includes(1));
  ok("incluye venta 23:30 ART (numero 2, día siguiente en UTC)", nums.includes(2));
  ok("NO incluye venta de AYER ART (numero 3)", !nums.includes(3));
  ok("NO incluye venta de MAÑANA ART (numero 4)", !nums.includes(4));

  // 2) stats-dia coherente con historial-dia (mismo rango)
  const s = await get(`/api/pos-ventas/stats-dia?localId=${S.local}`, cookieAdmin(S.local));
  ok("stats-dia admin L → ventas=2", s.j?.stats?.ventas === 2, JSON.stringify(s.j?.stats));
  ok("stats-dia coherente con historial-dia (2==2)", s.j?.stats?.ventas === items.length);

  // 3) Admin con contexto=DEPÓSITO: obtiene su venta de hoy (contexto intacto)
  const hd = await get("/api/pos-ventas/historial-dia?limit=50", cookieAdmin(S.depo));
  ok("admin ctx=depósito → 1 venta de hoy", (hd.j?.items || []).length === 1, `len=${(hd.j?.items || []).length}`);
  const sd = await get(`/api/pos-ventas/stats-dia?localId=${S.depo}`, cookieAdmin(S.depo));
  ok("stats-dia depósito → ventas=1", sd.j?.stats?.ventas === 1, JSON.stringify(sd.j?.stats));

  // 4) Usuario de LOCAL (no-admin): solo las de SU local (aislamiento intacto)
  const hn = await get("/api/pos-ventas/historial-dia?limit=50", cookieUser(S.uLocal));
  const numsN = (hn.j?.items || []).map((v) => v.numero).sort();
  ok("no-admin local L → 2 ventas de hoy (suyas)", (hn.j?.items || []).length === 2, `nums=${JSON.stringify(numsN)}`);
  ok("no-admin NO ve depósito (numero 5)", !numsN.includes(5));
  const sn = await get(`/api/pos-ventas/stats-dia?localId=${S.local}`, cookieUser(S.uLocal));
  ok("no-admin stats-dia L → ventas=2", sn.j?.stats?.ventas === 2, JSON.stringify(sn.j?.stats));

  // 5) No-admin pidiendo OTRO local (depósito) → 403 (scoping intacto)
  const sx = await get(`/api/pos-ventas/stats-dia?localId=${S.depo}`, cookieUser(S.uLocal));
  ok("no-admin stats-dia localId=depósito → 403", sx.status === 403, `status=${sx.status}`);

  console.log(`\nRESULTADO POS-HISTORIAL-DIA: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

run().catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(1); });
