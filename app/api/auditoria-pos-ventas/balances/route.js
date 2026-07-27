import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope } from "@/lib/auditoria-pos-ventas/scope";
import { margenPctFromSums } from "@/lib/auditoria-pos-ventas/agregaciones";
import { MEDIOS_CONOCIDOS } from "@/lib/auditoria-pos-ventas/constantes";
import { tendersParaAgregar } from "@/lib/pos-ventas/pagos";

const ORDEN_MEDIOS = [...MEDIOS_CONOCIDOS, "otros"];

function parseFecha(str, endOfDay = false) {
  if (!str) return null;
  const TZ = "-03:00";
  return endOfDay
    ? new Date(`${str}T23:59:59.999${TZ}`)
    : new Date(`${str}T00:00:00${TZ}`);
}

async function calcularRango(localId, fechaInicio, fechaFin) {
  const where = { localId, fecha: { gte: fechaInicio, lte: fechaFin } };

  const ventas = await prisma.venta.findMany({
    where,
    select: {
      total: true,
      comisionBancaria: true,
      netoRecibido: true,
      costoTotal: true,
      gananciaNeta: true,
      formaPago: true,
      esFiado: true,
      pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
    },
  });

  let totalTickets = 0;
  let ventaBruta = 0;
  let comision = 0;
  let neto = 0;
  let costo = 0;
  let ganancia = 0;

  const medioMap = {};
  for (const k of ORDEN_MEDIOS) {
    medioMap[k] = { medio: k, bruto: 0, comision: 0, neto: 0, costo: 0, ganancia: 0 };
  }

  for (const v of ventas) {
    const t = Number(v.total) || 0;
    const c = Number(v.comisionBancaria) || 0;
    const n = Number(v.netoRecibido) || 0;
    const co = Number(v.costoTotal) || 0;
    const g = Number(v.gananciaNeta) || 0;

    totalTickets++;
    ventaBruta += t;
    comision += c;
    neto += n;
    costo += co;
    ganancia += g;

    // Desglose por medio POR TENDER (bruto/comisión/neto del pago; costo/ganancia
    // prorrateados por participación). Los totales globales de arriba son de Venta.
    for (const td of tendersParaAgregar(v)) {
      const b = td.medio.toLowerCase();
      if (!medioMap[b]) medioMap[b] = { medio: b, bruto: 0, comision: 0, neto: 0, costo: 0, ganancia: 0 };
      const share = t > 0 ? td.monto / t : 0;
      medioMap[b].bruto += td.monto;
      medioMap[b].comision += td.comision;
      medioMap[b].neto += td.neto;
      medioMap[b].costo += co * share;
      medioMap[b].ganancia += g * share;
    }
  }

  const margenPct = margenPctFromSums(ganancia, neto);
  const ticketPromedio = totalTickets > 0 ? ventaBruta / totalTickets : null;

  const medios = ORDEN_MEDIOS.map((k) => ({
    ...medioMap[k],
    bruto: Number(medioMap[k].bruto.toFixed(2)),
    comision: Number(medioMap[k].comision.toFixed(2)),
    neto: Number(medioMap[k].neto.toFixed(2)),
    costo: Number(medioMap[k].costo.toFixed(2)),
    ganancia: Number(medioMap[k].ganancia.toFixed(2)),
  }));

  return {
    totalTickets,
    ventaBruta: Number(ventaBruta.toFixed(2)),
    comision: Number(comision.toFixed(2)),
    neto: Number(neto.toFixed(2)),
    costo: Number(costo.toFixed(2)),
    ganancia: Number(ganancia.toFixed(2)),
    margenPct: margenPct === null ? null : Number(margenPct.toFixed(4)),
    ticketPromedio: ticketPromedio === null ? null : Number(ticketPromedio.toFixed(2)),
    medios,
  };
}

function calcVariacion(a, b) {
  if (!a || !b) return null;
  const pct = (va, vb) => {
    if (vb === 0) return va === 0 ? 0 : null;
    return Number((((va - vb) / Math.abs(vb)) * 100).toFixed(2));
  };
  return {
    ventaBrutaPct: pct(a.ventaBruta, b.ventaBruta),
    gananciaPct: pct(a.ganancia, b.ganancia),
    ticketsPct: pct(a.totalTickets, b.totalTickets),
    ticketPromedioPct: pct(a.ticketPromedio ?? 0, b.ticketPromedio ?? 0),
  };
}

/**
 * GET /api/auditoria-pos-ventas/balances?fechaDesde=...&fechaHasta=...&fechaDesde2=...&fechaHasta2=...
 *
 * Rango A: obligatorio (fechaDesde, fechaHasta)
 * Rango B: opcional (fechaDesde2, fechaHasta2) — para comparación
 */
export async function GET(req) {
  try {
    const scope = await getAuditoriaScope(req);
    if (!scope.ok) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }

    const sp = req.nextUrl.searchParams;
    const fechaDesde = sp.get("fechaDesde");
    const fechaHasta = sp.get("fechaHasta");

    if (!fechaDesde || !fechaHasta) {
      return NextResponse.json({ ok: false, error: "fechaDesde y fechaHasta son requeridos" }, { status: 400 });
    }

    const { localId } = scope;

    const rangoA = await calcularRango(localId, parseFecha(fechaDesde), parseFecha(fechaHasta, true));

    // Rango B opcional
    const fechaDesde2 = sp.get("fechaDesde2");
    const fechaHasta2 = sp.get("fechaHasta2");
    let rangoB = null;
    let variacion = null;

    if (fechaDesde2 && fechaHasta2) {
      rangoB = await calcularRango(localId, parseFecha(fechaDesde2), parseFecha(fechaHasta2, true));
      variacion = calcVariacion(rangoA, rangoB);
    }

    return NextResponse.json({ ok: true, rangoA, rangoB, variacion });
  } catch (e) {
    console.error("auditoria-pos-ventas/balances:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
