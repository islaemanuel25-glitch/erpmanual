// Harness de integración: REGLA DE RECARGO FIJO POR UNIDAD, extremo a extremo.
//
// Verifica el caso pedido con la base real y el flujo de compras, que es por donde
// se mueve el costo maestro en producción:
//   · bulto 100.000 / factor 10 → unitario 10.000, recargo 100 → venta 101.000;
//   · sube el costo a 150.000 → unitario 15.100 y el recargo guardado SIGUE en 100;
//   · otro local con recargo 200 → 15.200, sin afectar al primero;
//   · una ubicación en modo margen no cambia de comportamiento.
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_term_test?schema=public" \
//   node scripts/integracion-recargo-fijo.mjs

import { PrismaClient } from "@prisma/client";
import { actualizarCostoRealProducto } from "../lib/compras-proveedor/costoMaestro.js";

const url = process.env.DATABASE_URL || "";
if (!/test/i.test(url)) { console.error("ABORT: DATABASE_URL no apunta a *test*."); process.exit(2); }
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };
const n = (v) => (v == null ? null : Number(v));

async function truncateAll() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

const pl = (baseId, localId) => prisma.productoLocal.findFirst({
  where: { baseId, localId },
  select: { id: true, precio_costo: true, precio_venta: true, margen: true, reglaPrecio: true, recargoFijoUnidad: true },
});

async function run() {
  await truncateAll();

  const g = await prisma.grupo.create({ data: { nombre: "G-Recargo" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const a = await prisma.local.create({ data: { nombre: "LocalA", es_deposito: false } });
  const b = await prisma.local.create({ data: { nombre: "LocalB", es_deposito: false } });
  const c = await prisma.local.create({ data: { nombre: "LocalC", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  for (const l of [a, b, c]) await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: l.id } });

  // Producto del depósito: pack de 10, costo de bulto 100.000. Sin redondeo, para que
  // el caso del pedido se lea limpio; el redondeo tiene su propio bloque abajo.
  const base = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "Pack x10", unidad_medida: "pack",
      factor_pack: 10, precio_costo: 100000, precio_venta: 130000, margen: 30, redondeo_100: false },
  });
  const plDepo = await prisma.productoLocal.create({ data: { localId: depo.id, baseId: base.id, precio_costo: 100000, precio_venta: 130000, activo: true } });
  // A: recargo 100. B: recargo 200. C: sigue en margen 30 %.
  await prisma.productoLocal.create({ data: { localId: a.id, baseId: base.id, precio_costo: 100000, activo: true, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: 100 } });
  await prisma.productoLocal.create({ data: { localId: b.id, baseId: base.id, precio_costo: 100000, activo: true, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: 200 } });
  await prisma.productoLocal.create({ data: { localId: c.id, baseId: base.id, precio_costo: 100000, precio_venta: 130000, margen: 30, activo: true } });

  console.log("\n══ Default: todo lo que ya existe queda en MARGEN_PORCENTUAL ══");
  ok("el depósito quedó en margen sin pedirlo", (await pl(base.id, depo.id)).reglaPrecio === "MARGEN_PORCENTUAL");
  ok("el local C quedó en margen", (await pl(base.id, c.id)).reglaPrecio === "MARGEN_PORCENTUAL");

  console.log("\n══ Caso del pedido: costo 100.000 → unitario 10.000 + 100 ══");
  await actualizarCostoRealProducto(prisma, {
    productoLocalId: plDepo.id, costoMaestro: 100000, operadoDesdeLocalId: depo.id, depositoLocalId: depo.id,
  });
  const a1 = await pl(base.id, a.id);
  ok("A: venta 101.000 (10.100 × 10)", n(a1.precio_venta) === 101000, `da ${n(a1.precio_venta)}`);
  ok("A: recargo guardado sigue 100", n(a1.recargoFijoUnidad) === 100);
  const b1 = await pl(base.id, b.id);
  ok("B: venta 102.000 (10.200 × 10)", n(b1.precio_venta) === 102000, `da ${n(b1.precio_venta)}`);
  const c1 = await pl(base.id, c.id);
  ok("C en modo margen: 130.000 (100.000 × 1,30)", n(c1.precio_venta) === 130000, `da ${n(c1.precio_venta)}`);

  console.log("\n══ Sube el costo a 150.000 ══");
  await actualizarCostoRealProducto(prisma, {
    productoLocalId: plDepo.id, costoMaestro: 150000, operadoDesdeLocalId: depo.id, depositoLocalId: depo.id,
  });
  const a2 = await pl(base.id, a.id);
  ok("A: unitario 15.100 → venta 151.000", n(a2.precio_venta) === 151000, `da ${n(a2.precio_venta)}`);
  ok("A: el recargo guardado NO se movió (100)", n(a2.recargoFijoUnidad) === 100, `da ${n(a2.recargoFijoUnidad)}`);
  const b2 = await pl(base.id, b.id);
  ok("B: unitario 15.200 → venta 152.000", n(b2.precio_venta) === 152000, `da ${n(b2.precio_venta)}`);
  ok("B: su recargo tampoco se movió (200)", n(b2.recargoFijoUnidad) === 200);
  ok("A no se vio afectado por el recargo de B", n(a2.recargoFijoUnidad) === 100 && n(a2.precio_venta) === 151000);
  const c2 = await pl(base.id, c.id);
  ok("C en margen: 195.000 (150.000 × 1,30)", n(c2.precio_venta) === 195000, `da ${n(c2.precio_venta)}`);
  ok("C conserva su margen 30", n(c2.margen) === 30);
  ok("el costo llegó a todas las ubicaciones", n(a2.precio_costo) === 150000 && n(b2.precio_costo) === 150000 && n(c2.precio_costo) === 150000);

  console.log("\n══ Con redondeo comercial a 100 ══");
  const base2 = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "Pack x10 redondeo", unidad_medida: "pack",
      factor_pack: 10, precio_costo: 36420, precio_venta: 47346, margen: 30, redondeo_100: true },
  });
  const plDepo2 = await prisma.productoLocal.create({ data: { localId: depo.id, baseId: base2.id, precio_costo: 36420, activo: true } });
  await prisma.productoLocal.create({ data: { localId: a.id, baseId: base2.id, precio_costo: 36420, activo: true, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: 100 } });
  await actualizarCostoRealProducto(prisma, {
    productoLocalId: plDepo2.id, costoMaestro: 36420, operadoDesdeLocalId: depo.id, depositoLocalId: depo.id,
  });
  const r1 = await pl(base2.id, a.id);
  ok("unitario 3.642 + 100 = 3.742 → sube a 3.800 → venta 38.000", n(r1.precio_venta) === 38000, `da ${n(r1.precio_venta)}`);
  ok("el redondeo no infló el recargo guardado (sigue 100)", n(r1.recargoFijoUnidad) === 100, `da ${n(r1.recargoFijoUnidad)}`);

  console.log("\n══ Repetir el cambio de costo no deforma el recargo ══");
  for (const costo of [40000, 45000, 52000]) {
    await actualizarCostoRealProducto(prisma, {
      productoLocalId: plDepo2.id, costoMaestro: costo, operadoDesdeLocalId: depo.id, depositoLocalId: depo.id,
    });
  }
  const r2 = await pl(base2.id, a.id);
  ok("tras tres subas el recargo sigue en 100", n(r2.recargoFijoUnidad) === 100, `da ${n(r2.recargoFijoUnidad)}`);
  ok("y el precio sale del recargo original: 5.200 + 100 = 5.300 → 53.000",
    n(r2.precio_venta) === 53000, `da ${n(r2.precio_venta)}`);

  console.log("\n══ Producto sin pack: el unitario es el costo ══");
  const base3 = await prisma.productoBase.create({
    data: { grupoId: g.id, creadoEnLocalId: depo.id, nombre: "Suelto", unidad_medida: "unidad",
      factor_pack: 1, precio_costo: 5000, precio_venta: 6500, margen: 30, redondeo_100: false },
  });
  const plDepo3 = await prisma.productoLocal.create({ data: { localId: depo.id, baseId: base3.id, precio_costo: 5000, activo: true } });
  await prisma.productoLocal.create({ data: { localId: a.id, baseId: base3.id, precio_costo: 5000, activo: true, reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: 300 } });
  await actualizarCostoRealProducto(prisma, {
    productoLocalId: plDepo3.id, costoMaestro: 8000, operadoDesdeLocalId: depo.id, depositoLocalId: depo.id,
  });
  const s = await pl(base3.id, a.id);
  ok("sin pack: 8.000 + 300 = 8.300", n(s.precio_venta) === 8300, `da ${n(s.precio_venta)}`);
}

run()
  .then(async () => { await prisma.$disconnect(); console.log(`\n== RECARGO-FIJO: ${pass} pass / ${fail} fail ==`); process.exit(fail === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("HARNESS ERROR:", e); await prisma.$disconnect(); process.exit(2); });
