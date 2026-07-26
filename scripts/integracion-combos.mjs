// Harness de integración de COMBOS contra PostgreSQL REAL (base de test aislada).
// Uso: DATABASE_URL="postgresql://.../erpazul_combos_test?schema=public" node scripts/integracion-combos.mjs
// NUNCA producción: aborta si el nombre de base no contiene "test".
//
// Verifica: constraints reales de E1 (CHECK mismo-local, FK Cascade/Restrict/SetNull),
// venta real de combos (consolidación, VentaDetalle/VentaDetalleComponente, costo),
// rollback total, concurrencia real (FOR UPDATE + advisory) y no-regresión normal.

import { PrismaClient } from "@prisma/client";
import { crearCombo, getCombo } from "../lib/combos/service.js";
import { construirLineasComerciales, aplicarConsumoStock } from "../lib/combos/ventaConsumo.js";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) {
  console.error("ABORT: DATABASE_URL no apunta a una base de *test*. url=", url.replace(/:\/\/[^@]*@/, "://***@"));
  process.exit(2);
}
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });

let pass = 0, fail = 0;
async function run(name, fn) {
  try { await fn(); console.log("✔", name); pass++; }
  catch (e) { console.log("✖", name, "→", e.message); fail++; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || "assert falló"); };
const eq = (a, b, msg) => { if (Number(a) !== Number(b)) throw new Error((msg || "eq") + `: ${a} !== ${b}`); };

// ── Estado sembrado ────────────────────────────────────────────────────────
const S = {};

async function limpiar() {
  // Orden respetando FKs
  await prisma.ventaDetalleComponente.deleteMany({});
  await prisma.ventaDetalle.deleteMany({});
  await prisma.venta.deleteMany({});
  await prisma.comboComponente.deleteMany({});
  await prisma.stockLocal.deleteMany({});
  await prisma.productoLocal.deleteMany({});
  await prisma.productoBase.deleteMany({});
  await prisma.grupoLocal.deleteMany({});
  await prisma.grupoDeposito.deleteMany({});
  await prisma.configuracionGrupo.deleteMany({});
  await prisma.turno.deleteMany({});
  await prisma.usuario.deleteMany({});
  await prisma.rol.deleteMany({});
  await prisma.local.deleteMany({});
  await prisma.grupo.deleteMany({});
}

async function setStock(productoLocalId, cantidad) {
  await prisma.stockLocal.update({ where: { localId_productoId: { localId: S.localA, productoId: productoLocalId } }, data: { cantidad } });
}
async function getStock(productoLocalId) {
  const s = await prisma.stockLocal.findUnique({ where: { localId_productoId: { localId: S.localA, productoId: productoLocalId } }, select: { cantidad: true } });
  return s ? Number(s.cantidad) : null;
}
async function setAllowNegative(v) {
  await prisma.configuracionGrupo.update({ where: { grupoId: S.grupo }, data: { allowNegativeStock: v } });
}

async function sembrar() {
  await limpiar();
  const rol = await prisma.rol.create({ data: { nombre: "vendedor-test", permisos: ["*"] } });
  const grupo = await prisma.grupo.create({ data: { nombre: "GrupoTest" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const localA = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const localB = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localB.id } });
  const usuario = await prisma.usuario.create({ data: { nombre: "Vend", email: "vend@test.local", passwordHash: "x", rolId: rol.id, localId: localA.id } });
  await prisma.configuracionGrupo.create({ data: { grupoId: grupo.id, allowNegativeStock: false } });

  // Componentes en LocalA
  async function comp(nombre, costo, stock, extra = {}) {
    const base = await prisma.productoBase.create({ data: { grupoId: grupo.id, creadoEnLocalId: localA.id, nombre, unidad_medida: "unidad", precio_costo: costo, precio_venta: costo * 2, ...extra } });
    const pl = await prisma.productoLocal.create({ data: { localId: localA.id, baseId: base.id, precio_costo: costo, precio_venta: costo * 2, activo: true } });
    await prisma.stockLocal.create({ data: { localId: localA.id, productoId: pl.id, cantidad: stock } });
    return { baseId: base.id, plId: pl.id };
  }
  const coca = await comp("Coca", 100, 10);
  const fernet = await comp("Fernet", 800, 10);
  // Producto en LocalB (para test de otro local)
  const baseB = await prisma.productoBase.create({ data: { grupoId: grupo.id, creadoEnLocalId: localB.id, nombre: "SoloB", unidad_medida: "unidad", precio_costo: 50, precio_venta: 100 } });
  const plB = await prisma.productoLocal.create({ data: { localId: localB.id, baseId: baseB.id, precio_costo: 50, precio_venta: 100, activo: true } });

  Object.assign(S, { rol: rol.id, grupo: grupo.id, depo: depo.id, localA: localA.id, localB: localB.id, usuario: usuario.id, coca, fernet, plB: plB.id, baseB: baseB.id });
}

// ── Venta real (replica el núcleo de crear/route.js con los helpers reales) ──
async function venderVenta({ localId, items, allowNegativeStock = false, forzarFalloComponente = false }) {
  const productoBaseIds = items.map((i) => i.productoBaseId);
  const productosBase = await prisma.productoBase.findMany({
    where: { id: { in: productoBaseIds } },
    select: { id: true, precio_costo: true, factor_pack: true, modoVentaDeposito: true, pesoReferenciaKg: true, modo_envio: true, unidad_medida: true, es_combo: true },
  });
  const localInfo = await prisma.local.findUnique({ where: { id: localId }, select: { es_deposito: true } });
  const esDeposito = localInfo?.es_deposito === true;
  const costosMap = {}, baseStockMap = {}, productosBaseMap = {};
  productosBase.forEach((p) => {
    const factorPack = Math.max(1, Number(p.factor_pack) || 1);
    costosMap[p.id] = { costoBulto: Number(p.precio_costo) || 0, factorPack };
    productosBaseMap[p.id] = { es_combo: p.es_combo === true };
    baseStockMap[p.id] = { modoVentaDeposito: p.modoVentaDeposito || "PESO", pesoReferenciaKg: Number(p.pesoReferenciaKg || 0), factorPack, modo_envio: p.modo_envio || null, unidad_medida: p.unidad_medida || "unidad" };
  });

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(localId)})`;
    const ultima = await tx.venta.findFirst({ where: { localId }, orderBy: { numero: "desc" }, select: { numero: true } });
    const numero = ultima ? Number(ultima.numero) + 1 : 1;

    const { lineasComerciales, consumoFisicoConsolidado } = await construirLineasComerciales(tx, { items, productosBaseMap, costosMap, baseStockMap, localId, esDeposito });
    let costoTotal = 0;
    for (const l of lineasComerciales) costoTotal += l.costoLinea;
    await aplicarConsumoStock(tx, { localId, consumoFisicoConsolidado, allowNegativeStock });

    const subtotal = items.reduce((a, i) => a + i.precio * i.cantidad, 0);
    const total = subtotal;
    const venta = await tx.venta.create({ data: { localId, vendedorId: S.usuario, numero, subtotal, total, costoTotal, gananciaBruta: total - costoTotal, gananciaNeta: total - costoTotal, formaPago: "efectivo" } });

    for (const l of lineasComerciales) {
      const detalle = await tx.ventaDetalle.create({ data: { ventaId: venta.id, productoBaseId: l.productoBaseId, nombre: l.nombre, precio: l.precio, precioCosto: l.costoUnitario, cantidad: l.cantidad, subtotal: l.subtotal, ganancia: l.subtotal - l.costoLinea } });
      if (l.tipo === "COMBO" && l.componentesCongelables.length) {
        if (forzarFalloComponente) {
          // FK inexistente → viola VentaDetalleComponente_productoBaseId_fkey → rollback total.
          await tx.ventaDetalleComponente.create({ data: { ventaDetalleId: detalle.id, productoBaseId: 999999999, cantidad: 1, precioCosto: 0 } });
        } else {
          await tx.ventaDetalleComponente.createMany({ data: l.componentesCongelables.map((c) => ({ ventaDetalleId: detalle.id, productoBaseId: c.productoBaseId, productoLocalId: c.productoLocalId, cantidad: c.cantidad, precioCosto: c.costoUnitario })) });
        }
      }
    }
    return { ventaId: venta.id, numero };
  });
}

async function crearComboTest({ localId = S.localA, nombre, componentes }) {
  const combo = await crearCombo({ prisma, grupoId: S.grupo, localId, data: { nombre, precio_venta: 1000, componentes } });
  return combo;
}

async function main() {
  await sembrar();

  // ═══════════ INTEGRIDAD DEL SCHEMA (constraints reales) ═══════════
  await run("1) combo + componente del MISMO local: permitido", async () => {
    const combo = await crearComboTest({ nombre: "C-ok", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    assert(combo.productoLocalId, "combo creado");
    // limpiar este combo para no interferir
    await prisma.comboComponente.deleteMany({ where: { comboProductoLocalId: combo.productoLocalId } });
    await prisma.productoLocal.delete({ where: { id: combo.productoLocalId } });
    await prisma.productoBase.delete({ where: { id: combo.baseId } });
  });

  await run("2) combo(localA) + componente(localB): rechazado por CHECK/FK", async () => {
    // combo PL en localA, componente apuntando a un PL de localB → CHECK mismo-local + FK
    const base = await prisma.productoBase.create({ data: { grupoId: S.grupo, creadoEnLocalId: S.localA, nombre: "C-cross", unidad_medida: "unidad", precio_costo: 0, precio_venta: 1000, es_combo: true } });
    const comboPL = await prisma.productoLocal.create({ data: { localId: S.localA, baseId: base.id, precio_venta: 1000, activo: true } });
    let rechazado = false;
    try {
      await prisma.comboComponente.create({ data: { comboProductoLocalId: comboPL.id, comboLocalId: S.localA, componenteProductoLocalId: S.plB, componenteLocalId: S.localB, cantidad: 1 } });
    } catch { rechazado = true; }
    // limpiar
    await prisma.productoLocal.delete({ where: { id: comboPL.id } });
    await prisma.productoBase.delete({ where: { id: base.id } });
    assert(rechazado, "debía rechazar combo/componente de locales distintos");
  });

  await run("3) borrar ProductoLocal componente usado: rechazado (Restrict)", async () => {
    const combo = await crearComboTest({ nombre: "C-restrict", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 1 }] });
    let rechazado = false;
    try { await prisma.productoLocal.delete({ where: { id: S.coca.plId } }); } catch { rechazado = true; }
    await prisma.productoLocal.delete({ where: { id: combo.productoLocalId } }); // cascade limpia combo
    await prisma.productoBase.delete({ where: { id: combo.baseId } });
    assert(rechazado, "Restrict debía impedir borrar el componente en uso");
  });

  await run("4) borrar ProductoLocal del combo: Cascade elimina ComboComponente", async () => {
    const combo = await crearComboTest({ nombre: "C-cascade", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 1 }] });
    const antes = await prisma.comboComponente.count({ where: { comboProductoLocalId: combo.productoLocalId } });
    eq(antes, 1, "1 componente antes");
    await prisma.productoLocal.delete({ where: { id: combo.productoLocalId } });
    const despues = await prisma.comboComponente.count({ where: { comboProductoLocalId: combo.productoLocalId } });
    eq(despues, 0, "cascade debía borrar la composición");
    await prisma.productoBase.delete({ where: { id: combo.baseId } });
  });

  await run("6) borrar ProductoBase referenciado por VentaDetalleComponente: Restrict", async () => {
    // vender un combo para generar VentaDetalleComponente que referencia la base de un componente
    await setStock(S.coca.plId, 10);
    const combo = await crearComboTest({ nombre: "C-hist", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 1 }] });
    await venderVenta({ localId: S.localA, items: [{ productoBaseId: combo.baseId, precio: 1000, cantidad: 1, nombre: "C-hist" }] });
    let rechazado = false;
    try { await prisma.productoBase.delete({ where: { id: S.coca.baseId } }); } catch { rechazado = true; }
    assert(rechazado, "Restrict debía impedir borrar la base con historial de componente vendido");
  });

  await run("5) borrar ProductoLocal histórico (VentaDetalleComponente): SetNull", async () => {
    // La venta anterior dejó VentaDetalleComponente con productoLocalId = coca.plId.
    // Para borrar ese PL primero hay que sacarlo de cualquier combo (Restrict). Creamos
    // un componente NUEVO, lo usamos en una venta, y luego lo borramos sin combos que lo usen.
    const tmp = await prisma.productoBase.create({ data: { grupoId: S.grupo, creadoEnLocalId: S.localA, nombre: "Tmp", unidad_medida: "unidad", precio_costo: 10, precio_venta: 20 } });
    const tmpPL = await prisma.productoLocal.create({ data: { localId: S.localA, baseId: tmp.id, precio_costo: 10, precio_venta: 20, activo: true } });
    await prisma.stockLocal.create({ data: { localId: S.localA, productoId: tmpPL.id, cantidad: 10 } });
    const combo = await crearComboTest({ nombre: "C-setnull", componentes: [{ componenteProductoLocalId: tmpPL.id, cantidad: 1 }] });
    const v = await venderVenta({ localId: S.localA, items: [{ productoBaseId: combo.baseId, precio: 1000, cantidad: 1, nombre: "C-setnull" }] });
    // Sacar tmpPL de cualquier combo (borrando el combo PL → Cascade de ComboComponente).
    // NO se borra la base del combo (su VentaDetalle la referencia por Restrict, y no es
    // lo que este test verifica). Luego se borra el StockLocal y el ProductoLocal del
    // componente: al no quedar ComboComponente que lo use (Restrict), el borrado procede y
    // VentaDetalleComponente.productoLocalId debe quedar en null por SetNull.
    await prisma.productoLocal.delete({ where: { id: combo.productoLocalId } }); // cascade ComboComponente
    await prisma.stockLocal.deleteMany({ where: { productoId: tmpPL.id } });
    await prisma.productoLocal.delete({ where: { id: tmpPL.id } }); // ← permitido (SetNull en historial)
    const vdc = await prisma.ventaDetalleComponente.findFirst({ where: { productoBaseId: tmp.id } });
    assert(vdc && vdc.productoLocalId === null, "productoLocalId debía quedar null por SetNull");
  });

  // ═══════════ VENTA REAL ═══════════
  await run("7/8/14/15/16) crear+consultar combo, vender 1, verificar saldos/detalle/costo", async () => {
    await sembrar();
    await setStock(S.coca.plId, 10); await setStock(S.fernet.plId, 10);
    const combo = await crearComboTest({ nombre: "Combo Fernet", componentes: [{ componenteProductoLocalId: S.fernet.plId, cantidad: 1 }, { componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    const dto = await getCombo({ prisma, grupoId: S.grupo, localId: S.localA, productoLocalId: combo.productoLocalId });
    eq(dto.costoTotal, 1000, "costo combo 800+200"); eq(dto.disponibilidad, 5, "min(10/1,10/2)=5");

    const v = await venderVenta({ localId: S.localA, items: [{ productoBaseId: combo.baseId, precio: 1000, cantidad: 1, nombre: "Combo Fernet" }] });
    eq(await getStock(S.coca.plId), 8, "coca 10-2"); eq(await getStock(S.fernet.plId), 9, "fernet 10-1");
    const detalles = await prisma.ventaDetalle.findMany({ where: { ventaId: v.ventaId } });
    eq(detalles.length, 1, "una VentaDetalle comercial (el combo)");
    eq(detalles[0].productoBaseId, combo.baseId, "detalle = base del combo");
    eq(Number(detalles[0].precioCosto), 1000, "precioCosto = costo total combo");
    eq(Number(detalles[0].ganancia), 0, "ganancia 1000-1000");
    const comps = await prisma.ventaDetalleComponente.findMany({ where: { ventaDetalleId: detalles[0].id }, orderBy: { productoBaseId: "asc" } });
    eq(comps.length, 2, "dos VentaDetalleComponente congelados");
    const totalCong = comps.reduce((a, c) => a + Number(c.cantidad), 0);
    eq(totalCong, 3, "2 coca + 1 fernet congelados");
  });

  await run("10) vender varias unidades multiplica componentes", async () => {
    await sembrar();
    await setStock(S.coca.plId, 10);
    const combo = await crearComboTest({ nombre: "C-mult", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    await venderVenta({ localId: S.localA, items: [{ productoBaseId: combo.baseId, precio: 1000, cantidad: 3, nombre: "C-mult" }] });
    eq(await getStock(S.coca.plId), 4, "10 - (2×3)");
  });

  await run("11/13) venta mixta directo + combo consolida un solo decrement", async () => {
    await sembrar();
    await setStock(S.coca.plId, 10);
    const combo = await crearComboTest({ nombre: "C-mixto", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    await venderVenta({ localId: S.localA, items: [
      { productoBaseId: S.coca.baseId, precio: 200, cantidad: 3, nombre: "Coca", precioCosto: 100 },
      { productoBaseId: combo.baseId, precio: 1000, cantidad: 1, nombre: "C-mixto" },
    ] });
    eq(await getStock(S.coca.plId), 5, "10 - (3 directo + 2 combo)"); // consolidado
  });

  await run("12) dos combos comparten componente en una venta", async () => {
    await sembrar();
    await setStock(S.coca.plId, 10);
    const c1 = await crearComboTest({ nombre: "C1", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    const c2 = await crearComboTest({ nombre: "C2", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 1 }] });
    await venderVenta({ localId: S.localA, items: [
      { productoBaseId: c1.baseId, precio: 1000, cantidad: 1, nombre: "C1" },
      { productoBaseId: c2.baseId, precio: 1000, cantidad: 1, nombre: "C2" },
    ] });
    eq(await getStock(S.coca.plId), 7, "10 - (2 + 1)");
  });

  // ═══════════ ROLLBACK ═══════════
  await run("17) fallo al crear VentaDetalleComponente → rollback total", async () => {
    await sembrar();
    await setStock(S.coca.plId, 10);
    const combo = await crearComboTest({ nombre: "C-rb", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    const ventasAntes = await prisma.venta.count();
    let error = false;
    try { await venderVenta({ localId: S.localA, items: [{ productoBaseId: combo.baseId, precio: 1000, cantidad: 1, nombre: "C-rb" }], forzarFalloComponente: true }); } catch { error = true; }
    assert(error, "debía lanzar");
    eq(await prisma.venta.count(), ventasAntes, "no se creó Venta");
    eq(await getStock(S.coca.plId), 10, "stock intacto (rollback)");
    eq(await prisma.ventaDetalleComponente.count(), 0, "sin componentes huérfanos");
  });

  // ═══════════ CONCURRENCIA REAL ═══════════
  await run("18) dos ventas del último combo (allowNegative=false): una sí, una insuficiente, sin negativo", async () => {
    await sembrar(); await setAllowNegative(false);
    await setStock(S.coca.plId, 2); await setStock(S.fernet.plId, 10);
    const combo = await crearComboTest({ nombre: "C-conc", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    const item = { productoBaseId: combo.baseId, precio: 1000, cantidad: 1, nombre: "C-conc" };
    const r = await Promise.allSettled([
      venderVenta({ localId: S.localA, items: [item] }),
      venderVenta({ localId: S.localA, items: [item] }),
    ]);
    const ok = r.filter((x) => x.status === "fulfilled").length;
    const ko = r.filter((x) => x.status === "rejected");
    eq(ok, 1, "exactamente una venta confirmada");
    eq(ko.length, 1, "exactamente una rechazada");
    assert(/Stock insuficiente/.test(ko[0].reason.message), "rechazo por stock");
    eq(await getStock(S.coca.plId), 0, "stock final 0, nunca negativo");
  });

  await run("19) dos combos distintos que comparten componente (orden distinto): sin deadlock, consistente", async () => {
    await sembrar(); await setAllowNegative(false);
    await setStock(S.coca.plId, 2); await setStock(S.fernet.plId, 2);
    const c1 = await crearComboTest({ nombre: "D1", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 2 }, { componenteProductoLocalId: S.fernet.plId, cantidad: 1 }] });
    const c2 = await crearComboTest({ nombre: "D2", componentes: [{ componenteProductoLocalId: S.fernet.plId, cantidad: 1 }, { componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    const r = await Promise.allSettled([
      venderVenta({ localId: S.localA, items: [{ productoBaseId: c1.baseId, precio: 1000, cantidad: 1, nombre: "D1" }] }),
      venderVenta({ localId: S.localA, items: [{ productoBaseId: c2.baseId, precio: 1000, cantidad: 1, nombre: "D2" }] }),
    ]);
    const ok = r.filter((x) => x.status === "fulfilled").length;
    eq(ok, 1, "solo una pudo (coca solo alcanza para un combo)");
    assert(Number(await getStock(S.coca.plId)) >= 0, "coca no negativa");
  });

  await run("20) producto individual vs combo por el último componente: solo una consume", async () => {
    await sembrar(); await setAllowNegative(false);
    await setStock(S.coca.plId, 2);
    const combo = await crearComboTest({ nombre: "C-vs", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    const r = await Promise.allSettled([
      venderVenta({ localId: S.localA, items: [{ productoBaseId: S.coca.baseId, precio: 200, cantidad: 2, nombre: "Coca", precioCosto: 100 }] }),
      venderVenta({ localId: S.localA, items: [{ productoBaseId: combo.baseId, precio: 1000, cantidad: 1, nombre: "C-vs" }] }),
    ]);
    eq(r.filter((x) => x.status === "fulfilled").length, 1, "solo una operación consume las 2 cocas");
    eq(await getStock(S.coca.plId), 0, "final 0, no negativo");
  });

  await run("21) allowNegative=true: ambas venden, stock final negativo correcto", async () => {
    await sembrar(); await setAllowNegative(true);
    await setStock(S.coca.plId, 2);
    const combo = await crearComboTest({ nombre: "C-neg", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 2 }] });
    const item = { productoBaseId: combo.baseId, precio: 1000, cantidad: 1, nombre: "C-neg" };
    const r = await Promise.allSettled([
      venderVenta({ localId: S.localA, items: [item], allowNegativeStock: true }),
      venderVenta({ localId: S.localA, items: [item], allowNegativeStock: true }),
    ]);
    eq(r.filter((x) => x.status === "fulfilled").length, 2, "ambas confirmaron");
    eq(await getStock(S.coca.plId), -2, "2 - (2+2) = -2, sin pérdida de updates");
  });

  // ═══════════ NO REGRESIÓN NORMAL ═══════════
  await run("NR) producto normal (factor pack, depósito) descuenta con paridad", async () => {
    await sembrar();
    // pack x6 en depósito, vendido por bulto → descuenta 6 por unidad de venta
    const base = await prisma.productoBase.create({ data: { grupoId: S.grupo, creadoEnLocalId: S.depo, nombre: "Pack6", unidad_medida: "pack", factor_pack: 6, precio_costo: 600, precio_venta: 1200, modo_envio: "SOLO_BULTO" } });
    const pl = await prisma.productoLocal.create({ data: { localId: S.depo, baseId: base.id, precio_costo: 600, precio_venta: 1200, activo: true } });
    await prisma.stockLocal.create({ data: { localId: S.depo, productoId: pl.id, cantidad: 60 } });
    await venderVenta({ localId: S.depo, items: [{ productoBaseId: base.id, precio: 1200, cantidad: 2, nombre: "Pack6", precioCosto: 600 }] });
    const s = await prisma.stockLocal.findUnique({ where: { localId_productoId: { localId: S.depo, productoId: pl.id } }, select: { cantidad: true } });
    eq(Number(s.cantidad), 48, "60 - (2 × factor 6) = 48");
  });

  // ═══════════ FILTRO DEL BUSCADOR DE COMPONENTES ═══════════
  await run("BC) buscar-componentes excluye combos, inactivos y otros locales", async () => {
    await sembrar();
    await setStock(S.coca.plId, 10);
    const combo = await crearComboTest({ nombre: "C-filtro", componentes: [{ componenteProductoLocalId: S.coca.plId, cantidad: 1 }] });
    await prisma.productoLocal.update({ where: { id: S.fernet.plId }, data: { activo: false } }); // inactivo
    // Misma condición que el endpoint (local activo, activos, es_combo=false).
    const rows = await prisma.productoLocal.findMany({
      where: { localId: S.localA, activo: true, base: { activo: true, es_combo: false } },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    assert(ids.includes(S.coca.plId), "componente normal activo presente");
    assert(!ids.includes(combo.productoLocalId), "combo excluido (es_combo=false)");
    assert(!ids.includes(S.fernet.plId), "producto inactivo excluido");
    assert(!ids.includes(S.plB), "producto de otro local excluido");
  });

  await limpiar();
  console.log(`\nRESULTADO: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(3); });
