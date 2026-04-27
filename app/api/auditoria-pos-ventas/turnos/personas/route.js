import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";

/**
 * GET /api/auditoria-pos-ventas/turnos/personas?fechaDesde=...&fechaHasta=...&turnoId=N
 *
 * Devuelve las personas que vendieron dentro de un turno,
 * con count de tickets, total, comisión, descuento por persona.
 * Si no se pasa turnoId, agrupa por vendedorId a nivel de todo el rango.
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
    const turnoIdParam = req.nextUrl.searchParams.get("turnoId");
    const turnoId = turnoIdParam ? Number(turnoIdParam) : null;

    // Where base
    const where = {
      localId,
      fecha: { gte: fechaInicio, lte: fechaFin },
    };
    if (turnoId) {
      where.turnoId = turnoId;
    }

    // GroupBy vendedorId
    const aggs = await prisma.venta.groupBy({
      by: ["vendedorId"],
      where,
      _count: { id: true },
      _sum: {
        total: true,
        comisionBancaria: true,
        netoRecibido: true,
        costoTotal: true,
        gananciaNeta: true,
        descuento: true,
      },
    });

    if (aggs.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Traer nombres de usuarios
    const vendedorIds = aggs.map((a) => a.vendedorId);
    const usuarios = await prisma.usuario.findMany({
      where: { id: { in: vendedorIds } },
      select: { id: true, nombre: true, email: true },
    });
    const userMap = new Map();
    for (const u of usuarios) {
      userMap.set(u.id, u);
    }

    const items = aggs
      .map((a) => {
        const user = userMap.get(a.vendedorId) || { id: a.vendedorId, nombre: "—", email: "" };
        return {
          vendedorId: a.vendedorId,
          nombre: user.nombre,
          email: user.email,
          tickets: a._count.id,
          totalBruto: Number(a._sum.total ?? 0),
          comision: Number(a._sum.comisionBancaria ?? 0),
          neto: Number(a._sum.netoRecibido ?? 0),
          costo: Number(a._sum.costoTotal ?? 0),
          ganancia: Number(a._sum.gananciaNeta ?? 0),
          descuento: Number(a._sum.descuento ?? 0),
        };
      })
      .sort((a, b) => b.totalBruto - a.totalBruto);

    return NextResponse.json({ ok: true, items, turnoId: turnoId || null });
  } catch (e) {
    console.error("auditoria-pos-ventas/turnos/personas:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
