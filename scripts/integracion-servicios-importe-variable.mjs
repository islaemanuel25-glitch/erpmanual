// Harness de integración: SERVICIOS DE IMPORTE VARIABLE (cargas colectivo/virtuales).
// Verifica server-side: cálculo/recargo, snapshot en VentaDetalle, cobertura mínima en
// efectivo, rechazo de fiado, seguridad (precio/costo/recargo manipulados ignorados),
// exclusión de stock, y prioridad del override por local.
// Uso: DATABASE_URL=<test> AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/integracion-servicios-importe-variable.mjs

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
async function truncate() { const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`); const n = rows.map(r => `"${r.tablename}"`).join(", "); if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`); }

async function seed() {
  const hash = await bcrypt.hash("x", 8);
  const rol = await prisma.rol.create({ data: { nombre: DUENO_LOCAL, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], esSistema: true } });
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const local = await prisma.local.create({ data: { nombre: "L", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: g.id, comisionDebito: 7, comisionCredito: 7, comisionMercadopago: 7, allowNegativeStock: false } });
  const u = await prisma.usuario.create({ data: { nombre: "D", email: "d@t.test", passwordHash: hash, rolId: rol.id, localId: local.id } });
  const turno = await prisma.turno.create({ data: { localId: local.id, vendedorId: u.id, montoInicial: 0 } });
  const cli = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Cli" } });

  // Mercadería normal con stock
  const merc = await prisma.productoBase.create({ data: { grupoId: g.id, creadoEnLocalId: local.id, nombre: "Merc", unidad_medida: "unidad", factor_pack: 1, precio_costo: 8000, precio_venta: 12000, modalidad: "NORMAL" } });
  const mercPL = await prisma.productoLocal.create({ data: { localId: local.id, baseId: merc.id, precio_costo: 8000, precio_venta: 12000, activo: true } });
  await prisma.stockLocal.create({ data: { localId: local.id, productoId: mercPL.id, cantidad: 50 } });

  // Servicio COLECTIVO (0%)
  const colBase = await prisma.productoBase.create({ data: { grupoId: g.id, creadoEnLocalId: local.id, nombre: "Carga colectivo", unidad_medida: "unidad", factor_pack: 1, precio_costo: 0, precio_venta: 0, modalidad: "IMPORTE_VARIABLE", recargoServicioDefaultPct: 0 } });
  await prisma.productoLocal.create({ data: { localId: local.id, baseId: colBase.id, activo: true } });

  // Servicio VIRTUAL (10% default)
  const virBase = await prisma.productoBase.create({ data: { grupoId: g.id, creadoEnLocalId: local.id, nombre: "Carga virtual", unidad_medida: "unidad", factor_pack: 1, precio_costo: 0, precio_venta: 0, modalidad: "IMPORTE_VARIABLE", recargoServicioDefaultPct: 10 } });
  const virPL = await prisma.productoLocal.create({ data: { localId: local.id, baseId: virBase.id, activo: true } });

  Object.assign(S, { g: g.id, local: local.id, turno: turno.id, cli: cli.id,
    merc: merc.id, mercPL: mercPL.id, col: colBase.id, vir: virBase.id, virPL: virPL.id,
    user: { id: u.id, rolId: rol.id, permisos: DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL], localId: local.id } });
}

const txn = () => `t-${Math.random().toString(36).slice(2)}`;
function base(pagos, items, extra = {}) {
  return { clientTxnId: txn(), localId: S.local, turnoId: S.turno, formaPago: "efectivo", pagos, items, ...extra };
}
const svc = (id, importe, over = {}) => ({ productoBaseId: id, nombre: "Svc", cantidad: 1, importeBaseServicio: importe, ...over });
const merc = (qty = 1) => ({ productoBaseId: S.merc, nombre: "Merc", precio: 12000, cantidad: qty, precioCosto: 8000 });

async function run() {
  await truncate(); await seed();
  const ck = cookie(S.user);

  // 1) Colectivo $5000, 0%, todo efectivo
  const r1 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5000 }], [svc(S.col, 5000)]), ck);
  ok("colectivo 5000 efectivo → 200", r1.status === 200, JSON.stringify(r1.j).slice(0, 150));
  const d1 = await prisma.ventaDetalle.findFirst({ where: { ventaId: r1.j?.ventaId } });
  ok("colectivo: esServicio, importe 5000, recargo 0, precio 5000, costo 5000, ganancia 0",
    d1?.esServicio === true && Number(d1.importeBaseServicio) === 5000 && Number(d1.recargoServicioImporte) === 0 &&
    Number(d1.precio) === 5000 && Number(d1.precioCosto) === 5000 && Number(d1.ganancia) === 0,
    JSON.stringify(d1));

  // 2) Virtual $5000, 10%
  const r2 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5500 }], [svc(S.vir, 5000)]), ck);
  const d2 = await prisma.ventaDetalle.findFirst({ where: { ventaId: r2.j?.ventaId } });
  ok("virtual 5000@10%: recargo 500, precio 5500, costo 5000, ganancia 500",
    Number(d2?.recargoServicioPct) === 10 && Number(d2.recargoServicioImporte) === 500 &&
    Number(d2.precio) === 5500 && Number(d2.precioCosto) === 5000 && Number(d2.ganancia) === 500, JSON.stringify(d2));

  // 3) Seguridad: precio/costo/recargo manipulados por el cliente se ignoran
  const r3 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5500 }],
    [svc(S.vir, 5000, { precio: 1, precioCosto: 1, recargoServicioPct: 99, esServicio: true })]), ck);
  const d3 = await prisma.ventaDetalle.findFirst({ where: { ventaId: r3.j?.ventaId } });
  ok("manipulación ignorada → precio 5500 recalculado server-side", r3.status === 200 && Number(d3?.precio) === 5500, JSON.stringify(r3.j).slice(0,120));

  // 4) Mixta: servicio 5500 + mercadería 12000 = 17500, efectivo 5500 + débito 12000 → OK
  const r4 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5500 }, { medio: "debito", monto: 12000 }], [svc(S.vir, 5000), merc(1)]), ck);
  ok("mixta 5500 efectivo + 12000 débito → 200", r4.status === 200, JSON.stringify(r4.j).slice(0, 150));
  const v4 = await prisma.venta.findUnique({ where: { id: r4.j?.ventaId }, include: { detalles: true, pagos: true } });
  const dSvc = v4?.detalles.find(d => d.esServicio), dMerc = v4?.detalles.find(d => !d.esServicio);
  ok("mixta: total 17500", Number(v4?.total) === 17500);
  ok("mixta: servicio comisionLinea null (efectivo)", dSvc && dSvc.comisionLinea == null);
  ok("mixta: comisión solo sobre débito 12000 = 840", Number(v4?.comisionBancaria) === 840);
  ok("mixta: costo servicio = importe (5000), ganancia = recargo (500)", Number(dSvc?.precioCosto) === 5000 && Number(dSvc?.ganancia) === 500);

  // 5) Mixta 5499 efectivo + 12001 débito → 400 (no cubre servicios)
  const r5 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5499 }, { medio: "debito", monto: 12001 }], [svc(S.vir, 5000), merc(1)]), ck);
  ok("5499 efectivo + 12001 débito → 400", r5.status === 400 && /efectivo/i.test(r5.j?.error || ""), JSON.stringify(r5.j).slice(0,120));

  // 6) Mixta todo débito → 400
  const r6 = await post("/api/pos-ventas/crear", base([{ medio: "debito", monto: 17500 }], [svc(S.vir, 5000), merc(1)]), ck);
  ok("mixta todo débito → 400", r6.status === 400);

  // 7) Solo servicio, efectivo parcial + digital → 400
  const r7 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 3000 }, { medio: "debito", monto: 2500 }], [svc(S.vir, 5000)]), ck);
  ok("solo servicio efectivo parcial + digital → 400", r7.status === 400);

  // 8) FIADO con servicio → 400
  const r8 = await post("/api/pos-ventas/crear", base([{ medio: "fiado", monto: 5500 }], [svc(S.vir, 5000)], { clienteId: S.cli }), ck);
  ok("fiado con servicio → 400", r8.status === 400 && /fiar|fiado/i.test(r8.j?.error || ""), JSON.stringify(r8.j).slice(0,120));

  // 9) Producto normal con importe de servicio → 400
  const r9 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 12000 }], [{ ...merc(1), importeBaseServicio: 12000 }]), ck);
  ok("producto normal con importe de servicio → 400", r9.status === 400);

  // 10) Servicio cantidad 2 → 400
  const r10 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 11000 }], [svc(S.vir, 5000, { cantidad: 2 })]), ck);
  ok("servicio cantidad 2 → 400", r10.status === 400);

  // 11) Servicio sin importe → 400
  const r11 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5000 }], [svc(S.vir, undefined)]), ck);
  ok("servicio sin importe → 400", r11.status === 400);

  // 12) Importe fuera de rango (99) → 400
  const r12 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 99 }], [svc(S.vir, 99)]), ck);
  ok("importe 99 (bajo mínimo) → 400", r12.status === 400);

  // 13) Override por local del recargo gana sobre el default
  await prisma.productoLocal.update({ where: { id: S.virPL }, data: { recargoServicioPct: 15 } });
  const r13 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5750 }], [svc(S.vir, 5000)]), ck);
  const d13 = await prisma.ventaDetalle.findFirst({ where: { ventaId: r13.j?.ventaId }, orderBy: { id: "desc" } });
  ok("override local 15% gana: recargo 750, precio 5750", r13.status === 200 && Number(d13?.recargoServicioPct) === 15 && Number(d13.recargoServicioImporte) === 750, JSON.stringify(r13.j).slice(0,120));
  await prisma.productoLocal.update({ where: { id: S.virPL }, data: { recargoServicioPct: null } });

  // 14) Descuento NO reduce el servicio: mixta con descuento global mayor a la mercadería → 400
  const r14a = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5500 }, { medio: "debito", monto: 10000 }], [svc(S.vir, 5000), merc(1)], { descuento: 2000 }), ck);
  ok("descuento 2000 solo sobre mercadería (total 15500) → 200", r14a.status === 200, JSON.stringify(r14a.j).slice(0,120));
  const v14 = await prisma.venta.findUnique({ where: { id: r14a.j?.ventaId }, include: { detalles: true } });
  const dSvc14 = v14?.detalles.find(d => d.esServicio);
  ok("descuento no reduce el servicio (precio sigue 5500)", Number(dSvc14?.precio) === 5500 && Number(v14?.total) === 15500);
  const r14b = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5500 }], [svc(S.vir, 5000)], { descuento: 1000 }), ck);
  ok("descuento sobre venta solo-servicio → 400", r14b.status === 400 && /servicios/i.test(r14b.j?.error || ""), JSON.stringify(r14b.j).slice(0,120));

  // 15) Servicio NO descuenta stock (la mercadería sí)
  const stockMercAntes = Number((await prisma.stockLocal.findFirst({ where: { productoId: S.mercPL } }))?.cantidad);
  const r15 = await post("/api/pos-ventas/crear", base([{ medio: "efectivo", monto: 5000 }], [svc(S.col, 5000)]), ck);
  const stockMercDespues = Number((await prisma.stockLocal.findFirst({ where: { productoId: S.mercPL } }))?.cantidad);
  ok("venta solo-servicio no toca stock de mercadería", r15.status === 200 && stockMercAntes === stockMercDespues);
  const svcSinStock = await prisma.stockLocal.findFirst({ where: { producto: { baseId: S.col } } });
  ok("servicio no tiene fila StockLocal", svcSinStock == null);

  console.log(`\n== SERVICIOS-IMPORTE-VARIABLE: ${pass} pass / ${fail} fail ==`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
run().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
