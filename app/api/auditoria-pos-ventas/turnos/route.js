import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";

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

    const turnos = await prisma.turno.findMany({
      where: {
        localId,
        apertura: { gte: rango.fechaInicio, lte: rango.fechaFin },
      },
      orderBy: { apertura: "desc" },
      include: {
        vendedor: { select: { id: true, nombre: true, email: true } },
      },
    });

    const turnoIds = turnos.map((t) => t.id);

    const aggs = turnoIds.length > 0
      ? await prisma.venta.groupBy({
          by: ["turnoId"],
          where: {
            localId,
            turnoId: { in: turnoIds },
            fecha: { gte: rango.fechaInicio, lte: rango.fechaFin },
          },
          _count: { id: true },
          _sum: {
            total: true,
            comisionBancaria: true,
            netoRecibido: true,
            costoTotal: true,
            gananciaNeta: true,
          },
        })
      : [];

    const aggMap = new Map();
    for (const a of aggs) {
      aggMap.set(a.turnoId, a);
    }

    const items = turnos.map((t) => {
      const agg = aggMap.get(t.id);
      return {
        id: t.id,
        apertura: t.apertura,
        cierre: t.cierre,
        montoEsperadoEfectivo:
          t.montoEsperadoEfectivo != null ? Number(t.montoEsperadoEfectivo) : null,
        montoRealEfectivo: t.montoRealEfectivo != null ? Number(t.montoRealEfectivo) : null,
        diferenciaEfectivo: t.diferenciaEfectivo != null ? Number(t.diferenciaEfectivo) : null,
        ventasCount: agg?._count?.id ?? 0,
        ventaBruta: Number(agg?._sum?.total ?? 0),
        comision: Number(agg?._sum?.comisionBancaria ?? 0),
        neto: Number(agg?._sum?.netoRecibido ?? 0),
        costo: Number(agg?._sum?.costoTotal ?? 0),
        gananciaTurno: Number(agg?._sum?.gananciaNeta ?? 0),
        vendedor: t.vendedor,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("auditoria-pos-ventas/turnos:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
