// app/api/compras-proveedor/confirmar/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { pedidoEnAlcance } from "@/lib/compras/scope";

export async function POST(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const pedidoId = Number(id);

    if (!pedidoId) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
    });

    if (!pedido || pedido.grupoId !== grupoId) {
      return NextResponse.json(
        { ok: false, error: "Pedido no encontrado" },
        { status: 404 }
      );
    }
    // Escritura sobre pedido de otra ubicación del mismo grupo → 403.
    if (!pedidoEnAlcance(pedido, { grupoId, localId })) {
      return NextResponse.json(
        { ok: false, error: "Pedido fuera de tu alcance" },
        { status: 403 }
      );
    }

    if (pedido.estado !== "BORRADOR") {
      return NextResponse.json(
        { ok: false, error: `No se puede confirmar un pedido en estado ${pedido.estado}` },
        { status: 400 }
      );
    }

    const updated = await prisma.pedidoProveedor.update({
      where: { id: pedidoId },
      data: {
        estado: "CONFIRMADO",
        fechaConfirmado: new Date(),
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (err) {
    console.error("Error compras-proveedor/confirmar:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
