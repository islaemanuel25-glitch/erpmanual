/**
 * Diagnóstico / migración de stock de FIAMBRE FIJO por pieza (kg → piezas).
 *
 * CONTEXTO
 * --------
 * El stock operativo del DEPÓSITO para fiambre fijo por pieza pasó a contarse
 * en PIEZAS (antes en kg). Recepción suma piezas, POS y envío descuentan piezas,
 * y el LOCAL sigue en kg (no se toca). Los datos viejos del depósito están en kg
 * y hay que dividirlos por pesoReferenciaKg para pasarlos a piezas.
 *
 * Producto fiambre fijo = unidad_medida "kg" + modoCompraProveedor "UNIDAD" +
 *   pesoReferenciaKg > 0 + (pesoEsFijo = true  ó  modoVentaDeposito = "PIEZA").
 *
 * USO
 * ---
 *   node scripts/diagnostico-fiambre-piezas.js            → SOLO diagnóstico (no escribe)
 *   node scripts/diagnostico-fiambre-piezas.js --migrar   → muestra plan de migración (no escribe)
 *   node scripts/diagnostico-fiambre-piezas.js --migrar --apply
 *                                                         → APLICA la conversión kg→piezas
 *
 * La migración SOLO toca StockLocal de locales con es_deposito = true, y SOLO
 * de productos fiambre fijo. Divide cantidad, stockMin y stockMax por
 * pesoReferenciaKg (redondeo al entero más cercano). Los locales NO se tocan.
 *
 * ⚠️  Correr el diagnóstico y revisarlo ANTES de migrar. La conversión es
 *     irreversible sin backup. Hacé backup de la base antes de --apply.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const MIGRAR = args.includes("--migrar");
const APPLY = args.includes("--apply");

function esFiambreFijo(b) {
  const um = (b.unidad_medida || "").toLowerCase();
  const modo = b.modoCompraProveedor || "";
  const peso = Number(b.pesoReferenciaKg ?? 0);
  if (!(um === "kg" && modo === "UNIDAD" && peso > 0)) return false;
  if (b.modoVentaDeposito) return b.modoVentaDeposito === "PIEZA";
  return b.pesoEsFijo === true;
}

function r2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function main() {
  console.log("🔎 Diagnóstico fiambre fijo (stock depósito kg → piezas)");
  console.log("=".repeat(64));
  if (MIGRAR) {
    console.log(APPLY ? "MODO: MIGRACIÓN — APLICANDO CAMBIOS ⚠️" : "MODO: MIGRACIÓN — DRY-RUN (no escribe)");
  } else {
    console.log("MODO: SOLO DIAGNÓSTICO (no escribe)");
  }
  console.log("");

  // Depósitos
  const depositos = await prisma.local.findMany({
    where: { es_deposito: true },
    select: { id: true, nombre: true },
  });
  const depositoIds = depositos.map((d) => d.id);
  const depNombre = new Map(depositos.map((d) => [d.id, d.nombre]));

  if (!depositoIds.length) {
    console.log("No hay locales con es_deposito = true. Nada que diagnosticar.");
    return;
  }

  // Bases candidatas (filtro grueso en DB; el fino con esFiambreFijo en JS)
  const bases = await prisma.productoBase.findMany({
    where: {
      unidad_medida: "kg",
      modoCompraProveedor: "UNIDAD",
      pesoReferenciaKg: { gt: 0 },
    },
    select: {
      id: true,
      nombre: true,
      unidad_medida: true,
      modoCompraProveedor: true,
      modoVentaDeposito: true,
      pesoReferenciaKg: true,
      pesoEsFijo: true,
    },
  });

  const fijas = bases.filter(esFiambreFijo);
  console.log(`Productos fiambre fijo detectados: ${fijas.length}`);
  console.log("");

  const filas = [];
  const planMigracion = [];

  for (const b of fijas) {
    const pesoRef = Number(b.pesoReferenciaKg);
    const locales = await prisma.productoLocal.findMany({
      where: { baseId: b.id, localId: { in: depositoIds } },
      select: {
        id: true,
        localId: true,
        stock: { select: { cantidad: true, stockMin: true, stockMax: true } },
      },
    });

    for (const pl of locales) {
      const st = pl.stock?.[0];
      if (!st) continue;
      const stock = Number(st.cantidad || 0);
      const posiblePiezasSiKg = r2(stock / pesoRef);
      const esEntero = Math.abs(stock - Math.round(stock)) < 1e-6;
      const multiploExacto = pesoRef > 0 && Math.abs(stock % pesoRef) < 1e-6;

      // Clasificación (sin excluir negativos):
      //  - pesoRef <= 1     → kg == piezas, no hay conversión.
      //  - stock == 0       → nada que convertir.
      //  - NO entero        → está en KG (las piezas son enteras) → DIVIDIR.
      //  - entero múltiplo de pesoRef (|stock| >= pesoRef) → PROBABLE KG → DIVIDIR.
      //  - entero chico (|stock| < pesoRef) → PROBABLE YA EN PIEZAS → revisar.
      //  - resto            → AMBIGUO → revisar manual.
      let clase;
      if (Math.abs(pesoRef - 1) < 1e-9 || stock === 0) clase = "SIN_CAMBIO";
      else if (!esEntero) clase = "EN_KG";
      else if (multiploExacto && Math.abs(stock) >= pesoRef) clase = "PROBABLE_KG";
      else if (Math.abs(stock) < pesoRef) clase = "PROBABLE_PIEZAS";
      else clase = "AMBIGUO";

      const migrar = clase === "EN_KG" || clase === "PROBABLE_KG";

      filas.push({
        baseId: b.id,
        nombre: b.nombre,
        deposito: depNombre.get(pl.localId) || pl.localId,
        stockActual: stock,
        pesoRef,
        siEsPiezas_kg: r2(stock * pesoRef),
        siEsKg_piezas: posiblePiezasSiKg,
        clase,
        accion: migrar ? "→ dividir" : "(revisar)",
      });

      if (migrar) {
        planMigracion.push({
          stockLocalProductoId: pl.id,
          localId: pl.localId,
          baseId: b.id,
          nombre: b.nombre,
          pesoRef,
          antes: { cantidad: stock, stockMin: Number(st.stockMin || 0), stockMax: Number(st.stockMax || 0) },
          despues: {
            cantidad: Math.round(stock / pesoRef),
            stockMin: Math.round(Number(st.stockMin || 0) / pesoRef),
            stockMax: Math.round(Number(st.stockMax || 0) / pesoRef),
          },
        });
      }
    }
  }

  if (!filas.length) {
    console.log("No hay StockLocal de fiambre fijo en depósitos. Nada que migrar.");
    return;
  }

  console.table(filas);

  console.log("");
  console.log(`Filas a convertir (clase EN_KG / PROBABLE_KG): ${planMigracion.length}`);
  console.log("Las clases PROBABLE_PIEZAS / AMBIGUO NO se migran: revisá el stock físico real.");

  if (!MIGRAR) {
    console.log("");
    console.log("➡️  Revisá la columna 'clase'. Para ver el plan de conversión (EN_KG/PROBABLE_KG):");
    console.log("    node scripts/diagnostico-fiambre-piezas.js --migrar");
    return;
  }

  console.log("");
  console.log("PLAN DE MIGRACIÓN (kg → piezas, solo depósito):");
  console.table(
    planMigracion.map((p) => ({
      nombre: p.nombre,
      pesoRef: p.pesoRef,
      "cant: kg→pzs": `${p.antes.cantidad} → ${p.despues.cantidad}`,
      "min: kg→pzs": `${p.antes.stockMin} → ${p.despues.stockMin}`,
      "max: kg→pzs": `${p.antes.stockMax} → ${p.despues.stockMax}`,
    }))
  );

  if (!APPLY) {
    console.log("");
    console.log("DRY-RUN: no se escribió nada. Para APLICAR (irreversible, hacé backup):");
    console.log("    node scripts/diagnostico-fiambre-piezas.js --migrar --apply");
    return;
  }

  console.log("");
  console.log("⚠️  Aplicando conversión...");
  let n = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of planMigracion) {
      await tx.stockLocal.update({
        where: {
          localId_productoId: { localId: p.localId, productoId: p.stockLocalProductoId },
        },
        data: {
          cantidad: p.despues.cantidad,
          stockMin: p.despues.stockMin,
          stockMax: p.despues.stockMax,
        },
      });
      n++;
    }
  });
  console.log(`✅ Migración aplicada: ${n} filas de StockLocal convertidas a piezas.`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
