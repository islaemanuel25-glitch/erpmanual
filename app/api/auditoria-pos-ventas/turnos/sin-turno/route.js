import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";

/**
 * GET /api/auditoria-pos-ventas/turnos/sin-turno?fechaDesde=...&fechaHasta=...
 *
 * Devuelve ventas huérfanas (turnoId IS NULL) en el rango para el local activo.
 * Incluye count + listado con datos mínimos para auditoría.
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

    const rango = parseRangoFechas(req.nextUrl.searchParams);
    if (rango.error) {
      return NextResponse.json({ ok: false, error: rango.error }, { status: 400 });
    }

    const { localId } = scope;
    const { fechaInicio, fechaFin } = rango;

    const where = {
      localId,
      turnoId: null,
      fecha: { gte: fechaInicio, lte: fechaFin },
    };

    const [count, ventas] = await Promise.all([
      prisma.venta.count({ where }),
      prisma.venta.findMany({
        where,
        orderBy: { fecha: "desc" },
        take: 100,
        select: {
          id: true,
          numero: true,
          fecha: true,
          total: true,
          formaPago: true,
          esFiado: true,
          vendedor: { select: { id: true, nombre: true, email: true } },
        },
      }),
    ]);

    const items = ventas.map((v) => ({
      id: v.id,
      numero: v.numero,
      fecha: v.fecha,
      total: Number(v.total),
      formaPago: v.esFiado ? "fiado" : v.formaPago,
      vendedor: v.vendedor,
    }));

    return NextResponse.json({
      ok: true,
      total: count,
      items,
      truncado: count > 100,
    });
  } catch (e) {
    console.error("auditoria-pos-ventas/turnos/sin-turno:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
