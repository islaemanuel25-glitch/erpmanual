import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

export async function POST(req, context) {
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

    const body = await req.json();
    const monto = Number(body.monto);
    const direccion = body.direccion;
    const nota = body.nota || null;

    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(
        { ok: false, error: "El monto debe ser mayor a 0" },
        { status: 400 }
      );
    }

    if (!["DEBITO", "CREDITO"].includes(direccion)) {
      return NextResponse.json(
        { ok: false, error: "Dirección inválida (DEBITO o CREDITO)" },
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

    const movimiento = await prisma.movimientoCuenta.create({
      data: {
        grupoId,
        localId,
        clienteId,
        tipo: "AJUSTE",
        direccion,
        monto,
        nota,
      },
    });

    return NextResponse.json({
      ok: true,
      movimiento: {
        id: movimiento.id,
        tipo: movimiento.tipo,
        direccion: movimiento.direccion,
        monto: Number(movimiento.monto),
        nota: movimiento.nota,
        createdAt: movimiento.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error registrando ajuste:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
