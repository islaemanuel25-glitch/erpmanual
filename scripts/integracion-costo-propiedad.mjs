// Harness de integración: PROPIEDAD DEL PRECIO DE COSTO por origen de producto.
// Solo el depósito administra el costo de productos del depósito; solo el local
// creador administra el costo de sus productos exclusivos. Contra dev server + DB test.
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_migration_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3011" \
//   node scripts/integracion-costo-propiedad.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { DEFAULT_PERMISOS_SISTEMA, DUENO_LOCAL } from "../lib/rbac/systemRoles.js";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) { console.error("ABORT: DATABASE_URL no apunta a *test*."); process.exit(2); }
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("ABORT: falta AUTH_SECRET."); process.exit(2); }
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });

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
  else { console.log(`✖ ${name} → ${res.status} (esp ${expectedStatus}) ${JSON.stringify(res.json)?.slice(0, 160)}`); fail++; }
  return res;
}
function assertOk(name, cond, detail = "") { if (cond) { console.log(`✔ ${name}`); pass++; } else { console.log(`✖ ${name} ${detail}`); fail++; } }

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

async function costoBase(baseId) {
  const b = await prisma.productoBase.findUnique({ where: { id: baseId }, select: { precio_costo: true } });
  return b ? Number(b.precio_costo) : null;
}
async function costoLocal(baseId, localId) {
  const pl = await prisma.productoLocal.findFirst({ where: { baseId, localId }, select: { precio_costo: true } });
  return pl?.precio_costo == null ? null : Number(pl.precio_costo);
}
async function ventaBase(baseId) {
  const b = await prisma.productoBase.findUnique({ where: { id: baseId }, select: { precio_venta: true } });
  return b?.precio_venta == null ? null : Number(b.precio_venta);
}
async function ventaLocal(baseId, localId) {
  const pl = await prisma.productoLocal.findFirst({ where: { baseId, localId }, select: { precio_venta: true } });
  return pl?.precio_venta == null ? null : Number(pl.precio_venta);
}

async function seed() {
  const hash = await bcrypt.hash("secret123", 8);
  const rolAdmin = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"], esSistema: true } });
  const rolDueno = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });

  const g = await prisma.grupo.create({ data: { nombre: "G-Costo" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localB.id } });

  const mk = (nombre, email, rolId, localId) => prisma.usuario.create({ data: { nombre, email, passwordHash: hash, rolId, localId } });
  const admin = await mk("Admin", "adm@costo.test", rolAdmin.id, null);
  const duenoDepo = await mk("DuenoDepo", "dd@costo.test", rolDueno.id, depo.id);
  const duenoA = await mk("DuenoA", "da@costo.test", rolDueno.id, localA.id);
  const duenoB = await mk("DuenoB", "db@costo.test", rolDueno.id, localB.id);

  // Producto de DEPÓSITO (creadoEnLocalId = depósito), materializado en los 3 locales.
  const baseDepo = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "Coca 2L", unidad_medida: "unidad", factor_pack: 1, precio_costo: 100, precio_venta: 150, margen: 50 },
  });
  const plDepoDepo = await prisma.productoLocal.create({ data: { localId: depo.id, baseId: baseDepo.id, precio_costo: 100, precio_venta: 150, activo: true } });
  const plDepoA = await prisma.productoLocal.create({ data: { localId: localA.id, baseId: baseDepo.id, activo: true } }); // costo null → hereda maestro
  await prisma.productoLocal.create({ data: { localId: localB.id, baseId: baseDepo.id, activo: true } });
  await prisma.stockLocal.create({ data: { localId: localA.id, productoId: plDepoA.id, cantidad: 0 } });

  // Producto EXCLUSIVO de Local A (creadoEnLocalId = localA), solo en A.
  const baseA = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: localA.id, nombre: "Sandwich A", unidad_medida: "unidad", factor_pack: 1, precio_costo: 80, precio_venta: 120, margen: 50 },
  });
  const plA = await prisma.productoLocal.create({ data: { localId: localA.id, baseId: baseA.id, precio_costo: 80, precio_venta: 120, activo: true } });

  const prov = await prisma.proveedor.create({ data: { nombre: "Prov1", creadoEnLocalId: depo.id } });

  Object.assign(S, {
    g: g.id, depo: depo.id, localA: localA.id, localB: localB.id,
    admin: { ...admin, permisos: ["*"] },
    duenoDepo: { ...duenoDepo, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true, esDeposito: true },
    duenoA: { ...duenoA, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    duenoB: { ...duenoB, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    baseDepo: baseDepo.id, plDepoA: plDepoA.id, baseA: baseA.id, plA: plA.id, prov: prov.id,
  });
}

// Payload mínimo de edición para el endpoint productos/editar.
function editPayload(over = {}) {
  return { nombre: "Coca 2L", unidad_medida: "unidad", factor_pack: 1, precio_venta: 150, margen: 50, redondeo_100: false, activo: true, es_combo: false, ...over };
}

async function run() {
  await truncateAll();
  await seed();
  const ed = (id, localId) => `/api/productos/editar/${id}?localId=${localId}`;

  // 1. Depósito modifica el costo de un producto de depósito → permitido.
  await check("Depósito edita costo de producto de depósito → 200",
    req("PUT", ed(S.baseDepo, S.depo), { cookie: cookieFor(S.duenoDepo), body: editPayload({ precio_costo: 120 }) }), 200);
  assertOk("costo maestro actualizado a 120", (await costoBase(S.baseDepo)) === 120);

  // 2. Local intenta modificar el costo de un producto de depósito → RECHAZADO (403).
  await check("Local A edita costo de producto de depósito → 403",
    req("PUT", ed(S.baseDepo, S.localA), { cookie: cookieFor(S.duenoA), body: editPayload({ precio_costo: 999 }) }), 403,
    (r) => /depósito/i.test(r.json?.error || ""));
  assertOk("costo maestro NO cambió (sigue 120)", (await costoBase(S.baseDepo)) === 120);

  // 3. Local modifica el PRECIO DE VENTA de un producto de depósito → permitido (costo intacto).
  // (El override de A ya vale 120: lo propagó la edición del depósito vía sync — el
  //  depósito administra el costo. Lo relevante: la edición de A NO cambia el costo.)
  const ovCostoAAntes = await costoLocal(S.baseDepo, S.localA);
  await check("Local A edita venta de producto de depósito (costo sin cambios) → 200",
    req("PUT", ed(S.baseDepo, S.localA), { cookie: cookieFor(S.duenoA), body: editPayload({ precio_costo: 120, precio_venta: 200 }) }), 200);
  assertOk("costo maestro intacto (120) tras editar venta", (await costoBase(S.baseDepo)) === 120);
  assertOk("A no cambió el costo (override de A igual que antes)", (await costoLocal(S.baseDepo, S.localA)) === ovCostoAAntes);

  // 4. Local creador modifica el costo de su producto exclusivo → permitido.
  await check("Local A edita costo de su producto exclusivo → 200",
    req("PUT", ed(S.baseA, S.localA), { cookie: cookieFor(S.duenoA), body: editPayload({ nombre: "Sandwich A", precio_venta: 120, precio_costo: 90 }) }), 200);
  assertOk("costo efectivo del exclusivo de A actualizado a 90",
    ((await costoLocal(S.baseA, S.localA)) ?? (await costoBase(S.baseA))) === 90);

  // 5. Otro local intenta modificar el costo del producto exclusivo → RECHAZADO (403).
  await check("Local B edita costo de producto exclusivo de A → 403",
    req("PUT", ed(S.baseA, S.localB), { cookie: cookieFor(S.duenoB), body: editPayload({ nombre: "Sandwich A", precio_venta: 120, precio_costo: 1 }) }), 403,
    (r) => /local que lo creó/i.test(r.json?.error || ""));

  // 6/7. Bypass de UI: llamada directa del endpoint por un no-dueño → RECHAZADO (403).
  //   (mismo camino que 2/5; el backend no depende de la interfaz).
  await check("Bypass directo: Local B cambia costo de producto de depósito → 403",
    req("PUT", ed(S.baseDepo, S.localB), { cookie: cookieFor(S.duenoB), body: editPayload({ precio_costo: 777 }) }), 403);
  assertOk("costo maestro intacto tras bypass (120)", (await costoBase(S.baseDepo)) === 120);
  // obtener expone el flag correcto por ubicación.
  await check("obtener producto de depósito desde A → puedeEditarCosto=false",
    req("GET", `/api/productos/obtener?id=${S.baseDepo}&localId=${S.localA}`, { cookie: cookieFor(S.duenoA) }), 200,
    (r) => r.json?.puedeEditarCosto === false && r.json?.costoDeDeposito === true);
  await check("obtener producto de depósito desde el depósito → puedeEditarCosto=true",
    req("GET", `/api/productos/obtener?id=${S.baseDepo}&localId=${S.depo}`, { cookie: cookieFor(S.duenoDepo) }), 200,
    (r) => r.json?.puedeEditarCosto === true);

  // 8. Edición SIN mandar el costo (dueño) → no borra ni sobrescribe el costo actual.
  const bodySinCosto = editPayload({ precio_venta: 175 });
  delete bodySinCosto.precio_costo;
  await check("Depósito edita SIN costo → 200 (no debe borrar el costo)",
    req("PUT", ed(S.baseDepo, S.depo), { cookie: cookieFor(S.duenoDepo), body: bodySinCosto }), 200);
  assertOk("costo maestro preservado (sigue 120, no null)", (await costoBase(S.baseDepo)) === 120);

  // 9a. Edición masiva desde un local sobre producto de depósito: el costo maestro
  // queda protegido, pero el PRECIO DE VENTA del local sí se aplica y no se derrama.
  // Antes acá se salteaba la fila entera y el local quedaba sin poder actualizar su
  // precio de venta: ese salteo era el bug, no la regla.
  const ventaBaseAntes9a = await ventaBase(S.baseDepo);
  const ventaBAntes9a = await ventaLocal(S.baseDepo, S.localB);
  await check("Masiva (admin en contexto Local A) sobre producto de depósito → 200, venta local aplicada",
    req("POST", "/api/productos/precios/apply", {
      cookie: cookieFor(S.admin, { grupoActivo: S.g, contextoLocalId: S.localA }),
      body: { localId: S.localA, metodo: "MARGEN_MASIVO", pricingMode: "RECALC_BY_MARGIN",
        items: [{ productoBaseId: S.baseDepo, costoAnterior: 120, costoNuevo: 555, ventaAnterior: 150, ventaNueva: 999 }] },
    }), 200, (r) => r.json?.soloVenta === 1 && Array.isArray(r.json?.saltados) && r.json.saltados.length === 0);
  assertOk("masiva NO cambió el costo maestro del depósito (120)", (await costoBase(S.baseDepo)) === 120);
  assertOk("masiva aplicó la venta en el local A (999)", (await ventaLocal(S.baseDepo, S.localA)) === 999);
  assertOk("masiva NO cambió la venta maestra del depósito", (await ventaBase(S.baseDepo)) === ventaBaseAntes9a);
  assertOk("masiva NO cambió la venta del local B", (await ventaLocal(S.baseDepo, S.localB)) === ventaBAntes9a);

  // 9b. Masiva desde el DEPÓSITO sobre su producto → aplica.
  await check("Masiva (admin en contexto Depósito) sobre producto de depósito → 200 aplicado",
    req("POST", "/api/productos/precios/apply", {
      cookie: cookieFor(S.admin, { grupoActivo: S.g, contextoLocalId: S.depo, contextoEsDeposito: true }),
      body: { localId: S.depo, metodo: "MARGEN_MASIVO", pricingMode: "RECALC_BY_MARGIN",
        items: [{ productoBaseId: S.baseDepo, costoAnterior: 120, costoNuevo: 130, ventaAnterior: 150, ventaNueva: 195 }] },
    }), 200, (r) => r.json?.applied === 1);
  assertOk("masiva del depósito SÍ cambió el costo maestro (130)", (await costoBase(S.baseDepo)) === 130);

  // 10. Compras: Local A crea un pedido de un producto de depósito → NO toca el costo.
  const baseAntesCompra = await costoBase(S.baseDepo);
  const ovAntesCompra = await costoLocal(S.baseDepo, S.localA);
  await check("Compra creada por Local A de producto de depósito → 200",
    req("POST", "/api/compras-proveedor/crear", {
      cookie: cookieFor(S.duenoA),
      body: { proveedorId: S.prov, items: [{ productoLocalId: S.plDepoA, cantidad: 1, unidad: "UNIDAD", precioCosto: 500 }] },
    }), 200);
  assertOk("compra de A NO cambió el costo maestro del depósito", (await costoBase(S.baseDepo)) === baseAntesCompra);
  assertOk("compra de A NO cambió el costo (override) de A", (await costoLocal(S.baseDepo, S.localA)) === ovAntesCompra);
}

run()
  .then(async () => { await prisma.$disconnect(); console.log(`\n== COSTO-PROPIEDAD: ${pass} pass / ${fail} fail ==`); process.exit(fail === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(2); });
