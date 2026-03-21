import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";
import { margenPctFromSums } from "@/lib/auditoria-pos-ventas/agregaciones";

export async function GET(req) {
  try {
    const scope = await getAuditoriaScope(req);
    if (!scope.ok) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }

    const rango = parseRangoFechas(req.nextUrl.searchParams);
    if (rango.error) {
      return NextResponse.json({ ok: false, error: rango.error }, { status: 400 });
    }

    const { localId } = scope;
    const where = {
      localId,
      fecha: { gte: rango.fechaInicio, lte: rango.fechaFin },
    };

    const agg = await prisma.venta.aggregate({
      where,
      _sum: {
        total: true,
        comisionBancaria: true,
        netoRecibido: true,
        costoTotal: true,
        gananciaNeta: true,
      },
    });

    const sumTotal = Number(agg._sum.total ?? 0);
    const sumComision = Number(agg._sum.comisionBancaria ?? 0);
    const sumNeto = Number(agg._sum.netoRecibido ?? 0);
    const sumCosto = Number(agg._sum.costoTotal ?? 0);
    const sumGn = Number(agg._sum.gananciaNeta ?? 0);

    const margenPct = margenPctFromSums(sumGn, sumNeto);

    return NextResponse.json({
      ok: true,
      resumen: {
        ventaBruta: sumTotal,
        comisionTotal: sumComision,
        netoRecibido: sumNeto,
        costoVendido: sumCosto,
        gananciaNeta: sumGn,
        margenPct: margenPct === null ? null : Number(margenPct.toFixed(4)),
      },
    });
  } catch (e) {
    console.error("auditoria-pos-ventas/resumen:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
