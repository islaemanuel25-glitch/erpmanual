// Harness de integración: CORRECCIÓN SIMPLE de ventas (Fase A).
// Verifica contrato + validaciones del endpoint corregir-simple, el enriquecimiento
// del detalle (flags de corrección) y el historial (fuente VentaCorreccion).
//
// Reglas cubiertas:
//   · Aplica cliente/observaciones/referencia; incrementa version; corregida=true.
//   · Deja fila en VentaCorreccion (fuente) + fila COMPACTA en AuditoriaBitacora.
//   · Motivo obligatorio; version obligatoria; bloqueo optimista (version stale → 409).
//   · Rechaza campos fuera del contrato (total/productos/pagos) → 400.
//   · Venta FIADA: cambiar cliente → 409 requiere_correccion_completa; observaciones OK.
//   · Sin permiso → 403; venta ajena (no-admin) → 404; fuera de ventana 30d → 409.
//   · Detalle: puedeCorregirSimple=true dentro de ventana; puedeCorregirCompleta=false.
// Uso: DATABASE_URL=<test> AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/integracion-correccion-simple.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) { console.error("ABORT: no test DB"); process.exit(2); }
const AUTH_SECRET = process.env.AUTH_SECRET;
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
let pass = 0, fail = 0;
const S = {};
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

async function post(path, ck, body) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { Cookie: ck, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
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
  const t = jwt.sign({ id: u.id, rolId: u.rolId, permisos: u.permisos, localId: u.localId, esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  return `erpazul_sesion=${t}`;
}

async function crearVenta({ localId, numero, fecha, clienteId = null, fiado = false }) {
  const venta = await prisma.venta.create({
    data: {
      localId, vendedorId: S.admin.id, numero, fecha, clienteId,
      subtotal: 1000, total: 1000, formaPago: fiado ? "fiado" : "efectivo", esFiado: fiado,
    },
  });
  await prisma.ventaPago.create({ data: { ventaId: venta.id, medio: fiado ? "FIADO" : "EFECTIVO", monto: 1000, neto: 1000 } });
  return venta;
}

async function seed() {
  const rolAdmin = await prisma.rol.create({ data: { nombre: "AdminTest", permisos: ["*"], esSistema: false } });
  const rolCorrige = await prisma.rol.create({ data: { nombre: "Corrige", permisos: ["pos.usar", "reportes.ver", "ventas.corregir_simple"], esSistema: false } });
  const rolSinCorr = await prisma.rol.create({ data: { nombre: "SinCorr", permisos: ["pos.usar", "reportes.ver"], esSistema: false } });
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const local = await prisma.local.create({ data: { nombre: "L", es_deposito: false } });
  const otro = await prisma.local.create({ data: { nombre: "Otro", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: otro.id } });
  const admin = await prisma.usuario.create({ data: { nombre: "Adm", email: "adm@t.test", passwordHash: "x", rolId: rolAdmin.id } });
  const uCorrige = await prisma.usuario.create({ data: { nombre: "UC", email: "uc@t.test", passwordHash: "x", rolId: rolCorrige.id, localId: local.id } });
  const uSinCorr = await prisma.usuario.create({ data: { nombre: "US", email: "us@t.test", passwordHash: "x", rolId: rolSinCorr.id, localId: local.id } });
  const cli1 = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Cliente Uno" } });
  const cli2 = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Cliente Dos" } });

  Object.assign(S, {
    g: g.id, local: local.id, otro: otro.id, cli1: cli1.id, cli2: cli2.id,
    admin: { id: admin.id, rolId: rolAdmin.id },
    uCorrige: { id: uCorrige.id, rolId: rolCorrige.id, localId: local.id, permisos: ["pos.usar", "reportes.ver", "ventas.corregir_simple"] },
    uSinCorr: { id: uSinCorr.id, rolId: rolSinCorr.id, localId: local.id, permisos: ["pos.usar", "reportes.ver"] },
  });

  const hoy = new Date();
  const hace40 = new Date(hoy.getTime() - 40 * 86400000);
  S.vCobrada = (await crearVenta({ localId: local.id, numero: 1, fecha: hoy, clienteId: cli1.id })).id;
  S.vFiada = (await crearVenta({ localId: local.id, numero: 2, fecha: hoy, clienteId: cli1.id, fiado: true })).id;
  S.vVieja = (await crearVenta({ localId: local.id, numero: 3, fecha: hace40, clienteId: cli1.id })).id;
  S.vAjena = (await crearVenta({ localId: otro.id, numero: 4, fecha: hoy })).id;
  S.vConflicto = (await crearVenta({ localId: local.id, numero: 5, fecha: hoy })).id;
}

async function run() {
  await truncate(); await seed();
  const ckA = cookieAdmin(S.local);

  // 1) Detalle expone flags de corrección
  const det = await get(`/api/reportes-ventas/detalle/${S.vCobrada}`, ckA);
  const cc = det.j?.venta?.correccion;
  ok("detalle expone correccion.version=0", cc?.version === 0, JSON.stringify(cc));
  ok("detalle puedeCorregirSimple=true (dentro de ventana)", cc?.puedeCorregirSimple === true);
  ok("detalle puedeCorregirCompleta=false (Fase B)", cc?.puedeCorregirCompleta === false);

  // 2) Corrección simple OK (cliente + observaciones + referencia)
  const r2 = await post(`/api/pos-ventas/corregir-simple/${S.vCobrada}`, ckA, {
    motivo: "Cliente equivocado", version: 0, clienteId: S.cli2, observaciones: "Revisado", referenciaInterna: "R-100",
  });
  ok("corregir-simple OK → 200", r2.status === 200, JSON.stringify(r2.j));
  ok("respuesta version=1 + corregida", r2.j?.version === 1 && r2.j?.corregida === true);
  const vDb = await prisma.venta.findUnique({ where: { id: S.vCobrada }, select: { clienteId: true, observaciones: true, referenciaInterna: true, version: true, corregida: true, ultimaCorreccionId: true } });
  ok("venta actualizada (cliente/obs/ref/version/corregida)", vDb.clienteId === S.cli2 && vDb.observaciones === "Revisado" && vDb.referenciaInterna === "R-100" && vDb.version === 1 && vDb.corregida === true);
  ok("ultimaCorreccionId seteado", !!vDb.ultimaCorreccionId);
  const nCorr = await prisma.ventaCorreccion.count({ where: { ventaId: S.vCobrada, tipo: "SIMPLE" } });
  ok("VentaCorreccion (fuente) creada", nCorr === 1, `n=${nCorr}`);
  const nBit = await prisma.auditoriaBitacora.count({ where: { entidadId: String(S.vCobrada), accion: "venta.corregir_simple" } });
  ok("Bitácora central compacta creada (1 fila)", nBit === 1, `n=${nBit}`);

  // 3) Historial lo lista desde VentaCorreccion
  const h = await get(`/api/pos-ventas/correcciones/${S.vCobrada}`, ckA);
  ok("historial: 1 item tipo SIMPLE", (h.j?.items || []).length === 1 && h.j.items[0].tipo === "SIMPLE", JSON.stringify(h.j?.items));
  ok("historial: diferencia 0 (simple no toca dinero)", Number(h.j?.items?.[0]?.diferencia) === 0);

  // 4) Motivo obligatorio
  const r4 = await post(`/api/pos-ventas/corregir-simple/${S.vCobrada}`, ckA, { version: 1, observaciones: "x" });
  ok("motivo faltante → 400 motivo_requerido", r4.status === 400 && r4.j?.code === "motivo_requerido", JSON.stringify(r4.j));

  // 5) Bloqueo optimista: version stale → 409
  const r5 = await post(`/api/pos-ventas/corregir-simple/${S.vCobrada}`, ckA, { motivo: "x", version: 0, observaciones: "otra" });
  ok("version stale → 409 conflicto_version", r5.status === 409 && r5.j?.code === "conflicto_version", JSON.stringify(r5.j));

  // 6) Campo fuera de contrato → 400
  const r6 = await post(`/api/pos-ventas/corregir-simple/${S.vConflicto}`, ckA, { motivo: "x", version: 0, total: 5 });
  ok("campo no permitido (total) → 400 campos_no_permitidos", r6.status === 400 && r6.j?.code === "campos_no_permitidos", JSON.stringify(r6.j));

  // 7) FIADA: cambiar cliente → 409 requiere_correccion_completa
  const r7 = await post(`/api/pos-ventas/corregir-simple/${S.vFiada}`, ckA, { motivo: "x", version: 0, clienteId: S.cli2 });
  ok("fiada + cambio cliente → 409 requiere_correccion_completa", r7.status === 409 && r7.j?.code === "requiere_correccion_completa", JSON.stringify(r7.j));

  // 8) FIADA: solo observaciones → OK
  const r8 = await post(`/api/pos-ventas/corregir-simple/${S.vFiada}`, ckA, { motivo: "Nota", version: 0, observaciones: "Pago prometido" });
  ok("fiada + solo observaciones → 200", r8.status === 200, JSON.stringify(r8.j));

  // 9) Fuera de ventana (40 días) → 409 fuera_de_ventana
  const r9 = await post(`/api/pos-ventas/corregir-simple/${S.vVieja}`, ckA, { motivo: "x", version: 0, observaciones: "y" });
  ok("fuera de ventana 30d → 409 fuera_de_ventana", r9.status === 409 && r9.j?.code === "fuera_de_ventana", JSON.stringify(r9.j));

  // 10) Sin permiso (no-admin sin ventas.corregir_simple) → 403
  const r10 = await post(`/api/pos-ventas/corregir-simple/${S.vConflicto}`, cookieUser(S.uSinCorr), { motivo: "x", version: 0, observaciones: "z" });
  ok("sin permiso → 403", r10.status === 403, JSON.stringify(r10.j));

  // 11) Venta ajena (no-admin de otro local) → 404
  const r11 = await post(`/api/pos-ventas/corregir-simple/${S.vAjena}`, cookieUser(S.uCorrige), { motivo: "x", version: 0, observaciones: "z" });
  ok("venta ajena (no-admin) → 404", r11.status === 404, JSON.stringify(r11.j));

  // 12) No-admin CON permiso corrige la suya → 200
  const r12 = await post(`/api/pos-ventas/corregir-simple/${S.vConflicto}`, cookieUser(S.uCorrige), { motivo: "Ok", version: 0, observaciones: "hecho" });
  ok("no-admin con permiso corrige la suya → 200", r12.status === 200, JSON.stringify(r12.j));

  console.log(`\nRESULTADO CORRECCIÓN-SIMPLE: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

run().catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(1); });
