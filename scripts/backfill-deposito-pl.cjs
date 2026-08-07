/**
 * Backfill idempotente: garantiza que todo ProductoBase activo del grupo QUE LE
 * CORRESPONDE AL DEPÓSITO (creado por el depósito o sin creador — Regla A) tenga
 * su ProductoLocal del depósito + StockLocal asociado. NO sube los productos
 * creados por un local: esos existen solo en ese local.
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
 *
 * LA BASE SE DICE, NO SE HEREDA. Antes este script leía el .env por su cuenta,
 * así que sin DATABASE_URL escribía en la base de desarrollo creyendo que estaba
 * bien. Ahora la pide por scripts/lib/clientePrisma.mjs, que aborta si falta.
 * El nivel depende del modo: en dry-run solo lee, con --apply escribe y entonces
 * además exige servidor local.
 *
 *   DATABASE_URL=... node scripts/backfill-deposito-pl.cjs [--apply]
 */
const APPLY = process.argv.includes("--apply");

// Se crea dentro del IIFE: el cliente no existe hasta que la fábrica validó.
let prisma;

// Regla A: para un depósito, "sus" bases son las creadas por él o sin creador;
// se excluyen las creadas por cualquier local no-depósito.
const SOLO_DEPOSITO = { NOT: { creadoEnLocal: { es_deposito: false } } };

async function counts(dep, grupoIds) {
  const [basesActivas, plDeposito, faltantesPL, stockDeposito, plSinStock] = await Promise.all([
    prisma.productoBase.count({ where: { grupoId: { in: grupoIds }, activo: true } }),
    prisma.productoLocal.count({ where: { localId: dep } }),
    prisma.productoBase.count({ where: { grupoId: { in: grupoIds }, activo: true, locales: { none: { localId: dep } }, ...SOLO_DEPOSITO } }),
    prisma.stockLocal.count({ where: { localId: dep } }),
    prisma.productoLocal.count({ where: { localId: dep, stock: { none: {} } } }),
  ]);
  return { basesActivas, plDeposito, faltantesPL, stockDeposito, plSinStock };
}

(async () => {
  const { crearClientePrisma, LECTURA, ESCRITURA } = await import("./lib/clientePrisma.mjs");
  prisma = await crearClientePrisma({ nivel: APPLY ? ESCRITURA : LECTURA });

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
      where: { grupoId: { in: grupoIds }, activo: true, locales: { none: { localId: d.id } }, ...SOLO_DEPOSITO },
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
