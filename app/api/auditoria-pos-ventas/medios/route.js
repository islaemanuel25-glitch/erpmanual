import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";
import { bucketMedioPago } from "@/lib/auditoria-pos-ventas/agregaciones";
import { MEDIOS_CONOCIDOS } from "@/lib/auditoria-pos-ventas/constantes";

const ORDEN_FILAS = [...MEDIOS_CONOCIDOS, "otros"];

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

    const ventas = await prisma.venta.findMany({
      where: {
        localId: scope.localId,
        fecha: { gte: rango.fechaInicio, lte: rango.fechaFin },
      },
      select: {
        total: true,
        comisionBancaria: true,
        netoRecibido: true,
        costoTotal: true,
        gananciaNeta: true,
        formaPago: true,
        esFiado: true,
      },
    });

    const map = {};
    for (const k of ORDEN_FILAS) {
      map[k] = { medio: k, bruto: 0, comision: 0, neto: 0, costo: 0, ganancia: 0 };
    }

    for (const v of ventas) {
      const b = bucketMedioPago(v);
      if (!map[b]) {
        map[b] = { medio: b, bruto: 0, comision: 0, neto: 0, costo: 0, ganancia: 0 };
      }
      map[b].bruto += Number(v.total) || 0;
      map[b].comision += Number(v.comisionBancaria) || 0;
      map[b].neto += Number(v.netoRecibido) || 0;
      map[b].costo += Number(v.costoTotal) || 0;
      map[b].ganancia += Number(v.gananciaNeta) || 0;
    }

    const items = ORDEN_FILAS.map((k) => map[k]);

    return NextResponse.json({
      ok: true,
      items,
      nota:
        "Totales desde Venta (persistido). Fiado prioriza esFiado === true.",
    });
  } catch (e) {
    console.error("auditoria-pos-ventas/medios:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
