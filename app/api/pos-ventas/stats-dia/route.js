import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { getRangoArgentina, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos.usar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // Scope autorizado: no-admin → su local (localId ajeno del query → 403);
    // admin → contexto. Antes confiaba en el localId crudo del query.
    const scope = await resolveScope(req, {
      explicitLocalId: req.nextUrl.searchParams.get("localId"),
    });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const localId = scope.localId;

    // Ventas del día en hora Argentina (mismo rango que historial-dia). El
    // contenedor corre en UTC; usar el día ART evita el vaciado nocturno.
    const fechaHoy = hoyArgentinaISO();
    const { fechaInicio, fechaFin } = getRangoArgentina(fechaHoy, fechaHoy);

    // Cantidad de ventas y total
    const agg = await prisma.venta.aggregate({
      where: whereVentaComercial({
        localId,
        fecha: { gte: fechaInicio, lte: fechaFin },
      }),
      _count: { id: true },
      _sum: { total: true },
    });

    // Items vendidos
    const itemsAgg = await prisma.ventaDetalle.aggregate({
      where: {
        venta: whereVentaComercial({
          localId,
          fecha: { gte: fechaInicio, lte: fechaFin },
        }),
      },
      _sum: { cantidad: true },
    });

    return NextResponse.json({
      ok: true,
      stats: {
        ventas: agg._count.id || 0,
        total: Number(agg._sum.total) || 0,
        items: Number(itemsAgg._sum.cantidad) || 0,
      },
    });
  } catch (error) {
    console.error("Error stats dia:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
