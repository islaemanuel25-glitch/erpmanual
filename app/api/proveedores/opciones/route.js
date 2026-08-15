import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { proveedorVisibleWhere } from "@/lib/visibilidad";

// Mismo par que `proveedores/listar`: devuelve los mismos proveedores, recortados
// a nombre y días de pedido. El dato manda sobre la pantalla que lo pide.
const PERMISO_VER_PROVEEDORES = ["compras.ver", "proveedores.ver"];

export async function GET(req) {
  try {
    const auth = requirePerm(req, PERMISO_VER_PROVEEDORES);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
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
