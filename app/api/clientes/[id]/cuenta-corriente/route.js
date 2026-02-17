import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function GET(req, context) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const perm = checkPerm(scope.session, "clientes.cc.ver");
    if (!perm.ok) {
      return NextResponse.json(
        { ok: false, error: perm.error },
        { status: perm.status }
      );
    }

    const { grupoId, localId } = scope;
    const { id } = await context.params;
    const clienteId = Number(id);

    if (!clienteId || Number.isNaN(clienteId)) {
      return NextResponse.json(
        { ok: false, error: "ID de cliente inválido" },
        { status: 400 }
      );
    }

    // Paginación
    const { searchParams } = new URL(req.url);
    const takeRaw = Number(searchParams.get("take") || 200);
    const take = Math.min(Math.max(takeRaw || 200, 1), 200);
    const cursorRaw = searchParams.get("cursor");
    const cursor = cursorRaw ? Number(cursorRaw) : null;

    // Verificar que el cliente pertenece al scope
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, grupoId, localId },
    });

    if (!cliente) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    // Saldo global (no paginado)
    const agg = await prisma.movimientoCuenta.groupBy({
      by: ["direccion"],
      where: { clienteId, localId, grupoId },
      _sum: { monto: true },
    });

    let debitos = 0;
    let creditos = 0;
    for (const row of agg) {
      const val = Number(row._sum.monto || 0);
      if (row.direccion === "DEBITO") debitos = val;
      else if (row.direccion === "CREDITO") creditos = val;
    }
    const saldo = debitos - creditos;

    // Movimientos paginados
    const where = { clienteId, localId, grupoId };
    if (cursor) where.id = { lt: cursor };

    const rows = await prisma.movimientoCuenta.findMany({
      where,
      orderBy: { id: "desc" },
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? slice[slice.length - 1].id : null;

    const items = slice.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      direccion: m.direccion,
      monto: Number(m.monto),
      ventaId: m.ventaId,
      nota: m.nota,
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json({ ok: true, saldo, items, hasMore, nextCursor });
  } catch (error) {
    console.error("Error obteniendo cuenta corriente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
