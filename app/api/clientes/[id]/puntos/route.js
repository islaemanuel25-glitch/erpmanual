import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

// GET /api/clientes/[id]/puntos?localId=...
export async function GET(req, context) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const perm = checkPerm(scope.session, "clientes.puntos.ver");
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
    const takeRaw = Number(searchParams.get("take") || 50);
    const take = Math.min(Math.max(takeRaw || 50, 1), 200);
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

    // Leer config de puntos del local
    const config = await prisma.puntosConfigLocal.findFirst({
      where: { localId },
    });

    if (!config || !config.activo) {
      return NextResponse.json({
        ok: true,
        saldo: 0,
        items: [],
        hasMore: false,
        nextCursor: null,
        activo: false,
        config: null,
      });
    }

    // Saldo global (no paginado)
    const agg = await prisma.clientePuntoMovimiento.groupBy({
      by: ["direccion"],
      where: { clienteId, localId, grupoId },
      _sum: { puntos: true },
    });

    let creditos = 0;
    let debitos = 0;
    for (const row of agg) {
      const val = Number(row._sum.puntos || 0);
      if (row.direccion === "CREDITO") creditos = val;
      else if (row.direccion === "DEBITO") debitos = val;
    }
    const saldo = creditos - debitos;

    // Movimientos paginados
    const where = { clienteId, localId, grupoId };
    if (cursor) where.id = { lt: cursor };

    const rows = await prisma.clientePuntoMovimiento.findMany({
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
      puntos: m.puntos,
      ventaId: m.ventaId,
      nota: m.nota,
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      saldo,
      items,
      hasMore,
      nextCursor,
      activo: true,
      config: { redencionJson: config.redencionJson },
    });
  } catch (error) {
    console.error("Error obteniendo puntos:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// POST /api/clientes/[id]/puntos (canjear puntos)
export async function POST(req, context) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const perm = checkPerm(scope.session, "clientes.puntos.canjear");
    if (!perm.ok) {
      return NextResponse.json(
        { ok: false, error: perm.error },
        { status: perm.status }
      );
    }

    const { grupoId, localId, session } = scope;
    const { id } = await context.params;
    const clienteId = Number(id);

    if (!clienteId || Number.isNaN(clienteId)) {
      return NextResponse.json(
        { ok: false, error: "ID de cliente inválido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const puntos = Number(body.puntos);

    if (!Number.isFinite(puntos) || puntos <= 0 || !Number.isInteger(puntos)) {
      return NextResponse.json(
        { ok: false, error: "Puntos debe ser un entero positivo" },
        { status: 400 }
      );
    }

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

    // Leer config
    const config = await prisma.puntosConfigLocal.findFirst({
      where: { localId },
    });

    if (!config || !config.activo) {
      return NextResponse.json(
        { ok: false, error: "Puntos no habilitados en este local" },
        { status: 400 }
      );
    }

    // Calcular saldo actual
    const agg = await prisma.clientePuntoMovimiento.groupBy({
      by: ["direccion"],
      where: { clienteId, localId, grupoId },
      _sum: { puntos: true },
    });

    let creditos = 0;
    let debitos = 0;
    for (const row of agg) {
      const val = Number(row._sum.puntos || 0);
      if (row.direccion === "CREDITO") creditos = val;
      else if (row.direccion === "DEBITO") debitos = val;
    }
    const saldoActual = creditos - debitos;

    if (puntos > saldoActual) {
      return NextResponse.json(
        { ok: false, error: `Saldo insuficiente. Disponible: ${saldoActual} puntos` },
        { status: 400 }
      );
    }

    // Calcular descuento
    const pesoPorPunto = config.redencionJson?.pesoPorPunto || 0;
    if (pesoPorPunto <= 0) {
      return NextResponse.json(
        { ok: false, error: "Configuración de redención inválida" },
        { status: 400 }
      );
    }
    const descuento = puntos * pesoPorPunto;

    // Crear movimiento DEBITO tipo CANJE
    await prisma.clientePuntoMovimiento.create({
      data: {
        grupoId,
        localId,
        clienteId,
        direccion: "DEBITO",
        tipo: "CANJE",
        puntos,
        userId: session?.id || null,
        nota: `Canje ${puntos} pts = -$${descuento.toFixed(2)}`,
      },
    });

    const saldoNuevoEstimado = saldoActual - puntos;

    return NextResponse.json({
      ok: true,
      descuento,
      puntosUsados: puntos,
      saldoNuevoEstimado,
    });
  } catch (error) {
    console.error("Error canjeando puntos:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
