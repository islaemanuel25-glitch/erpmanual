// Harness de integración: PAGOS MÚLTIPLES (pago dividido) end-to-end.
// crear con pagos[] → tenders persistidos + agregación de cierre por tender.
// Uso: DATABASE_URL=<test> AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/integracion-pagos-multiples.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { DEFAULT_PERMISOS_SISTEMA, DUENO_LOCAL } from "../lib/rbac/systemRoles.js";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) { console.error("ABORT: no test DB"); process.exit(2); }
const AUTH_SECRET = process.env.AUTH_SECRET;
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
let pass = 0, fail = 0;
const S = {};
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

function cookie(user) {
  const t = jwt.sign({ id: user.id, rolId: user.rolId, permisos: user.permisos, localId: user.localId, esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  return `erpazul_sesion=${t}`;
}
async function post(path, body, ck) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: ck }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
async function get(path, ck) {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: ck } });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
async function truncate() { const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`); const n = rows.map(r => `"${r.tablename}"`).join(", "); if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`); }

async function seed() {
  const hash = await bcrypt.hash("x", 8);
  const rol = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const local = await prisma.local.create({ data: { nombre: "L", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: g.id, comisionDebito: 7, comisionCredito: 7, comisionMercadopago: 7, allowNegativeStock: true } });
  const u = await prisma.usuario.create({ data: { nombre: "D", email: "d@t.test", passwordHash: hash, rolId: rol.id, localId: local.id } });
  const turno = await prisma.turno.create({ data: { localId: local.id, vendedorId: u.id, montoInicial: 0 } });
  const cli = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Cli" } });
  const base = await prisma.productoBase.create({ data: { grupoId: g.id, creadoEnLocalId: local.id, nombre: "P", unidad_medida: "unidad", factor_pack: 1, precio_costo: 0, precio_venta: 17500 } });
  const pl = await prisma.productoLocal.create({ data: { localId: local.id, baseId: base.id, precio_costo: 0, precio_venta: 17500, activo: true } });
  await prisma.stockLocal.create({ data: { localId: local.id, productoId: pl.id, cantidad: 100 } });
  Object.assign(S, { g: g.id, local: local.id, turno: turno.id, cli: cli.id, base: base.id,
    user: { id: u.id, rolId: rol.id, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], localId: local.id } });
}

function venta(pagos, extra = {}) {
  return { clientTxnId: `t-${Math.random().toString(36).slice(2)}`, localId: S.local, turnoId: S.turno,
    formaPago: "efectivo", pagos, items: [{ productoBaseId: S.base, nombre: "P", precio: 17500, cantidad: 1, precioCosto: 0 }], ...extra };
}

async function run() {
  await truncate(); await seed();
  const ck = cookie(S.user);

  // 1) Venta mixta: efectivo 5500 + débito 12000 (total 17500)
  const r1 = await post("/api/pos-ventas/crear", venta([{ medio: "efectivo", monto: 5500 }, { medio: "debito", monto: 12000 }]), ck);
  ok("mixta → 200", r1.status === 200, JSON.stringify(r1.j).slice(0, 120));
  const v1 = await prisma.venta.findUnique({ where: { id: r1.j.ventaId }, include: { pagos: true } });
  ok("2 tenders persistidos", v1?.pagos.length === 2);
  ok("formaPago='mixto'", v1?.formaPago === "mixto");
  const efe = v1.pagos.find(p => p.medio === "EFECTIVO"), deb = v1.pagos.find(p => p.medio === "DEBITO");
  ok("efectivo 5500 sin comisión", Number(efe?.monto) === 5500 && Number(efe?.comision) === 0);
  ok("débito 12000 comisión 840 (7%)", Number(deb?.monto) === 12000 && Number(deb?.comision) === 840);
  ok("comisionBancaria venta = 840", Number(v1.comisionBancaria) === 840);
  ok("netoRecibido = 16660", Number(v1.netoRecibido) === 16660);
  ok("esFiado=false", v1.esFiado === false);

  // 2) Agregación de cierre por tender
  const res = await get(`/api/pos-ventas/turnos/resumen?turnoId=${S.turno}`, ck);
  ok("resumen totalEfectivo=5500", res.j?.totalEfectivo === 5500, JSON.stringify(res.j));
  ok("resumen totalDigital=12000", res.j?.totalDigital === 12000);
  ok("resumen totalComision=840", res.j?.totalComision === 840);
  ok("resumen desglose.debito=12000", res.j?.desglose?.debito === 12000);

  // 3) Suma != total → 400
  const r3 = await post("/api/pos-ventas/crear", venta([{ medio: "efectivo", monto: 5000 }, { medio: "debito", monto: 12000 }]), ck);
  ok("suma!=total → 400", r3.status === 400 && /suma/i.test(r3.j?.error || ""));

  // 4) Fiado + efectivo → 400
  const r4 = await post("/api/pos-ventas/crear", venta([{ medio: "fiado", monto: 5000 }, { medio: "efectivo", monto: 12500 }], { clienteId: S.cli }), ck);
  ok("fiado+efectivo → 400", r4.status === 400 && /FIADO.*único/i.test(r4.j?.error || ""));

  // 5) Legacy: sin pagos, formaPago → 1 tender
  const r5 = await post("/api/pos-ventas/crear", { clientTxnId: `t-${Math.random().toString(36).slice(2)}`, localId: S.local, turnoId: S.turno, formaPago: "efectivo", items: [{ productoBaseId: S.base, nombre: "P", precio: 17500, cantidad: 1, precioCosto: 0 }] }, ck);
  ok("legacy formaPago → 200", r5.status === 200);
  const v5 = await prisma.venta.findUnique({ where: { id: r5.j.ventaId }, include: { pagos: true } });
  ok("legacy → 1 tender EFECTIVO por el total", v5?.pagos.length === 1 && v5.pagos[0].medio === "EFECTIVO" && Number(v5.pagos[0].monto) === 17500);
  ok("legacy formaPago='efectivo'", v5?.formaPago === "efectivo");

  // 6) Fiado total con cliente → 200, MovimientoCuenta por el total
  const r6 = await post("/api/pos-ventas/crear", venta([{ medio: "fiado", monto: 17500 }], { clienteId: S.cli }), ck);
  ok("fiado total con cliente → 200", r6.status === 200, JSON.stringify(r6.j).slice(0, 120));
  const v6 = await prisma.venta.findUnique({ where: { id: r6.j.ventaId }, include: { pagos: true, movimientoCC: true } });
  ok("fiado: esFiado=true, tender FIADO", v6?.esFiado === true && v6.pagos[0]?.medio === "FIADO");
  ok("fiado: MovimientoCuenta DEBITO por total", v6?.movimientoCC.some(m => m.direccion === "DEBITO" && Number(m.monto) === 17500));

  // 7) Fiado sin cliente → 400
  const r7 = await post("/api/pos-ventas/crear", venta([{ medio: "fiado", monto: 17500 }]), ck);
  ok("fiado sin cliente → 400", r7.status === 400 && /cliente/i.test(r7.j?.error || ""));
}

run().then(async () => { await prisma.$disconnect(); console.log(`\n== PAGOS-MULTIPLES: ${pass} pass / ${fail} fail ==`); process.exit(fail ? 1 : 0); })
  .catch(async e => { console.error("ERR", e); await prisma.$disconnect(); process.exit(2); });
