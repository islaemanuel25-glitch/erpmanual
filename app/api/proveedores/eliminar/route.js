import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function DELETE(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const numId = Number(body.id || 0);

    if (!numId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const countProductos = await prisma.productoBase.count({
      where: { proveedor_id: numId },
    });

    if (countProductos > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se puede eliminar: tiene productos asociados",
        },
        { status: 400 }
      );
    }

    await prisma.proveedor.delete({
      where: { id: numId },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ELIMINAR proveedor:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
