// Harness de integración: AISLAMIENTO POR UBICACIÓN (local/depósito/admin).
// Verifica que compras, transferencias, notificaciones y reportes no filtren
// datos entre ubicaciones. Contra el dev server real + DB de test.
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_term_test?schema=public" \
//   AUTH_SECRET="<.env>" RBAC_BASE_URL="http://localhost:3011" \
//   node scripts/integracion-aislamiento.mjs

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { DEFAULT_PERMISOS_SISTEMA, DUENO_LOCAL } from "../lib/rbac/systemRoles.js";

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) { console.error("ABORT: falta AUTH_SECRET."); process.exit(2); }
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = await crearClientePrisma({ nivel: ESCRITURA });

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
  else { console.log(`✖ ${name} → ${res.status} (esp ${expectedStatus}) ${JSON.stringify(res.json)?.slice(0, 120)}`); fail++; }
  return res;
}
function assertOk(name, cond) { if (cond) { console.log(`✔ ${name}`); pass++; } else { console.log(`✖ ${name}`); fail++; } }

async function seed() {
  // TRUNCATE lo hace el runner externo; acá creamos el escenario.
  const hash = await bcrypt.hash("secret123", 8);
  const rolAdmin = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"], esSistema: true } });
  const rolDueno = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });

  const g = await prisma.grupo.create({ data: { nombre: "G-Aisl" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: localB.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: g.id, allowNegativeStock: false } });

  const mk = (nombre, email, rolId, localId) => prisma.usuario.create({ data: { nombre, email, passwordHash: hash, rolId, localId } });
  const admin = await mk("Admin", "adm@ais.test", rolAdmin.id, null);
  const duenoDepo = await mk("DuenoDepo", "dd@ais.test", rolDueno.id, depo.id);
  const duenoA = await mk("DuenoA", "da@ais.test", rolDueno.id, localA.id);
  const duenoA2 = await mk("DuenoA2", "da2@ais.test", rolDueno.id, localA.id); // 2do usuario del MISMO local
  const duenoB = await mk("DuenoB", "db@ais.test", rolDueno.id, localB.id);

  const prov = await prisma.proveedor.create({ data: { nombre: "Prov1", creadoEnLocalId: depo.id } });
  // Pedidos por ubicación.
  const pedidoDepo = await prisma.pedidoProveedor.create({ data: { grupoId: g.id, depositoId: depo.id, creadoEnLocalId: depo.id, proveedorId: prov.id, creadoPorId: duenoDepo.id } });
  const pedidoA = await prisma.pedidoProveedor.create({ data: { grupoId: g.id, depositoId: depo.id, creadoEnLocalId: localA.id, proveedorId: prov.id, creadoPorId: duenoA.id } });

  // --- Escenario de STOCK: producto con PL en depósito y en localA ---
  const base = await prisma.productoBase.create({ data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "ProdStock", unidad_medida: "unidad", factor_pack: 1, precio_costo: 10, precio_venta: 20 } });
  const plDepo = await prisma.productoLocal.create({ data: { localId: depo.id, baseId: base.id, precio_costo: 10, precio_venta: 20, activo: true } });
  const plLocalA = await prisma.productoLocal.create({ data: { localId: localA.id, baseId: base.id, precio_costo: 10, precio_venta: 20, activo: true } });
  await prisma.stockLocal.create({ data: { localId: depo.id, productoId: plDepo.id, cantidad: 0 } });
  await prisma.stockLocal.create({ data: { localId: localA.id, productoId: plLocalA.id, cantidad: 0 } });
  // Pedidos ENVIADOS listos para recibir (detalles referencian el PL del depósito = catálogo).
  const pedidoStockA = await prisma.pedidoProveedor.create({ data: { grupoId: g.id, depositoId: depo.id, creadoEnLocalId: localA.id, proveedorId: prov.id, creadoPorId: duenoA.id, estado: "ENVIADO", detalles: { create: [{ productoLocalId: plDepo.id, cantidad: 5, unidad: "BULTO", precioCosto: 10 }] } } });
  const pedidoStockDepo = await prisma.pedidoProveedor.create({ data: { grupoId: g.id, depositoId: depo.id, creadoEnLocalId: depo.id, proveedorId: prov.id, creadoPorId: duenoDepo.id, estado: "ENVIADO", detalles: { create: [{ productoLocalId: plDepo.id, cantidad: 3, unidad: "BULTO", precioCosto: 10 }] } } });

  // Transferencia depo → localA.
  const transf = await prisma.transferencia.create({ data: { origenId: depo.id, destinoId: localA.id, estado: "PENDIENTE" } });

  // Ventas para reportes (localA y localB).
  await prisma.venta.create({ data: { localId: localA.id, vendedorId: duenoA.id, numero: 1, subtotal: 100, total: 100, costoTotal: 50, gananciaBruta: 50, gananciaNeta: 50, formaPago: "efectivo" } });
  await prisma.venta.create({ data: { localId: localB.id, vendedorId: duenoB.id, numero: 2, subtotal: 200, total: 200, costoTotal: 100, gananciaBruta: 100, gananciaNeta: 100, formaPago: "efectivo" } });

  // Notificaciones por ubicación.
  const notifDepo = await prisma.notificacion.create({ data: { grupoId: g.id, tipo: "PEDIDO_PROVEEDOR_ENVIADO", titulo: "Pedido depo", alcance: "DEPOSITO", localId: depo.id, permisoRequerido: "compras.ver" } });
  const notifA = await prisma.notificacion.create({ data: { grupoId: g.id, tipo: "X", titulo: "Notif A", alcance: "LOCAL", localId: localA.id } });
  const notifShared = await prisma.notificacion.create({ data: { grupoId: g.id, tipo: "Y", titulo: "Compartida A", alcance: "LOCAL", localId: localA.id } });

  Object.assign(S, {
    g: g.id, depo: depo.id, localA: localA.id, localB: localB.id,
    admin: { ...admin, permisos: ["*"] },
    duenoDepo: { ...duenoDepo, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true, esDeposito: true },
    duenoA: { ...duenoA, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    duenoA2: { ...duenoA2, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    duenoB: { ...duenoB, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esDuenoLocal: true },
    pedidoDepo: pedidoDepo.id, pedidoA: pedidoA.id, transf: transf.id,
    notifA: notifA.id, notifDepo: notifDepo.id, notifShared: notifShared.id,
    base: base.id, plDepo: plDepo.id, plLocalA: plLocalA.id,
    pedidoStockA: pedidoStockA.id, pedidoStockDepo: pedidoStockDepo.id,
  });
}

async function main() {
  try { const p = await fetch(`${BASE}/login`, { method: "GET" }); if (!p.ok && p.status !== 200) throw new Error("status " + p.status); }
  catch (e) { console.error(`ABORT: no hay dev server en ${BASE} (${e.message}).`); process.exit(3); }

  await seed();
  const DEPO = cookieFor(S.duenoDepo);
  const A = cookieFor(S.duenoA);
  const B = cookieFor(S.duenoB);
  const ADM_A = cookieFor(S.admin, { contextoLocalId: S.localA, grupoActivo: S.g });
  const ADM_DEPO = cookieFor(S.admin, { contextoLocalId: S.depo, contextoEsDeposito: true, grupoActivo: S.g });
  const ADM_NOCTX = cookieFor(S.admin, { grupoActivo: S.g });

  console.log("\n=== COMPRAS: aislamiento por ubicación ===");
  await check("1. Local A lista compras: ve la suya, NO la del depósito ni la de B", req("GET", `/api/compras-proveedor/listar`, { cookie: A }), 200,
    (r) => { const ids = (r.json?.items || []).map((i) => i.id); return ids.includes(S.pedidoA) && !ids.includes(S.pedidoDepo); });
  await check("2. Depósito lista compras: ve la suya, NO la de Local A", req("GET", `/api/compras-proveedor/listar`, { cookie: DEPO }), 200,
    (r) => { const ids = (r.json?.items || []).map((i) => i.id); return ids.includes(S.pedidoDepo) && !ids.includes(S.pedidoA); });
  await check("3. Local A abre detalle de compra del depósito (href ajeno) → 404", req("GET", `/api/compras-proveedor/obtener?id=${S.pedidoDepo}`, { cookie: A }), 404);
  await check("4. Local B abre detalle de compra de Local A → 404", req("GET", `/api/compras-proveedor/obtener?id=${S.pedidoA}`, { cookie: B }), 404);
  await check("5. Local A exporta PDF de compra ajena → 404 (mismo scope que listado)", req("GET", `/api/compras-proveedor/exportar-pdf/${S.pedidoDepo}`, { cookie: A }), 404);
  await check("6. Local A exporta PDF de su propia compra → 200", req("GET", `/api/compras-proveedor/exportar-pdf/${S.pedidoA}`, { cookie: A }), 200);
  await check("7. Local B intenta CONFIRMAR compra de Local A (escritura ajena) → 403/404", req("POST", `/api/compras-proveedor/confirmar/${S.pedidoA}`, { cookie: B }), [403, 404]);

  console.log("\n=== NOTIFICACIONES: aislamiento por ubicación ===");
  await check("8. Notif del depósito NO aparece en Local A", req("GET", `/api/notificaciones/listar?filtro=todas`, { cookie: A }), 200,
    (r) => !(r.json?.items || []).some((n) => n.id === S.notifDepo));
  await check("9. Notif de Local A NO aparece en Local B", req("GET", `/api/notificaciones/listar?filtro=todas`, { cookie: B }), 200,
    (r) => !(r.json?.items || []).some((n) => n.id === S.notifA));
  await check("10. Local A SÍ ve su propia notif", req("GET", `/api/notificaciones/listar?filtro=todas`, { cookie: A }), 200,
    (r) => (r.json?.items || []).some((n) => n.id === S.notifA));
  await check("11. Local B marca notif ajena (de A) como leída → 404 (no modifica)", req("POST", `/api/notificaciones/marcar-leida/${S.notifA}`, { cookie: B }), 404);
  await check("12. Depósito ve su notif de compras (tiene compras.ver)", req("GET", `/api/notificaciones/listar?filtro=todas`, { cookie: DEPO }), 200,
    (r) => (r.json?.items || []).some((n) => n.id === S.notifDepo));

  console.log("\n=== TRANSFERENCIAS: participación ===");
  await check("13. Local A ve la transferencia donde participa (destino)", req("GET", `/api/transferencias/listar`, { cookie: A }), 200,
    (r) => (r.json?.items || []).some((t) => t.id === S.transf));
  await check("14. Local B NO ve la transferencia donde no participa", req("GET", `/api/transferencias/listar`, { cookie: B }), 200,
    (r) => !(r.json?.items || []).some((t) => t.id === S.transf));
  await check("15. Local B abre detalle de transferencia ajena → 404", req("GET", `/api/transferencias/detalle?id=${S.transf}`, { cookie: B }), 404);

  console.log("\n=== ADMIN: contexto acota, sin vista global implícita ===");
  await check("16. Admin en contexto Local A → reportes solo de Local A", req("GET", `/api/reportes-ventas/listado?fechaDesde=2020-01-01&fechaHasta=2030-12-31`, { cookie: ADM_A }), 200,
    (r) => (r.json?.ventas || []).every((v) => v.local?.id === S.localA) && (r.json?.ventas || []).length > 0);
  await check("17. Admin en contexto Depósito → NO ve ventas de los locales", req("GET", `/api/reportes-ventas/listado?fechaDesde=2020-01-01&fechaHasta=2030-12-31`, { cookie: ADM_DEPO }), 200,
    (r) => (r.json?.ventas || []).every((v) => v.local?.id === S.depo));
  await check("18. Admin SIN contexto NO ve todo → 409 (vista global no implícita)", req("GET", `/api/reportes-ventas/listado?fechaDesde=2020-01-01&fechaHasta=2030-12-31`, { cookie: ADM_NOCTX }), 409);
  await check("19. Admin en vista GLOBAL explícita → ve todo el grupo (A y B)", req("GET", `/api/reportes-ventas/listado?fechaDesde=2020-01-01&fechaHasta=2030-12-31`, { cookie: cookieFor(S.admin, { grupoActivo: S.g, global: true }) }), 200,
    (r) => { const locs = new Set((r.json?.ventas || []).map((v) => v.local?.id)); return locs.has(S.localA) && locs.has(S.localB); });

  console.log("\n=== FUGA CROSS-GRUPO (historial de precios) ===");
  await check("20. Local A NO puede leer historial de precios pasando ?localId ajeno → 403", req("GET", `/api/productos/precios/history?localId=${S.depo === S.localA ? 99999 : 99999}`, { cookie: A }), [403, 200],
    (r) => r.status === 403 || (r.json?.items || []).length === 0);

  console.log("\n=== NOTIFICACIONES: estado de lectura POR USUARIO (2 usuarios mismo local) ===");
  const A2 = cookieFor(S.duenoA2);
  await check("21. A ve la notif compartida como NO leída", req("GET", `/api/notificaciones/listar?filtro=noleidas`, { cookie: A }), 200,
    (r) => (r.json?.items || []).some((n) => n.id === S.notifShared));
  await check("22. A la marca leída → 200", req("POST", `/api/notificaciones/marcar-leida/${S.notifShared}`, { cookie: A }), 200);
  await check("23. A ya NO la ve en no-leídas", req("GET", `/api/notificaciones/listar?filtro=noleidas`, { cookie: A }), 200,
    (r) => !(r.json?.items || []).some((n) => n.id === S.notifShared));
  await check("24. A2 (mismo local) SIGUE viéndola como NO leída", req("GET", `/api/notificaciones/listar?filtro=noleidas`, { cookie: A2 }), 200,
    (r) => (r.json?.items || []).some((n) => n.id === S.notifShared));
  await check("25. A2 la cuenta en su badge de no-leídas (>0)", req("GET", `/api/notificaciones/contar`, { cookie: A2 }), 200, (r) => (r.json?.count || 0) >= 1);
  await check("26. A la vuelve a marcar NO leída → reaparece para A", req("POST", `/api/notificaciones/marcar-no-leida/${S.notifShared}`, { cookie: A }), 200);
  await check("27. A la ve de nuevo en no-leídas", req("GET", `/api/notificaciones/listar?filtro=noleidas`, { cookie: A }), 200,
    (r) => (r.json?.items || []).some((n) => n.id === S.notifShared));
  await check("28. B marca la notif compartida (de A, ajena) → 404", req("POST", `/api/notificaciones/marcar-leida/${S.notifShared}`, { cookie: B }), 404);

  console.log("\n=== COMPRAS: destino de stock por ubicación ===");
  const stockDe = async (localId, plId) => {
    const row = await prisma.stockLocal.findUnique({ where: { localId_productoId: { localId, productoId: plId } } });
    return row ? Number(row.cantidad) : null;
  };
  await check("29. Local A recibe su compra → 200", req("POST", `/api/compras-proveedor/recibir/${S.pedidoStockA}`, { cookie: A, body: {} }), 200);
  assertOk("30. Stock de Local A subió a 5", (await stockDe(S.localA, S.plLocalA)) === 5);
  assertOk("31. Stock del DEPÓSITO NO cambió (sigue 0)", (await stockDe(S.depo, S.plDepo)) === 0);
  assertOk("32. Local B no tiene stock de ese producto (sin PL)", (await prisma.productoLocal.findFirst({ where: { localId: S.localB, baseId: S.base } })) === null);
  await check("33. Depósito recibe su compra → 200", req("POST", `/api/compras-proveedor/recibir/${S.pedidoStockDepo}`, { cookie: DEPO, body: {} }), 200);
  assertOk("34. Stock del depósito subió a 3", (await stockDe(S.depo, S.plDepo)) === 3);
  assertOk("35. Stock de Local A quedó intacto en 5", (await stockDe(S.localA, S.plLocalA)) === 5);
  await check("36. Local B intenta recibir compra de Local A → 403/404", req("POST", `/api/compras-proveedor/recibir/${S.pedidoStockA}`, { cookie: B, body: {} }), [403, 404]);

  console.log(`\nRESULTADO AISLAMIENTO: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error("ERROR harness:", e); await prisma.$disconnect(); process.exit(1); });
