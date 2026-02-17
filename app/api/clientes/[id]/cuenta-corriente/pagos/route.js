import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function POST(req, context) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const perm = checkPerm(scope.session, "clientes.cc.pagar");
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
    const monto = Number(body.monto);
    const nota = body.nota || null;

    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(
        { ok: false, error: "El monto debe ser mayor a 0" },
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
        tipo: "PAGO",
        direccion: "CREDITO",
        monto,
        nota,
        userId: session?.id || null,
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
    console.error("Error registrando pago:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
