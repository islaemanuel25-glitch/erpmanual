// EVIDENCIA (Fase A): el consumo físico se CONGELA por línea al vender.
//  - VentaDetalle.productoLocalId + cantidadStock = consumo exacto (normales).
//  - Combos → cantidadStock NULL; su consumo vive en VentaDetalleComponente.
//  - Servicios → cantidadStock NULL.
//  - No hay DUPLICACIÓN: un producto vendido suelto Y dentro de un combo queda
//    partido entre VentaDetalle (suelto) y VentaDetalleComponente (combo), y la
//    suma == el descuento real de StockLocal.
// Uso: DATABASE_URL=<test> AUTH_SECRET=<.env> RBAC_BASE_URL=http://localhost:3011 node scripts/evidencia-consumo-congelado.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { planConsumoVenta } from "../lib/combos/planConsumoVenta.js";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) { console.error("ABORT: no test DB"); process.exit(2); }
const AUTH_SECRET = process.env.AUTH_SECRET;
const BASE = process.env.RBAC_BASE_URL || "http://localhost:3011";
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };
const S = {};

// ─────────────────────────── (a) PRUEBA PURA planConsumoVenta ───────────────────────────
function pruebaPura() {
  // NORMAL en local (factorPack 1) → cantidadStock = cantidad
  const p1 = planConsumoVenta({ esDeposito: false, lineas: [
    { tipo: "NORMAL", productoBaseId: 1, productoLocalId: 10, nombre: "A", precio: 100, cantidad: 3, costoUnitario: 50, baseStock: { factorPack: 1 }, modoVentaLinea: "UNIDAD" },
  ] });
  ok("puro: NORMAL local → consumoFisico {10, 3}", p1.lineasComerciales[0].consumoFisico?.productoLocalId === 10 && Number(p1.lineasComerciales[0].consumoFisico?.cantidadStock) === 3);

  // NORMAL en depósito con factor_pack 6, bulto → cantidadStock = 2*6 = 12
  const p2 = planConsumoVenta({ esDeposito: true, lineas: [
    { tipo: "NORMAL", productoBaseId: 2, productoLocalId: 20, nombre: "B", precio: 100, cantidad: 2, costoUnitario: 50, baseStock: { factorPack: 6, modo_envio: "SOLO_BULTO", unidad_medida: "pack" }, modoVentaLinea: "BULTO" },
  ] });
  ok("puro: NORMAL depósito factor_pack 6 bulto → cantidadStock 12", Number(p2.lineasComerciales[0].consumoFisico?.cantidadStock) === 12, JSON.stringify(p2.lineasComerciales[0].consumoFisico));

  // NORMAL depósito PIEZA fiambre → cantidadStock = cantidad (piezas)
  const p3 = planConsumoVenta({ esDeposito: true, lineas: [
    { tipo: "NORMAL", productoBaseId: 3, productoLocalId: 30, nombre: "Fiambre", precio: 100, cantidad: 4, costoUnitario: 50, baseStock: { factorPack: 1, modoVentaDeposito: "PIEZA", pesoReferenciaKg: 0.5 }, modoVentaLinea: "PIEZA" },
  ] });
  ok("puro: fiambre PIEZA → cantidadStock 4 (piezas)", Number(p3.lineasComerciales[0].consumoFisico?.cantidadStock) === 4);

  // COMBO → consumoFisico null; componentesCongelables poblados
  const p4 = planConsumoVenta({ esDeposito: false, lineas: [
    { tipo: "COMBO", productoBaseId: 4, comboProductoLocalId: 40, nombre: "Combo", precio: 200, cantidad: 2, costoUnitario: 80,
      componentes: [ { productoLocalId: 20, productoBaseId: 2, cantidadPorCombo: 2, costoUnitario: 30, nombre: "B" }, { productoLocalId: 50, productoBaseId: 5, cantidadPorCombo: 1, costoUnitario: 20, nombre: "D" } ] },
  ] });
  const l4 = p4.lineasComerciales[0];
  ok("puro: COMBO → consumoFisico NULL", l4.consumoFisico === null);
  ok("puro: COMBO componentesCongelables B=4 D=2 (×2 combos)", l4.componentesCongelables.find(c => c.productoLocalId === 20)?.cantidad === 4 && l4.componentesCongelables.find(c => c.productoLocalId === 50)?.cantidad === 2);

  // SERVICIO → consumoFisico null
  const p5 = planConsumoVenta({ esDeposito: false, lineas: [
    { tipo: "SERVICIO", productoBaseId: 6, productoLocalId: 60, nombre: "Carga", precio: 100, cantidad: 1, costoUnitario: 100 },
  ] });
  ok("puro: SERVICIO → consumoFisico NULL", p5.lineasComerciales[0].consumoFisico === null);

  // Consolidación: B suelto (line NORMAL) + B en combo → consumoMap consolida, pero
  // consumoFisico de la línea suelta refleja SOLO lo suelto (el combo va aparte).
  const p6 = planConsumoVenta({ esDeposito: false, lineas: [
    { tipo: "NORMAL", productoBaseId: 2, productoLocalId: 20, nombre: "B", precio: 100, cantidad: 3, costoUnitario: 50, baseStock: { factorPack: 1 }, modoVentaLinea: "UNIDAD" },
    { tipo: "COMBO", productoBaseId: 4, comboProductoLocalId: 40, nombre: "Combo", precio: 200, cantidad: 1, costoUnitario: 80, componentes: [ { productoLocalId: 20, productoBaseId: 2, cantidadPorCombo: 2, costoUnitario: 30, nombre: "B" } ] },
  ] });
  const bSuelto = p6.lineasComerciales[0].consumoFisico;
  const consolidadoB = p6.consumoFisicoConsolidado.find(e => e.productoLocalId === 20);
  ok("puro: B suelto consumoFisico=3, combo aparte", Number(bSuelto.cantidadStock) === 3 && p6.lineasComerciales[1].consumoFisico === null);
  ok("puro: consolidado B = 3 (suelto) + 2 (combo) = 5", Number(consolidadoB.cantidad) === 5);
}

// ─────────────────────────── (b) END-TO-END por la API ───────────────────────────
async function truncate() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const n = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`);
}
function cookie(u) {
  const t = jwt.sign({ id: u.id, rolId: u.rolId, permisos: ["*"], localId: u.localId, esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  return `erpazul_sesion=${t}`;
}
async function post(path, body, ck) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: ck }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
async function pBase(data) {
  return prisma.productoBase.create({ data: { grupoId: S.g, nombre: data.nombre, unidad_medida: data.um || "unidad", factor_pack: data.fp ?? 1, precio_costo: data.costo ?? 50, precio_venta: data.precio ?? 100, es_combo: data.combo || false, ...(data.extra || {}) } });
}
async function pLocal(baseId, localId, precio, costo, activo = true) {
  const pl = await prisma.productoLocal.create({ data: { localId, baseId, precio_venta: precio, precio_costo: costo, activo } });
  await prisma.stockLocal.create({ data: { localId, productoId: pl.id, cantidad: 1000 } });
  return pl;
}
async function stock(productoLocalId) {
  const s = await prisma.stockLocal.findUnique({ where: { localId_productoId: { localId: S.local, productoId: productoLocalId } }, select: { cantidad: true } });
  return s ? Number(s.cantidad) : null;
}

async function seedYVender() {
  await truncate();
  const rol = await prisma.rol.create({ data: { nombre: "R", permisos: ["*"], esSistema: false } });
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const local = await prisma.local.create({ data: { nombre: "L", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: g.id, comisionDebito: 7, comisionCredito: 7, comisionMercadopago: 7, allowNegativeStock: true } });
  const u = await prisma.usuario.create({ data: { nombre: "U", email: "u@t.test", passwordHash: await bcrypt.hash("x", 8), rolId: rol.id, localId: local.id } });
  const turno = await prisma.turno.create({ data: { localId: local.id, vendedorId: u.id, montoInicial: 0 } });
  Object.assign(S, { g: g.id, local: local.id, turno: turno.id, user: { id: u.id, rolId: rol.id, localId: local.id } });

  // Productos: A (normal), B (componente, también suelto), D (componente), C (combo B×2 + D×1)
  const A = await pBase({ nombre: "A" }); const plA = await pLocal(A.id, local.id, 100, 50);
  const B = await pBase({ nombre: "B" }); const plB = await pLocal(B.id, local.id, 80, 30);
  const D = await pBase({ nombre: "D" }); const plD = await pLocal(D.id, local.id, 60, 20);
  const C = await pBase({ nombre: "Combo C", combo: true, precio: 300, costo: 0 }); const plC = await pLocal(C.id, local.id, 300, 0);
  await prisma.comboComponente.create({ data: { comboProductoLocalId: plC.id, comboLocalId: local.id, componenteProductoLocalId: plB.id, componenteLocalId: local.id, cantidad: 2 } });
  await prisma.comboComponente.create({ data: { comboProductoLocalId: plC.id, comboLocalId: local.id, componenteProductoLocalId: plD.id, componenteLocalId: local.id, cantidad: 1 } });
  Object.assign(S, { A: { base: A.id, pl: plA.id }, B: { base: B.id, pl: plB.id }, D: { base: D.id, pl: plD.id }, C: { base: C.id, pl: plC.id } });

  const b0 = { A: await stock(plA.id), B: await stock(plB.id), D: await stock(plD.id) };

  // Vender: A×2, B×3 (suelto), Combo C×1  → B se descuenta 3 (suelto) + 2 (combo) = 5
  const venta = {
    clientTxnId: `ev-${Date.now()}`, localId: local.id, turnoId: turno.id, formaPago: "efectivo",
    items: [
      { productoBaseId: A.id, nombre: "A", precio: 100, cantidad: 2, precioCosto: 50 },
      { productoBaseId: B.id, nombre: "B", precio: 80, cantidad: 3, precioCosto: 30 },
      { productoBaseId: C.id, nombre: "Combo C", precio: 300, cantidad: 1, precioCosto: 0 },
    ],
  };
  const r = await post("/api/pos-ventas/crear", venta, cookie(S.user));
  ok("API: crear venta → 200", r.status === 200, JSON.stringify(r.j).slice(0, 150));
  if (r.status !== 200) return;

  const det = await prisma.ventaDetalle.findMany({ where: { ventaId: r.j.ventaId }, include: { componentes: true }, orderBy: { id: "asc" } });
  const dA = det.find(d => d.productoBaseId === A.id);
  const dB = det.find(d => d.productoBaseId === B.id);
  const dC = det.find(d => d.productoBaseId === C.id);

  // (4) cantidadStock exacta en normales
  ok("A: productoLocalId + cantidadStock = 2", dA?.productoLocalId === plA.id && Number(dA?.cantidadStock) === 2);
  ok("B suelto: cantidadStock = 3", dB?.productoLocalId === plB.id && Number(dB?.cantidadStock) === 3);
  // Combo: cantidadStock NULL + componentes congelados
  ok("Combo C: cantidadStock NULL (no duplica)", dC?.cantidadStock === null && dC?.productoLocalId === null);
  ok("Combo C: VentaDetalleComponente B=2, D=1", Number(dC?.componentes.find(c => c.productoLocalId === plB.id)?.cantidad) === 2 && Number(dC?.componentes.find(c => c.productoLocalId === plD.id)?.cantidad) === 1);

  // (5) StockLocal: delta real == congelado, sin doble conteo
  const b1 = { A: await stock(plA.id), B: await stock(plB.id), D: await stock(plD.id) };
  ok("Stock A bajó 2", b0.A - b1.A === 2);
  ok("Stock B bajó 5 (3 suelto + 2 combo, sin duplicar)", b0.B - b1.B === 5, `delta=${b0.B - b1.B}`);
  ok("Stock D bajó 1", b0.D - b1.D === 1);
  // Reconstrucción: Σ cantidadStock(normales de B) + Σ componente(B) == delta real
  const congeladoB = Number(dB.cantidadStock || 0) + Number(dC.componentes.find(c => c.productoLocalId === plB.id)?.cantidad || 0);
  ok("Reconstrucción B: congelado(3+2)=5 == delta real 5", congeladoB === (b0.B - b1.B));
}

async function main() {
  console.log("── (a) planConsumoVenta (puro) ──"); pruebaPura();
  console.log("── (b) end-to-end API ──"); await seedYVender();
  console.log(`\nRESULTADO EVIDENCIA: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error("ERROR:", e); await prisma.$disconnect(); process.exit(1); });
