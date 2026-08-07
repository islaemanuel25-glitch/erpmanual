// Harness de integración RBAC/aislamiento contra los ENDPOINTS REALES vía HTTP.
// Prueba que la seguridad viva en el backend (no solo en el frontend).
//
// Requisitos:
//   1) Base aislada de test (el nombre DEBE contener "test"). Aborta si no.
//   2) Un dev server de Next corriendo en BASE_URL apuntando a ESA misma base.
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_term_test?schema=public" \
//   AUTH_SECRET="<el del .env>" RBAC_BASE_URL="http://localhost:3000" \
//   node scripts/integracion-rbac.mjs
//
// Firma cookies JWT como el login real (jsonwebtoken + AUTH_SECRET), sin importar
// código con alias @/ (que node no resuelve).

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error("ABORT: falta AUTH_SECRET (usá el mismo que el dev server).");
  process.exit(2);
}
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3000";
const prisma = await crearClientePrisma({ nivel: ESCRITURA });

let pass = 0, fail = 0;
const S = {};
const PASS_LOGIN = "secret123";

function cookieFor(user) {
  const token = jwt.sign(
    { id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId ?? null, esDeposito: !!user.esDeposito },
    AUTH_SECRET,
    { expiresIn: "8h" }
  );
  return `erpazul_sesion=${token}`;
}

async function req(method, path, { cookie = null, body = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function check(name, promiseOrVal, expectedStatus) {
  try {
    const r = await promiseOrVal;
    const ok = Array.isArray(expectedStatus) ? expectedStatus.includes(r.status) : r.status === expectedStatus;
    if (ok) { console.log(`✔ ${name} → ${r.status}`); pass++; }
    else { console.log(`✖ ${name} → ${r.status} (esperado ${expectedStatus})  ${JSON.stringify(r.json)?.slice(0,90)}`); fail++; }
    return r;
  } catch (e) {
    console.log(`✖ ${name} → EXCEPCIÓN ${e.message}`); fail++;
    return { status: 0 };
  }
}

async function limpiar() {
  await prisma.ventaDetalleComponente.deleteMany({});
  await prisma.ventaDetalle.deleteMany({});
  await prisma.venta.deleteMany({});
  await prisma.posTransferenciaDetalle.deleteMany({}).catch(() => {});
  await prisma.posTransferencia.deleteMany({}).catch(() => {});
  await prisma.stockLocal.deleteMany({});
  await prisma.productoLocal.deleteMany({});
  await prisma.productoBase.deleteMany({});
  await prisma.grupoLocal.deleteMany({});
  await prisma.grupoDeposito.deleteMany({});
  await prisma.configuracionGrupo.deleteMany({});
  await prisma.usuario.deleteMany({});
  await prisma.rol.deleteMany({});
  await prisma.local.deleteMany({});
  await prisma.grupo.deleteMany({});
}

async function seed() {
  await limpiar();
  const hash = await bcrypt.hash(PASS_LOGIN, 8);

  // Roles (globales)
  const rolAdmin = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"] } });
  const permsOp = [
    "productos.ver", "productos.crear", "productos.editar",
    "stock.ver", "stock.editar", "pos.usar",
    "transferencias.ver", "transferencias.crear", "transferencias.recibir", "transferencias.cancelar",
    "pos_transferencias.ver", "pos_transferencias.enviar",
    "pedidos.ver", "pedidos.editar", "pedidos.solicitar",
    "compras.ver", "compras.crear", "clientes.ver", "clientes.crear", "reportes.ver", "proveedores.ver",
  ];
  const rolOp = await prisma.rol.create({ data: { nombre: "Operativo", permisos: permsOp } });
  const rolVacio = await prisma.rol.create({ data: { nombre: "Vacio", permisos: [] } });

  // Grupo A
  const gA = await prisma.grupo.create({ data: { nombre: "GrupoA" } });
  const depoA = await prisma.local.create({ data: { nombre: "DepoA", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: gA.id, localId: depoA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: gA.id, localId: localA.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: gA.id, allowNegativeStock: false } });

  // Grupo B
  const gB = await prisma.grupo.create({ data: { nombre: "GrupoB" } });
  const depoB = await prisma.local.create({ data: { nombre: "DepoB", es_deposito: true } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: gB.id, localId: depoB.id } });
  await prisma.grupoLocal.create({ data: { grupoId: gB.id, localId: localB.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: gB.id, allowNegativeStock: false } });

  // Usuarios
  const userAdmin = await prisma.usuario.create({ data: { nombre: "AdminU", email: "admin@rbac.test", passwordHash: hash, rolId: rolAdmin.id, localId: null } });
  const userA = await prisma.usuario.create({ data: { nombre: "UserA", email: "a@rbac.test", passwordHash: hash, rolId: rolOp.id, localId: localA.id } });
  const userB = await prisma.usuario.create({ data: { nombre: "UserB", email: "b@rbac.test", passwordHash: hash, rolId: rolOp.id, localId: localB.id } });
  const userSin = await prisma.usuario.create({ data: { nombre: "UserSin", email: "sin@rbac.test", passwordHash: hash, rolId: rolVacio.id, localId: localA.id } });

  // Rol con permisos NO-array (para test de fallback de login). Se fuerza por SQL crudo.
  const rolBad = await prisma.rol.create({ data: { nombre: "RolBad", permisos: [] } });
  await prisma.$executeRawUnsafe(`UPDATE "Rol" SET permisos = 'null'::jsonb WHERE id = ${rolBad.id}`);
  const userBad = await prisma.usuario.create({ data: { nombre: "UserBad", email: "bad@rbac.test", passwordHash: hash, rolId: rolBad.id, localId: localA.id } });

  // Productos
  async function prod(grupoId, creadoEnLocalId, localId, nombre) {
    const base = await prisma.productoBase.create({ data: { grupoId, creadoEnLocalId, nombre, unidad_medida: "unidad", precio_costo: 100, precio_venta: 200 } });
    const pl = await prisma.productoLocal.create({ data: { localId, baseId: base.id, precio_costo: 100, precio_venta: 200, activo: true } });
    await prisma.stockLocal.create({ data: { localId, productoId: pl.id, cantidad: 10 } });
    return { baseId: base.id, plId: pl.id };
  }
  const prodA = await prod(gA.id, depoA.id, localA.id, "ProdA");
  const prodB = await prod(gB.id, depoB.id, localB.id, "ProdB");

  // Ventas
  async function venta(localId, vendedorId) {
    return prisma.venta.create({ data: { localId, vendedorId, numero: 1, subtotal: 200, total: 200, costoTotal: 100, gananciaBruta: 100, gananciaNeta: 100, formaPago: "efectivo" } });
  }
  const ventaA = await venta(localA.id, userA.id);
  const ventaB = await venta(localB.id, userB.id);

  // PosTransferencia de grupo A (origen depoA → destino localA)
  let posA = null;
  try {
    posA = await prisma.posTransferencia.create({ data: { origenId: depoA.id, destinoId: localA.id, usuarioId: userA.id, estado: "Borrador" } });
  } catch { /* modelo puede diferir; los tests que lo usan se saltan si es null */ }

  Object.assign(S, {
    gA: gA.id, gB: gB.id, depoA: depoA.id, localA: localA.id, depoB: depoB.id, localB: localB.id,
    rolAdmin: rolAdmin.id, rolOp: rolOp.id,
    userAdmin: { ...userAdmin, permisos: ["*"] },
    userA: { ...userA, permisos: permsOp },
    userB: { ...userB, permisos: permsOp },
    userSin: { ...userSin, permisos: [] },
    prodA, prodB, ventaA: ventaA.id, ventaB: ventaB.id, posA: posA?.id ?? null,
  });
}

async function main() {
  // Verificar que el dev server esté vivo
  try {
    const ping = await fetch(`${BASE}/login`, { method: "GET" });
    if (!ping.ok && ping.status !== 200) throw new Error("status " + ping.status);
  } catch (e) {
    console.error(`ABORT: no hay dev server en ${BASE} (${e.message}). Levantá 'npm run dev' contra la base de test.`);
    process.exit(3);
  }

  await seed();
  const A = cookieFor(S.userA);
  const B = cookieFor(S.userB);
  const SIN = cookieFor(S.userSin);
  const ADM = cookieFor(S.userAdmin);

  console.log("\n=== NEGATIVOS cross-tenant ===");
  await check("1) userA lee venta de B → 404", req("GET", `/api/pos-ventas/venta/${S.ventaB}`, { cookie: A }), 404);
  await check("2a) userA lee producto de B (localId propio) → 404", req("GET", `/api/productos/obtener?id=${S.prodB.baseId}&localId=${S.localA}`, { cookie: A }), 404);
  await check("2b) userA lee producto propio con localId AJENO → 403", req("GET", `/api/productos/obtener?id=${S.prodA.baseId}&localId=${S.localB}`, { cookie: A }), 403);
  await check("3a) userA edita producto de B → 403", req("PUT", `/api/productos/editar/${S.prodB.baseId}?localId=${S.localA}`, { cookie: A, body: { nombre: "x" } }), 403);
  await check("3b) userA edita producto propio con localId AJENO → 403", req("PUT", `/api/productos/editar/${S.prodA.baseId}?localId=${S.localB}`, { cookie: A, body: { nombre: "x" } }), 403);
  await check("4) userB agrega ítem a transferencia de A → 403/404", req("POST", `/api/pos-transferencias/agregarItem`, { cookie: B, body: { posId: S.posA, productoLocalId: S.prodA.plId, cantidad: 1 } }), [403, 404]);
  await check("5) userA reasigna grupo → 403", req("POST", `/api/grupos/${S.localB}/asignar-grupo`, { cookie: A, body: { grupoId: S.gA } }), 403);
  await check("6a) userA edita local (requireAdmin) → 403", req("PUT", `/api/locales/${S.localB}`, { cookie: A, body: { nombre: "x" } }), 403);
  await check("6b) userA elimina local → 403", req("DELETE", `/api/locales/${S.localB}`, { cookie: A }), 403);
  await check("7) userSin exporta clientes → 403", req("GET", `/api/clientes/export/excel`, { cookie: SIN }), 403);
  await check("8) userA precios/apply con localId AJENO → 403", req("POST", `/api/productos/precios/apply`, { cookie: A, body: { localId: S.localB, metodo: "MARGEN_MASIVO", pricingMode: "RECALC_BY_MARGIN", items: [{ baseId: S.prodA.baseId }] } }), 403);
  await check("9) userA abre turno con localId AJENO → 403", req("POST", `/api/pos-ventas/turnos/abrir`, { cookie: A, body: { localId: S.localB, montoInicial: 0 } }), 403);
  await check("10a) userA crea proveedor → 403", req("POST", `/api/proveedores/crear`, { cookie: A, body: { nombre: "P" } }), 403);
  await check("10b) userA crea categoría → 403", req("POST", `/api/categorias/crear`, { cookie: A, body: { nombre: "C" } }), 403);
  await check("10c) userA crea área física → 403", req("POST", `/api/areas-fisicas/crear`, { cookie: A, body: { nombre: "AF" } }), 403);

  console.log("\n=== SESIÓN / PERMISO ===");
  await check("sin cookie: venta/[id] → 401", req("GET", `/api/pos-ventas/venta/${S.ventaA}`), 401);
  await check("sin cookie: asignar-grupo → 401", req("POST", `/api/grupos/${S.localA}/asignar-grupo`, { body: { grupoId: S.gA } }), 401);
  await check("userSin (sin productos.ver): obtener → 403", req("GET", `/api/productos/obtener?id=${S.prodA.baseId}&localId=${S.localA}`, { cookie: SIN }), 403);

  console.log("\n=== GUARD DEL ROL ADMIN ===");
  await check("admin crea rol con '*' → 400", req("POST", `/api/roles/crear`, { cookie: ADM, body: { nombre: "Nuevo", permisos: ["*"] } }), 400);
  await check("admin agrega '*' a rol común → 400", req("PUT", `/api/roles/editar/${S.rolOp}`, { cookie: ADM, body: { permisos: ["pos.usar", "*"] } }), 400);
  await check("admin retira '*' del Admin → 400", req("PUT", `/api/roles/editar/${S.rolAdmin}`, { cookie: ADM, body: { permisos: ["pos.usar"] } }), 400);
  await check("admin elimina rol Admin → 400", req("DELETE", `/api/roles/eliminar/${S.rolAdmin}`, { cookie: ADM }), 400);
  await check("no-admin (userA) crea rol → 403", req("POST", `/api/roles/crear`, { cookie: A, body: { nombre: "X", permisos: [] } }), 403);

  console.log("\n=== LOGIN: fallback de permisos ===");
  const lBad = await check("login permisos no-array → 200", req("POST", `/api/login`, { body: { email: "bad@rbac.test", password: PASS_LOGIN } }), 200);
  if (Array.isArray(lBad.json?.user?.permisos) && lBad.json.user.permisos.length === 0) { console.log("  ✔ permisos = [] (no '*')"); pass++; }
  else { console.log(`  ✖ permisos esperado [] y fue ${JSON.stringify(lBad.json?.user?.permisos)}`); fail++; }
  const lA = await check("login array válido → 200", req("POST", `/api/login`, { body: { email: "a@rbac.test", password: PASS_LOGIN } }), 200);
  if (Array.isArray(lA.json?.user?.permisos) && lA.json.user.permisos.includes("pos.usar")) { console.log("  ✔ conserva el array"); pass++; }
  else { console.log("  ✖ no conservó el array"); fail++; }
  const lAdm = await check("login Admin → 200", req("POST", `/api/login`, { body: { email: "admin@rbac.test", password: PASS_LOGIN } }), 200);
  if (Array.isArray(lAdm.json?.user?.permisos) && lAdm.json.user.permisos.includes("*")) { console.log("  ✔ Admin conserva ['*']"); pass++; }
  else { console.log("  ✖ Admin no conservó ['*']"); fail++; }

  console.log("\n=== REGRESIONES (deben PASAR con contexto válido) ===");
  await check("admin lee venta de A → 200", req("GET", `/api/pos-ventas/venta/${S.ventaA}`, { cookie: ADM }), 200);
  await check("userA lee su venta → 200", req("GET", `/api/pos-ventas/venta/${S.ventaA}`, { cookie: A }), 200);
  await check("userA lee su producto → 200", req("GET", `/api/productos/obtener?id=${S.prodA.baseId}&localId=${S.localA}`, { cookie: A }), 200);
  await check("userA abre turno en SU local → NO 401/403 (scope OK)", req("POST", `/api/pos-ventas/turnos/abrir`, { cookie: A, body: { localId: S.localA, montoInicial: 0 } }), [200, 400, 428]);
  await check("admin crea categoría → 200/201", req("POST", `/api/categorias/crear`, { cookie: ADM, body: { nombre: "CatOK" } }), [200, 201]);
  await check("admin crea proveedor → 200/201", req("POST", `/api/proveedores/crear`, { cookie: ADM, body: { nombre: "ProvOK" } }), [200, 201]);

  console.log(`\nRESULTADO RBAC: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(3); });
