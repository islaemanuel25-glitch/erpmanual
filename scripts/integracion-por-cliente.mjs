// Harness del endpoint reportes-ventas/por-cliente: agrupación por clienteId,
// "Consumidor final", mismo nombre + distinto id SEPARADOS, agregaciones
// (tickets/total/unidades/pagos) y órdenes.
// Uso: DATABASE_URL=...erpazul_term_test AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/integracion-por-cliente.mjs

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";

const AUTH_SECRET = process.env.AUTH_SECRET;
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });
let pass = 0, fail = 0;
const S = {};
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

async function get(path, ck) { const r = await fetch(`${BASE}${path}`, { headers: { Cookie: ck } }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, j }; }
async function truncate() { const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`); const n = rows.map((r) => `"${r.tablename}"`).join(", "); if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`); }
const cookieUser = (u) => `erpazul_sesion=${jwt.sign({ id: u.id, rolId: u.rolId, permisos: ["reportes.ver"], localId: u.localId, esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" })}`;

const hoyAR = () => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const g = (t) => p.find((x) => x.type === t).value; return `${g("year")}-${g("month")}-${g("day")}`; };

async function venta({ numero, cliente, total, medio, unidades }) {
  const v = await prisma.venta.create({ data: { localId: S.local, vendedorId: S.u.id, numero, clienteId: cliente, subtotal: total, total, formaPago: medio.toLowerCase(), esFiado: medio === "FIADO", fecha: new Date(`${hoyAR()}T15:00:00-03:00`) } });
  await prisma.ventaDetalle.create({ data: { ventaId: v.id, productoBaseId: S.baseId, nombre: "P", precio: total, precioCosto: 0, cantidad: unidades, subtotal: total, productoLocalId: S.plId, cantidadStock: unidades } });
  await prisma.ventaPago.create({ data: { ventaId: v.id, medio, monto: total, neto: total } });
  return v;
}

async function seed() {
  await truncate();
  const rol = await prisma.rol.create({ data: { nombre: "Rep", permisos: ["reportes.ver"] } });
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const local = await prisma.local.create({ data: { nombre: "L", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  const u = await prisma.usuario.create({ data: { nombre: "U", email: "u@t.test", passwordHash: "x", rolId: rol.id, localId: local.id } });
  const base = await prisma.productoBase.create({ data: { grupoId: g.id, nombre: "P", unidad_medida: "unidad", precio_costo: 0, precio_venta: 100 } });
  const pl = await prisma.productoLocal.create({ data: { localId: local.id, baseId: base.id, precio_venta: 100 } });
  Object.assign(S, { g: g.id, local: local.id, u: { id: u.id, rolId: rol.id, localId: local.id }, baseId: base.id, plId: pl.id });
  const ana = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Ana", documento: "111" } });
  const beto = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Beto", documento: "222" } });
  const ana2 = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Ana", documento: "999" } }); // MISMO NOMBRE, distinto id
  Object.assign(S, { ana: ana.id, beto: beto.id, ana2: ana2.id });

  await venta({ numero: 1, cliente: ana.id, total: 1000, medio: "EFECTIVO", unidades: 2 });
  await venta({ numero: 2, cliente: ana.id, total: 500, medio: "DEBITO", unidades: 1 });
  await venta({ numero: 3, cliente: beto.id, total: 3000, medio: "EFECTIVO", unidades: 5 });
  await venta({ numero: 4, cliente: ana2.id, total: 200, medio: "EFECTIVO", unidades: 1 });
  await venta({ numero: 5, cliente: null, total: 100, medio: "EFECTIVO", unidades: 1 });
  await venta({ numero: 6, cliente: null, total: 50, medio: "MERCADOPAGO", unidades: 1 });
}

const find = (cs, pred) => cs.find(pred);

async function run() {
  await seed();
  const ck = cookieUser(S.u);
  const hoy = hoyAR();
  const q = `fechaDesde=${hoy}&fechaHasta=${hoy}`;

  // 1) total_desc (default)
  const r = await get(`/api/reportes-ventas/por-cliente?${q}&orden=total_desc`, ck);
  ok("200 + estructura", r.status === 200 && Array.isArray(r.j?.clientes), JSON.stringify(r.j?.error));
  const cs = r.j.clientes;
  ok("4 grupos (Ana, Beto, Ana2, Consumidor final)", cs.length === 4, `len=${cs.length}`);

  const anaG = find(cs, (c) => c.clienteId === S.ana);
  const betoG = find(cs, (c) => c.clienteId === S.beto);
  const ana2G = find(cs, (c) => c.clienteId === S.ana2);
  const cfG = find(cs, (c) => c.clienteId == null);

  ok("Consumidor final presente (clienteId null)", !!cfG && cfG.nombre === "Consumidor final");
  ok("mismo nombre 'Ana' distinto id → 2 grupos separados", !!anaG && !!ana2G && anaG.clienteId !== ana2G.clienteId);

  ok("Ana: 2 tickets", anaG.tickets === 2);
  ok("Ana: total 1500", Number(anaG.totalAcumulado) === 1500);
  ok("Ana: unidades 3", Number(anaG.unidadesTotales) === 3);
  const efe = anaG.pagos.find((p) => p.medio === "EFECTIVO"); const deb = anaG.pagos.find((p) => p.medio === "DEBITO");
  ok("Ana: desglose pagos EFECTIVO 1000 + DEBITO 500", Number(efe?.monto) === 1000 && Number(deb?.monto) === 500);
  ok("Ana: acordeón con 2 ventas originales", Array.isArray(anaG.ventas) && anaG.ventas.length === 2);
  ok("Consumidor final: 2 tickets, total 150", cfG.tickets === 2 && Number(cfG.totalAcumulado) === 150);

  // 2) orden total_desc correcto: Beto(3000) > Ana(1500) > Ana2(200) > CF(150)
  ok("total_desc order", cs.map((c) => Number(c.totalAcumulado)).join(",") === "3000,1500,200,150", cs.map((c) => c.totalAcumulado).join(","));

  // 3) total_asc
  const rAsc = await get(`/api/reportes-ventas/por-cliente?${q}&orden=total_asc`, ck);
  ok("total_asc order", rAsc.j.clientes.map((c) => Number(c.totalAcumulado)).join(",") === "150,200,1500,3000");

  // 4) tickets_desc: Ana(2) y CF(2) primero
  const rTk = await get(`/api/reportes-ventas/por-cliente?${q}&orden=tickets_desc`, ck);
  ok("tickets_desc: primeros dos con 2 tickets", rTk.j.clientes.slice(0, 2).every((c) => c.tickets === 2));

  // 5) nombre_asc: Ana, Ana, Beto, Consumidor final
  const rNom = await get(`/api/reportes-ventas/por-cliente?${q}&orden=nombre_asc`, ck);
  ok("nombre_asc order", rNom.j.clientes.map((c) => c.nombre).join(",") === "Ana,Ana,Beto,Consumidor final", rNom.j.clientes.map((c) => c.nombre).join(","));

  // 6) totales
  ok("totales: 4 clientes / 6 tickets / total 4850", r.j.totales.clientes === 4 && r.j.totales.tickets === 6 && Number(r.j.totales.total) === 4850, JSON.stringify(r.j.totales));

  // 7) filtro formaPago
  const rF = await get(`/api/reportes-ventas/por-cliente?${q}&formaPago=debito`, ck);
  ok("filtro formaPago=debito → solo Ana (su venta débito)", rF.j.clientes.length === 1 && rF.j.clientes[0].clienteId === S.ana);

  // 8) sin permiso → 403
  const ckSin = `erpazul_sesion=${jwt.sign({ id: S.u.id, rolId: S.u.rolId, permisos: ["pos.usar"], localId: S.local }, AUTH_SECRET, { expiresIn: "8h" })}`;
  const rNo = await get(`/api/reportes-ventas/por-cliente?${q}`, ckSin);
  ok("sin reportes.ver → 403", rNo.status === 403);

  console.log(`\nRESULTADO POR-CLIENTE: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
run().catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(1); });
