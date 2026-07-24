import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { proveedorVisibleWhere } from "@/lib/visibilidad";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // Regla B: visibilidad por local activo. Admin sin contexto → todos.
    const scope = await resolveLocalAndGrupo(req);
    const where = scope.error
      ? { activo: true }
      : { AND: [{ activo: true }, proveedorVisibleWhere(scope.localId, scope.grupoId)] };

    const items = await prisma.proveedor.findMany({
      where,
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        dias_pedido: true,
      },
    });

    return NextResponse.json({ ok: true, items });

  } catch (e) {
    console.error("Error /opciones proveedores:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
