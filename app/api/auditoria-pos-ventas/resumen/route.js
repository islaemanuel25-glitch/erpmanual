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
      _count: { id: true },
      _sum: {
        total: true,
        comisionBancaria: true,
        netoRecibido: true,
        costoTotal: true,
        gananciaNeta: true,
      },
    });

    const totalTickets = agg._count.id;
    const sumTotal = Number(agg._sum.total ?? 0);
    const sumComision = Number(agg._sum.comisionBancaria ?? 0);
    const sumNeto = Number(agg._sum.netoRecibido ?? 0);
    const sumCosto = Number(agg._sum.costoTotal ?? 0);
    const sumGn = Number(agg._sum.gananciaNeta ?? 0);

    // ¿ALGUNA DE ESTAS VENTAS SE COBRÓ SIN LA COMISIÓN CONFIGURADA?
    //
    // Si la hay, los tres totales financieros de abajo —comisión, neto y
    // ganancia— suman ceros estructurales junto con mediciones, así que el
    // margen deja de poder afirmarse y el conjunto sale rotulado como parcial.
    // No se saltean esas ventas: sacarlas daría un número más chico e igual de
    // falso, y encima sin avisar.
    const pendientes = await prisma.venta.count({ where: { ...where, comisionPendiente: true } });
    const parcial = pendientes > 0;

    const margenPct = margenPctFromSums(sumGn, sumNeto, { parcial });
    const ticketPromedio = totalTickets > 0 ? sumTotal / totalTickets : null;

    return NextResponse.json({
      ok: true,
      resumen: {
        totalTickets,
        ventaBruta: sumTotal,
        comisionTotal: sumComision,
        netoRecibido: sumNeto,
        costoVendido: sumCosto,
        gananciaNeta: sumGn,
        margenPct: margenPct === null ? null : Number(margenPct.toFixed(4)),
        ticketPromedio: ticketPromedio === null ? null : Number(ticketPromedio.toFixed(2)),
        // Lo que la pantalla necesita para no presentar los totales como
        // cerrados. `ventasPendientes` va además del booleano porque decir
        // "3 ventas sin comisión configurada" es accionable y "parcial" no.
        comisionParcial: parcial,
        ventasPendientes: pendientes,
      },
    });
  } catch (e) {
    console.error("auditoria-pos-ventas/resumen:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
