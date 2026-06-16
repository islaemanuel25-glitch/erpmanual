/**
 * Backfill idempotente: garantiza que TODO ProductoBase activo del grupo de un
 * depósito tenga su ProductoLocal del depósito + StockLocal asociado.
 *
 * Reemplaza la materialización perezosa que hacía el GET de /api/stock_locales/listar.
 * Es idempotente por las @@unique (ProductoLocal[localId,baseId], StockLocal[localId,productoId])
 * + createMany({ skipDuplicates: true }). No hace update ni borra nada.
 *
 * Uso:
 *   node scripts/backfill-deposito-pl.cjs            -> DRY-RUN (no escribe, solo reporta)
 *   node scripts/backfill-deposito-pl.cjs --apply    -> aplica (createMany skipDuplicates)
 *
 * Sale con exit code != 0 si, tras aplicar, quedan faltantes.
 * Carga DATABASE_URL desde .env sin volcar el archivo.
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
try {
  const envTxt = fs.readFileSync(envPath, "utf8");
  for (const line of envTxt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) {
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
} catch {
  // si no hay .env, se asume DATABASE_URL en el entorno
}

const APPLY = process.argv.includes("--apply");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function counts(dep, grupoIds) {
  const [basesActivas, plDeposito, faltantesPL, stockDeposito, plSinStock] = await Promise.all([
    prisma.productoBase.count({ where: { grupoId: { in: grupoIds }, activo: true } }),
    prisma.productoLocal.count({ where: { localId: dep } }),
    prisma.productoBase.count({ where: { grupoId: { in: grupoIds }, activo: true, locales: { none: { localId: dep } } } }),
    prisma.stockLocal.count({ where: { localId: dep } }),
    prisma.productoLocal.count({ where: { localId: dep, stock: { none: {} } } }),
  ]);
  return { basesActivas, plDeposito, faltantesPL, stockDeposito, plSinStock };
}

(async () => {
  console.log(APPLY ? "MODO: APPLY (escribe con skipDuplicates)" : "MODO: DRY-RUN (no escribe)");
  const deps = await prisma.local.findMany({ where: { es_deposito: true }, select: { id: true, nombre: true } });
  console.log(`Depósitos encontrados: ${deps.length}`);
  let exit = 0;

  for (const d of deps) {
    const grupoIds = (await prisma.grupoDeposito.findMany({ where: { localId: d.id }, select: { grupoId: true } })).map((g) => g.grupoId);
    console.log(`\n=== Depósito ${d.id} "${d.nombre}" | grupos=[${grupoIds.join(",")}] ===`);
    if (!grupoIds.length) { console.log("Sin grupos asignados → skip."); continue; }

    const before = await counts(d.id, grupoIds);
    console.log("ANTES :", JSON.stringify(before));

    if (before.faltantesPL === 0 && before.plSinStock === 0) {
      console.log("✅ Ya completo (no-op).");
      continue;
    }

    if (!APPLY) {
      console.log(`DRY-RUN: crearía ${before.faltantesPL} ProductoLocal + stock para ${before.plSinStock} PL sin StockLocal. (correr con --apply)`);
      continue;
    }

    // A) ProductoLocal faltantes del depósito
    const faltantes = await prisma.productoBase.findMany({
      where: { grupoId: { in: grupoIds }, activo: true, locales: { none: { localId: d.id } } },
      select: { id: true, precio_costo: true, precio_venta: true, margen: true, activo: true },
    });
    if (faltantes.length) {
      const r = await prisma.productoLocal.createMany({
        data: faltantes.map((b) => ({ localId: d.id, baseId: b.id, precio_costo: b.precio_costo, precio_venta: b.precio_venta, margen: b.margen, activo: b.activo })),
        skipDuplicates: true,
      });
      console.log(`  ProductoLocal creados: ${r.count}`);
    }

    // B) StockLocal para PL del depósito sin stock
    const sinStock = await prisma.productoLocal.findMany({ where: { localId: d.id, stock: { none: {} } }, select: { id: true } });
    if (sinStock.length) {
      const r2 = await prisma.stockLocal.createMany({
        data: sinStock.map((pl) => ({ localId: d.id, productoId: pl.id, cantidad: "0", stockMin: null, stockMax: null })),
        skipDuplicates: true,
      });
      console.log(`  StockLocal creados: ${r2.count}`);
    }

    const after = await counts(d.id, grupoIds);
    console.log("DESPUÉS:", JSON.stringify(after));
    if (after.faltantesPL !== 0 || after.plSinStock !== 0) {
      console.error(`❌ FALLO: quedan faltantesPL=${after.faltantesPL} plSinStock=${after.plSinStock}`);
      exit = 1;
    } else {
      console.log("✅ OK: 0 faltantes.");
    }
  }

  await prisma.$disconnect();
  process.exit(exit);
})().catch(async (e) => {
  console.error("FATAL", e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
