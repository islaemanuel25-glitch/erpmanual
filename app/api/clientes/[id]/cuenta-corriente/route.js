import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

export async function GET(req, context) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
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

    // Obtener movimientos
    const movimientos = await prisma.movimientoCuenta.findMany({
      where: { clienteId, localId, grupoId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Calcular saldo: sum(DEBITO) - sum(CREDITO)
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

    const items = movimientos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      direccion: m.direccion,
      monto: Number(m.monto),
      ventaId: m.ventaId,
      nota: m.nota,
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json({ ok: true, saldo, items });
  } catch (error) {
    console.error("Error obteniendo cuenta corriente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
