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
    const diasRaw = Number(searchParams.get("dias") || 60);
    const dias = Math.min(Math.max(diasRaw || 60, 1), 3650);

    const takeRaw = Number(searchParams.get("take") || 50);
    const take = Math.min(Math.max(takeRaw || 50, 1), 200);

    const modo = searchParams.get("modo") || "conCompras";
    if (!["conCompras", "incluyeNunca"].includes(modo)) {
      return NextResponse.json(
        { ok: false, error: "modo debe ser 'conCompras' o 'incluyeNunca'" },
        { status: 400 }
      );
    }

    const q = (searchParams.get("q") || "").trim();
    const tagIdParam = searchParams.get("tagId");
    const tagId = tagIdParam ? Number(tagIdParam) : null;

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - dias);

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
        take: 1000,
      });

      clienteIdFilter = new Set(filtrados.map((c) => c.id));

      if (clienteIdFilter.size === 0) {
        return NextResponse.json({
          ok: true,
          modo,
          dias,
          take,
          items: [],
        });
      }
    }

    const items = [];

    // Parte 1: Clientes con compras pero inactivos (última compra < cutoff)
    // Limitar groupBy para evitar scan gigante: traer batch amplio ordenado por
    // fecha más antigua primero, luego filtrar en memoria por cutoff.
    const groupByTake = Math.min(Math.max(take * 20, 200), 5000);

    const grouped = await prisma.venta.groupBy({
      by: ["clienteId"],
      where: {
        localId,
        clienteId: clienteIdFilter
          ? { in: [...clienteIdFilter] }
          : { not: null },
      },
      _max: { fecha: true },
      orderBy: { _max: { fecha: "asc" } },
      take: groupByTake,
    });

    // Filtrar los que tienen última compra antes del cutoff
    const inactivosConCompra = grouped.filter(
      (g) => g._max.fecha && new Date(g._max.fecha) < cutoff
    );

    // IDs de inactivos con compra (ya viene ordenado por fecha asc)
    const idsConCompra = inactivosConCompra.map((g) => g.clienteId).slice(0, take);

    // Parte 2: Clientes sin compras nunca (solo modo incluyeNunca)
    let idsSinCompra = [];

    if (modo === "incluyeNunca") {
      const sinCompraWhere = {
        grupoId,
        localId,
        activo: true,
        ventas: { none: {} },
      };

      if (clienteIdFilter) {
        sinCompraWhere.id = { in: [...clienteIdFilter] };
      }

      const sinCompra = await prisma.cliente.findMany({
        where: sinCompraWhere,
        select: { id: true },
        take: take,
        orderBy: { createdAt: "asc" },
      });

      idsSinCompra = sinCompra.map((c) => c.id);
    }

    // Combinar IDs y limitar
    const todosIds = [...idsConCompra, ...idsSinCompra].slice(0, take);

    if (todosIds.length === 0) {
      return NextResponse.json({
        ok: true,
        modo,
        dias,
        take,
        items: [],
      });
    }

    // Traer datos de clientes
    const clientes = await prisma.cliente.findMany({
      where: { id: { in: todosIds }, grupoId, localId },
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

    // Mapa de última compra
    const ultimaCompraMap = new Map();
    for (const g of inactivosConCompra) {
      ultimaCompraMap.set(g.clienteId, g._max.fecha);
    }

    // Armar items en orden
    for (const id of todosIds) {
      const c = clienteMap.get(id);
      if (!c) continue;

      const ultimaCompraAt = ultimaCompraMap.get(id) || null;
      let diasInactivo = null;

      if (ultimaCompraAt) {
        diasInactivo = Math.floor(
          (now.getTime() - new Date(ultimaCompraAt).getTime()) /
            (1000 * 60 * 60 * 24)
        );
      }

      items.push({
        clienteId: c.id,
        nombre: c.nombre,
        telefono: c.telefono || null,
        email: c.email || null,
        ultimaCompraAt,
        diasInactivo,
        tags: c.tags.map((ct) => ct.tag.nombre),
      });
    }

    return NextResponse.json({
      ok: true,
      modo,
      dias,
      take,
      items,
    });
  } catch (e) {
    console.error("ERROR clientes/analytics/inactivos:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
