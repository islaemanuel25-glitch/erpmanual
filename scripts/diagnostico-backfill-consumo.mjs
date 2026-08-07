// scripts/diagnostico-backfill-consumo.mjs
//
// DIAGNÓSTICO (solo lectura/clasificación) del consumo físico de ventas LEGACY
// —las creadas antes de congelar VentaDetalle.productoLocalId/cantidadStock—.
// NO escribe cantidadStock ni infiere valores ambiguos: SOLO clasifica cada
// línea como SEGURA (reconstruible de forma determinista) o AMBIGUA (no).
//
// Regla de clasificación (espejo EXACTO de cantidadParaStockNormal):
//   · Servicio (esServicio)                → SEGURA (no consume stock).
//   · Combo con componentes congelados     → SEGURA (revierte por componente).
//   · Combo SIN componentes (pre-E1)       → AMBIGUA.
//   · Normal, sin ProductoLocal (localId,baseId) → AMBIGUA (no se sabe qué fila).
//   · Normal en LOCAL (no depósito)        → SEGURA (cantidadStock == cantidad).
//   · Normal en DEPÓSITO:
//        - PIEZA fiambre (modoVentaDeposito=PIEZA, pesoRef>0) → SEGURA (×1).
//        - factor_pack ≤ 1                  → SEGURA (×1).
//        - factor_pack > 1 y modo_envio=SOLO_UNIDAD → SEGURA (×1).
//        - factor_pack > 1 y (BULTO/MIXTO/null) → AMBIGUA (×factor vs ×1 remanente,
//          y modoVentaLinea NO se persistió en legacy).
//
// SEED=1 crea fixtures sintéticas (una por categoría) para ejercitar el
// clasificador en la DB aislada. Sin SEED, clasifica lo que ya exista.
// Uso: DATABASE_URL=...erpazul_term_test [SEED=1] node scripts/diagnostico-backfill-consumo.mjs

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });

const SEED = process.env.SEED === "1";

// --- Clasificador PURO -----------------------------------------------------
function clasificar(det, { esDeposito, base, tieneProductoLocal, componentes }) {
  if (det.cantidadStock != null) return { cat: "ya_congelado", seguro: true };
  if (det.esServicio) return { cat: "sin_stock_servicio", seguro: true };

  const esCombo = (componentes && componentes.length > 0) || base?.es_combo;
  if (esCombo) {
    if (!componentes || componentes.length === 0) return { cat: "combo_sin_componentes", seguro: false };
    const algunoSinPL = componentes.some((c) => c.productoLocalId == null);
    return algunoSinPL
      ? { cat: "combo_componente_sin_productolocal", seguro: false }
      : { cat: "combo_congelado", seguro: true };
  }

  if (!tieneProductoLocal) return { cat: "sin_producto_local", seguro: false };
  if (!esDeposito) return { cat: "local_directo", seguro: true };

  // Depósito:
  const piezaFiambre = base?.modoVentaDeposito === "PIEZA" && Number(base?.pesoReferenciaKg) > 0;
  if (piezaFiambre) return { cat: "deposito_pieza_directo", seguro: true };
  const factor = Math.max(1, Number(base?.factor_pack) || 1);
  if (factor <= 1) return { cat: "deposito_sin_pack", seguro: true };
  if (base?.modo_envio === "SOLO_UNIDAD") return { cat: "deposito_solo_unidad", seguro: true };
  return { cat: "ambiguo_deposito_factor", seguro: false };
}

// --- Seed de fixtures legacy (sintéticas) ----------------------------------
async function seed() {
  // Limpieza total previa (DB de test).
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const n = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`);

  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const local = await prisma.local.create({ data: { nombre: "L", es_deposito: false } });
  const depo = await prisma.local.create({ data: { nombre: "D", es_deposito: true } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  const vend = await prisma.usuario.create({ data: { nombre: "V", email: "v@t.test", passwordHash: "x", rolId: (await prisma.rol.create({ data: { nombre: "R", permisos: ["*"] } })).id } });

  // Helper para crear ProductoBase + ProductoLocal.
  let bc = 0;
  async function prod(attrs = {}, { conLocalEnLocal = true, conLocalEnDepo = false } = {}) {
    bc++;
    const base = await prisma.productoBase.create({
      data: {
        grupoId: g.id, nombre: attrs.nombre || `P${bc}`, unidad_medida: attrs.unidad_medida || "unidad",
        precio_costo: 10, precio_venta: 20,
        factor_pack: attrs.factor_pack ?? null, modo_envio: attrs.modo_envio ?? null,
        modoVentaDeposito: attrs.modoVentaDeposito ?? "PESO", pesoReferenciaKg: attrs.pesoReferenciaKg ?? null,
        es_combo: attrs.es_combo ?? false, modalidad: attrs.modalidad ?? "NORMAL",
      },
    });
    let plLocal = null, plDepo = null;
    if (conLocalEnLocal) plLocal = await prisma.productoLocal.create({ data: { localId: local.id, baseId: base.id, precio_venta: 20 } });
    if (conLocalEnDepo) plDepo = await prisma.productoLocal.create({ data: { localId: depo.id, baseId: base.id, precio_venta: 20 } });
    return { base, plLocal, plDepo };
  }

  // Productos representativos
  const pNormalLocal = await prod({ nombre: "Normal local" });
  const pServicio = await prod({ nombre: "Carga colectivo", modalidad: "IMPORTE_VARIABLE" });
  const pFactorBulto = await prod({ nombre: "Fardo x6 (BULTO)", factor_pack: 6, modo_envio: "SOLO_BULTO" }, { conLocalEnLocal: false, conLocalEnDepo: true });
  const pFactorUnidad = await prod({ nombre: "Fardo x6 (SOLO_UNIDAD)", factor_pack: 6, modo_envio: "SOLO_UNIDAD" }, { conLocalEnLocal: false, conLocalEnDepo: true });
  const pFiambre = await prod({ nombre: "Fiambre pieza", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3 }, { conLocalEnLocal: false, conLocalEnDepo: true });
  const pSinPL = await prod({ nombre: "Sin ProductoLocal" }, { conLocalEnLocal: false }); // base sin fila local
  const pCombo = await prod({ nombre: "Combo X", es_combo: true });
  const pComp = await prod({ nombre: "Componente" });

  // Helper venta legacy (cantidadStock siempre NULL).
  let vc = 0;
  async function ventaLegacy(localId, lineas) {
    vc++;
    const venta = await prisma.venta.create({
      data: { localId, vendedorId: vend.id, numero: vc, subtotal: 100, total: 100, formaPago: "efectivo",
        fecha: new Date("2026-01-15T12:00:00-03:00") },
    });
    for (const l of lineas) {
      const d = await prisma.ventaDetalle.create({
        data: {
          ventaId: venta.id, productoBaseId: l.baseId, nombre: l.nombre, precio: 20, cantidad: l.cantidad,
          subtotal: 20 * l.cantidad, esServicio: l.esServicio || false,
          // LEGACY: NO se setean productoLocalId ni cantidadStock.
        },
      });
      if (l.componentes) {
        for (const c of l.componentes) {
          await prisma.ventaDetalleComponente.create({
            data: { ventaDetalleId: d.id, productoBaseId: c.baseId, productoLocalId: c.productoLocalId ?? null, cantidad: c.cantidad },
          });
        }
      }
    }
    return venta;
  }

  await ventaLegacy(local.id, [{ baseId: pNormalLocal.base.id, nombre: "Normal local", cantidad: 2 }]);
  await ventaLegacy(local.id, [{ baseId: pServicio.base.id, nombre: "Carga colectivo", cantidad: 1, esServicio: true }]);
  await ventaLegacy(depo.id, [{ baseId: pFactorBulto.base.id, nombre: "Fardo x6 (BULTO)", cantidad: 1 }]);      // ambiguo
  await ventaLegacy(depo.id, [{ baseId: pFactorUnidad.base.id, nombre: "Fardo x6 (SOLO_UNIDAD)", cantidad: 3 }]); // seguro
  await ventaLegacy(depo.id, [{ baseId: pFiambre.base.id, nombre: "Fiambre pieza", cantidad: 4 }]);              // seguro
  await ventaLegacy(local.id, [{ baseId: pSinPL.base.id, nombre: "Sin ProductoLocal", cantidad: 1 }]);          // ambiguo
  await ventaLegacy(local.id, [{ baseId: pCombo.base.id, nombre: "Combo X", cantidad: 1,
    componentes: [{ baseId: pComp.base.id, productoLocalId: pComp.plLocal.id, cantidad: 2 }] }]);                 // seguro
  await ventaLegacy(local.id, [{ baseId: pCombo.base.id, nombre: "Combo viejo sin comp", cantidad: 1 }]);        // ambiguo (combo sin componentes)

  console.log(`   [seed] ${vc} ventas legacy sintéticas creadas.`);
}

// --- Diagnóstico -----------------------------------------------------------
async function run() {
  if (SEED) await seed();

  // Set de locales-depósito.
  const depos = new Set((await prisma.grupoDeposito.findMany({ select: { localId: true } })).map((r) => r.localId));
  const localesDepoFlag = new Set((await prisma.local.findMany({ where: { es_deposito: true }, select: { id: true } })).map((r) => r.id));
  const esDepositoLocal = (localId) => depos.has(localId) || localesDepoFlag.has(localId);

  const detalles = await prisma.ventaDetalle.findMany({
    select: {
      id: true, ventaId: true, productoBaseId: true, nombre: true, cantidad: true, cantidadStock: true, esServicio: true,
      venta: { select: { localId: true, fecha: true } },
      componentes: { select: { productoLocalId: true } },
    },
  });

  // Cache de base + existencia de ProductoLocal(localId,baseId).
  const baseIds = [...new Set(detalles.map((d) => d.productoBaseId))];
  const bases = new Map((await prisma.productoBase.findMany({
    where: { id: { in: baseIds } },
    select: { id: true, es_combo: true, factor_pack: true, modo_envio: true, modoVentaDeposito: true, pesoReferenciaKg: true },
  })).map((b) => [b.id, b]));

  const pls = await prisma.productoLocal.findMany({
    where: { baseId: { in: baseIds } }, select: { localId: true, baseId: true },
  });
  const plSet = new Set(pls.map((p) => `${p.localId}:${p.baseId}`));

  const cuentas = new Map();
  const ambiguos = [];
  let total = 0, seguros = 0, inseguros = 0, yaCongelados = 0;

  for (const d of detalles) {
    total++;
    const localId = d.venta.localId;
    const base = bases.get(d.productoBaseId);
    const r = clasificar(d, {
      esDeposito: esDepositoLocal(localId),
      base,
      tieneProductoLocal: plSet.has(`${localId}:${d.productoBaseId}`),
      componentes: d.componentes,
    });
    cuentas.set(r.cat, (cuentas.get(r.cat) || 0) + 1);
    if (r.cat === "ya_congelado") yaCongelados++;
    else if (r.seguro) seguros++;
    else { inseguros++; ambiguos.push({ ventaId: d.ventaId, detalleId: d.id, baseId: d.productoBaseId, nombre: d.nombre, categoria: r.cat, localId }); }
  }

  console.log("\n========== DIAGNÓSTICO BACKFILL CONSUMO (solo lectura) ==========");
  console.log(`Total líneas VentaDetalle: ${total}`);
  console.log(`  · Ya congeladas (nuevas): ${yaCongelados}`);
  console.log(`  · SEGURAS (reconstruibles): ${seguros}`);
  console.log(`  · AMBIGUAS (NO se infieren): ${inseguros}`);
  console.log("\nPor categoría:");
  for (const [cat, n] of [...cuentas.entries()].sort()) {
    const seguro = ["ya_congelado", "sin_stock_servicio", "combo_congelado", "local_directo", "deposito_pieza_directo", "deposito_sin_pack", "deposito_solo_unidad"].includes(cat);
    console.log(`  ${seguro ? "✔ SEGURA " : "✖ AMBIGUA"}  ${cat.padEnd(34)} ${n}`);
  }

  if (ambiguos.length) {
    console.log("\nCasos AMBIGUOS exactos (venta / detalle / producto / categoría):");
    for (const a of ambiguos) {
      console.log(`  venta#${a.ventaId} detalle#${a.detalleId} base#${a.baseId} "${a.nombre}" [${a.categoria}] local=${a.localId}`);
    }
    console.log("\n⚠ Estos casos NO se backfillean automáticamente (no se infiere el consumo).");
    console.log("  Requieren corrección manual o migración de datos con revisión humana antes de Fase B.");
  } else {
    console.log("\nSin casos ambiguos.");
  }

  await prisma.$disconnect();
}

run().catch(async (e) => { console.error("DIAGNÓSTICO ERROR:", e); await prisma.$disconnect(); process.exit(1); });
