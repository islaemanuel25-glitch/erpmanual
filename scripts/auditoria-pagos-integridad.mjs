// scripts/auditoria-pagos-integridad.mjs
//
// AUDITORÍA (solo lectura) de integridad de VentaPago. NO modifica datos.
// Verifica que la suma de tenders de cada venta == Venta.total, y agrega por
// período/local totales de efectivo/digital/fiado/comisión/neto.
//
// Uso:
//   DATABASE_URL="postgresql://.../erpazul_dev?schema=public" \
//   node scripts/auditoria-pagos-integridad.mjs
//   (opcional) FECHA_DESDE=2026-01-01 FECHA_HASTA=2026-12-31

import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL || "";
if (!url) { console.error("ABORT: falta DATABASE_URL"); process.exit(2); }
const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
let problemas = 0;

async function main() {
  const totalVentas = await prisma.venta.count();
  const totalPagos = await prisma.ventaPago.count();
  console.log(`Ventas: ${totalVentas} · VentaPago: ${totalPagos}`);

  // 1) Ventas SIN ningún tender (deberían ser 0 tras el backfill).
  const sinPago = await prisma.venta.count({ where: { pagos: { none: {} } } });
  if (sinPago > 0) { console.log(`✖ ${sinPago} venta(s) SIN tender VentaPago`); problemas++; }
  else console.log("✔ toda venta tiene al menos un tender");

  // 2) Por venta: Σ tenders.monto == total (comparado en centavos).
  const ventas = await prisma.venta.findMany({
    select: { id: true, numero: true, total: true, formaPago: true, comisionBancaria: true,
      pagos: { select: { monto: true, comision: true, neto: true, medio: true } } },
  });
  let mismatch = 0;
  const bucket = { EFECTIVO: 0, MERCADOPAGO: 0, DEBITO: 0, CREDITO: 0, FIADO: 0 };
  let sumaTotalVentas = 0, sumaTenders = 0, sumaComisionTenders = 0, sumaComisionVenta = 0, sumaNeto = 0;
  for (const v of ventas) {
    const totalCent = Math.round(Number(v.total) * 100);
    const sumCent = v.pagos.reduce((a, p) => a + Math.round(Number(p.monto) * 100), 0);
    sumaTotalVentas += Number(v.total);
    sumaTenders += v.pagos.reduce((a, p) => a + Number(p.monto), 0);
    sumaComisionTenders += v.pagos.reduce((a, p) => a + Number(p.comision), 0);
    sumaComisionVenta += Number(v.comisionBancaria) || 0;
    sumaNeto += v.pagos.reduce((a, p) => a + Number(p.neto), 0);
    for (const p of v.pagos) bucket[p.medio] = (bucket[p.medio] || 0) + Number(p.monto);
    if (v.pagos.length > 0 && sumCent !== totalCent) {
      mismatch++;
      if (mismatch <= 10) console.log(`  ✖ venta #${v.numero}: Σtenders=${(sumCent/100).toFixed(2)} != total=${Number(v.total).toFixed(2)}`);
    }
  }
  if (mismatch > 0) { console.log(`✖ ${mismatch} venta(s) con Σtenders != total`); problemas++; }
  else console.log("✔ en toda venta: Σ tenders.monto == total");

  // 3) Global.
  console.log("\n== Global ==");
  console.log(`Σ Venta.total          = ${round2(sumaTotalVentas)}`);
  console.log(`Σ VentaPago.monto      = ${round2(sumaTenders)}  ${round2(sumaTenders) === round2(sumaTotalVentas) ? "✔" : "✖"}`);
  if (round2(sumaTenders) !== round2(sumaTotalVentas)) problemas++;
  console.log(`Σ Venta.comisionBanc.  = ${round2(sumaComisionVenta)}`);
  console.log(`Σ VentaPago.comision   = ${round2(sumaComisionTenders)}  ${round2(sumaComisionTenders) === round2(sumaComisionVenta) ? "✔" : "≈"}`);
  console.log(`Σ VentaPago.neto       = ${round2(sumaNeto)}`);

  // 4) Buckets por medio.
  console.log("\n== Bruto por medio (desde tenders) ==");
  for (const k of Object.keys(bucket)) console.log(`  ${k.padEnd(12)} = ${round2(bucket[k])}`);
  const sumaBuckets = Object.values(bucket).reduce((a, b) => a + b, 0);
  console.log(`  ${"Σ buckets".padEnd(12)} = ${round2(sumaBuckets)}  ${round2(sumaBuckets) === round2(sumaTotalVentas) ? "✔ == Σ total" : "✖ != Σ total"}`);
  if (round2(sumaBuckets) !== round2(sumaTotalVentas)) problemas++;

  console.log(`\n== ${problemas === 0 ? "INTEGRIDAD OK" : `PROBLEMAS: ${problemas}`} ==`);
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(problemas === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("ERROR:", e); await prisma.$disconnect(); process.exit(2); });
