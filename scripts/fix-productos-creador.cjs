/**
 * Corrección puntual de los productos creados por locales por error (Regla A).
 * SE CORRE ANTES que entren los filtros de visibilidad: si los filtros entran
 * primero, los productos de local que el depósito ya usa desaparecen de golpe
 * de su stock. Corrigiéndolos primero pasan a ser del depósito legítimamente.
 *
 * Dos operaciones, configurables por nombre de local:
 *   - RECLASIFICAR_A_DEPOSITO: productos creados por ese local pasan a ser del
 *     depósito (creadoEnLocalId = depósito) y se materializa ProductoLocal +
 *     StockLocal en depósito + todos los locales del grupo.
 *   - QUITAR_DEL_DEPOSITO: productos propios de ese local — se borra su
 *     ProductoLocal + StockLocal del DEPÓSITO (solo si es cáscara: sin stock,
 *     sin pedidos a proveedor, sin transferencias). Si está en uso, se SALTEA.
 *
 * Uso:
 *   node scripts/fix-productos-creador.cjs           -> DRY-RUN (no escribe)
 *   node scripts/fix-productos-creador.cjs --apply    -> aplica
 *
 * NO se corre contra producción hasta autorización explícita.
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
} catch {}

const APPLY = process.argv.includes("--apply");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ── CONFIG (por nombre de local, no-depósito) ──────────────────────────────
const RECLASIFICAR_A_DEPOSITO = ["mini el 7"];   // eran de depósito, creados por error
const QUITAR_DEL_DEPOSITO = ["Casiano casas"];    // propios del local, no van al depósito
// ───────────────────────────────────────────────────────────────────────────

async function ctxDeLocal(localId) {
  const gl = await prisma.grupoLocal.findFirst({ where: { localId }, select: { grupoId: true } });
  const grupoId = gl?.grupoId;
  if (!grupoId) return null;
  const gd = await prisma.grupoDeposito.findFirst({ where: { grupoId }, select: { localId: true } });
  const localesGrupo = await prisma.grupoLocal.findMany({ where: { grupoId }, select: { localId: true } });
  return { grupoId, depositoId: gd?.localId ?? null, localIds: localesGrupo.map((l) => l.localId) };
}

async function enUsoEnDeposito(plId) {
  const [stock, ped, tr, pos] = await Promise.all([
    prisma.stockLocal.findFirst({ where: { productoId: plId, cantidad: { not: 0 } }, select: { id: true } }),
    prisma.pedidoProveedorDetalle.findFirst({ where: { productoLocalId: plId }, select: { id: true } }),
    prisma.transferenciaDetalle.findFirst({ where: { productoId: plId }, select: { id: true } }),
    prisma.posTransferenciaDetalle.findFirst({ where: { productoId: plId }, select: { id: true } }),
  ]);
  return Boolean(stock || ped || tr || pos);
}

(async () => {
  console.log(APPLY ? "MODO: APPLY (escribe)" : "MODO: DRY-RUN (no escribe)");
  let reclasificados = 0, materializados = 0, quitados = 0, salteados = 0;

  try {
    // ── RECLASIFICAR_A_DEPOSITO ──
    for (const nombre of RECLASIFICAR_A_DEPOSITO) {
      const local = await prisma.local.findFirst({ where: { nombre, es_deposito: false }, select: { id: true, nombre: true } });
      if (!local) { console.log(`⚠️  Local no encontrado (no-depósito): "${nombre}" — se saltea`); continue; }
      const ctx = await ctxDeLocal(local.id);
      if (!ctx?.depositoId) { console.log(`⚠️  Sin depósito para el grupo de "${nombre}" — se saltea`); continue; }

      const bases = await prisma.productoBase.findMany({
        where: { creadoEnLocalId: local.id },
        select: { id: true, nombre: true, precio_costo: true, precio_venta: true, margen: true, activo: true },
      });
      console.log(`\n=== RECLASIFICAR "${local.nombre}" (id ${local.id}) → depósito ${ctx.depositoId} : ${bases.length} productos ===`);
      for (const b of bases) console.log(`  [${b.id}] ${b.nombre}`);

      if (APPLY && bases.length) {
        const baseIds = bases.map((b) => b.id);
        await prisma.productoBase.updateMany({ where: { id: { in: baseIds } }, data: { creadoEnLocalId: ctx.depositoId } });
        reclasificados += baseIds.length;
        // Materializar PL + Stock en depósito + todos los locales del grupo.
        const localIds = [...new Set([ctx.depositoId, ...ctx.localIds])];
        for (const b of bases) {
          await prisma.productoLocal.createMany({
            data: localIds.map((lid) => ({ localId: lid, baseId: b.id, precio_costo: b.precio_costo, precio_venta: b.precio_venta, margen: b.margen, activo: b.activo })),
            skipDuplicates: true,
          });
          const pls = await prisma.productoLocal.findMany({ where: { baseId: b.id, localId: { in: localIds } }, select: { id: true, localId: true } });
          const r = await prisma.stockLocal.createMany({
            data: pls.map((pl) => ({ localId: pl.localId, productoId: pl.id, cantidad: "0", stockMin: null, stockMax: null })),
            skipDuplicates: true,
          });
          materializados += r.count;
        }
      }
    }

    // ── QUITAR_DEL_DEPOSITO ──
    for (const nombre of QUITAR_DEL_DEPOSITO) {
      const local = await prisma.local.findFirst({ where: { nombre, es_deposito: false }, select: { id: true, nombre: true } });
      if (!local) { console.log(`⚠️  Local no encontrado (no-depósito): "${nombre}" — se saltea`); continue; }
      const ctx = await ctxDeLocal(local.id);
      if (!ctx?.depositoId) { console.log(`⚠️  Sin depósito para el grupo de "${nombre}" — se saltea`); continue; }

      const bases = await prisma.productoBase.findMany({ where: { creadoEnLocalId: local.id }, select: { id: true, nombre: true } });
      console.log(`\n=== QUITAR DEL DEPÓSITO ${ctx.depositoId} los productos de "${local.nombre}" (id ${local.id}) : ${bases.length} productos ===`);
      for (const b of bases) {
        const pl = await prisma.productoLocal.findFirst({ where: { localId: ctx.depositoId, baseId: b.id }, select: { id: true } });
        if (!pl) { console.log(`  [${b.id}] ${b.nombre} — sin PL en depósito (nada que hacer)`); continue; }
        const usado = await enUsoEnDeposito(pl.id);
        if (usado) {
          console.log(`  [${b.id}] ${b.nombre} — ⚠️  EN USO en el depósito → NO se borra (revisar a mano)`);
          salteados++;
          continue;
        }
        console.log(`  [${b.id}] ${b.nombre} — cáscara → se borra PL+Stock del depósito`);
        if (APPLY) {
          await prisma.stockLocal.deleteMany({ where: { productoId: pl.id } });
          await prisma.productoLocal.delete({ where: { id: pl.id } });
          quitados++;
        }
      }
    }

    console.log(`\n==== RESUMEN ${APPLY ? "(aplicado)" : "(dry-run)"} ====`);
    console.log(`Reclasificados a depósito: ${reclasificados} | PL+Stock materializados: ${materializados}`);
    console.log(`Quitados del depósito: ${quitados} | Salteados por estar en uso: ${salteados}`);
    if (!APPLY) console.log("(correr con --apply para aplicar)");
  } catch (e) {
    console.error("ERROR:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
