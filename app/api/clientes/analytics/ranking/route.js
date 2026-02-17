import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId } = scope;
    const { searchParams } = new URL(req.url);

    // Parsear params
    const metric = searchParams.get("metric") || "facturacion";
    if (!["facturacion", "frecuencia"].includes(metric)) {
      return NextResponse.json(
        { ok: false, error: "metric debe ser 'facturacion' o 'frecuencia'" },
        { status: 400 }
      );
    }

    const takeRaw = Number(searchParams.get("take") || 10);
    const take = Math.min(Math.max(takeRaw || 10, 1), 100);

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    const from = fromStr ? new Date(fromStr + "T00:00:00") : defaultFrom;
    const to = toStr ? new Date(toStr + "T23:59:59.999") : now;

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Formato de fecha inválido (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    if (from > to) {
      return NextResponse.json(
        { ok: false, error: "from no puede ser posterior a to" },
        { status: 400 }
      );
    }

    const q = (searchParams.get("q") || "").trim();
    const tagIdParam = searchParams.get("tagId");
    const tagId = tagIdParam ? Number(tagIdParam) : null;

    // Pre-filtrar clienteIds solo si hay filtro real
    let clienteIdFilter = undefined;

    if (q.length >= 2 || (tagId && tagId > 0)) {
      const clienteWhere = { grupoId, localId, activo: true };

      if (q && q.length >= 2) {
        clienteWhere.OR = [
          { nombre: { contains: q, mode: "insensitive" } },
          { telefono: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ];
      }

      if (tagId && tagId > 0) {
        clienteWhere.tags = { some: { tagId } };
      }

      const filtrados = await prisma.cliente.findMany({
        where: clienteWhere,
        select: { id: true },
        take: 500,
      });

      clienteIdFilter = filtrados.map((c) => c.id);

      if (clienteIdFilter.length === 0) {
        return NextResponse.json({
          ok: true,
          metric,
          from: from.toISOString(),
          to: to.toISOString(),
          take,
          items: [],
        });
      }
    }

    // GroupBy ventas
    const ventaWhere = {
      localId,
      clienteId: clienteIdFilter
        ? { in: clienteIdFilter }
        : { not: null },
      fecha: { gte: from, lte: to },
    };

    const grouped = await prisma.venta.groupBy({
      by: ["clienteId"],
      where: ventaWhere,
      _sum: { total: true },
      _count: { id: true },
      _max: { fecha: true },
      orderBy:
        metric === "frecuencia"
          ? { _count: { id: "desc" } }
          : { _sum: { total: "desc" } },
      take,
    });

    if (grouped.length === 0) {
      return NextResponse.json({
        ok: true,
        metric,
        from: from.toISOString(),
        to: to.toISOString(),
        take,
        items: [],
      });
    }

    // Traer datos de clientes
    const clienteIds = grouped.map((g) => g.clienteId);

    const clientes = await prisma.cliente.findMany({
      where: { id: { in: clienteIds }, grupoId, localId },
      select: {
        id: true,
        nombre: true,
        telefono: true,
        email: true,
        tags: {
          include: { tag: { select: { nombre: true } } },
        },
      },
    });

    const clienteMap = new Map();
    for (const c of clientes) {
      clienteMap.set(c.id, c);
    }

    // Armar items en orden del groupBy
    const items = [];
    for (const g of grouped) {
      const c = clienteMap.get(g.clienteId);
      if (!c) continue;

      const totalFacturado = Number(g._sum.total) || 0;
      const cantidadCompras = g._count.id || 0;

      items.push({
        clienteId: c.id,
        nombre: c.nombre,
        telefono: c.telefono || null,
        email: c.email || null,
        totalFacturado,
        cantidadCompras,
        ticketPromedio:
          cantidadCompras > 0
            ? Math.round((totalFacturado / cantidadCompras) * 100) / 100
            : 0,
        ultimaCompraAt: g._max.fecha || null,
        tags: c.tags.map((ct) => ct.tag.nombre),
      });
    }

    return NextResponse.json({
      ok: true,
      metric,
      from: from.toISOString(),
      to: to.toISOString(),
      take,
      items,
    });
  } catch (e) {
    console.error("ERROR clientes/analytics/ranking:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
