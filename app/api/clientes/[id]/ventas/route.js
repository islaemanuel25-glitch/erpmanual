import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req, context) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const clienteId = Number(id);

    if (!clienteId || Number.isNaN(clienteId)) {
      return NextResponse.json(
        { ok: false, error: "ID de cliente inválido" },
        { status: 400 }
      );
    }

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId } = scope;

    // Paginación
    const { searchParams } = new URL(req.url);
    const takeRaw = Number(searchParams.get("take") || 100);
    const take = Math.min(Math.max(takeRaw || 100, 1), 200);
    const cursorRaw = searchParams.get("cursor");
    const cursor = cursorRaw ? Number(cursorRaw) : null;

    // Verificar que el cliente pertenece al localId del usuario
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: clienteId,
        grupoId,
        localId,
      },
    });

    if (!cliente) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    // Ventas paginadas
    const where = { clienteId, localId };
    if (cursor) where.id = { lt: cursor };

    const rows = await prisma.venta.findMany({
      where,
      include: {
        local: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy: { id: "desc" },
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? slice[slice.length - 1].id : null;

    const items = slice.map((v) => ({
      id: v.id,
      fecha: v.fecha.toISOString(),
      numero: v.numero,
      total: Number(v.total),
      localId: v.localId,
      localNombre: v.local?.nombre || "-",
    }));

    return NextResponse.json({
      ok: true,
      items,
      total: items.length,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error("Error obteniendo ventas del cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
