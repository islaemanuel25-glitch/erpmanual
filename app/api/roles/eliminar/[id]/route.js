import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";

export async function DELETE(req, context) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { id } = await context.params; // ✅ Next 15
    const rolId = Number(id);

    if (!rolId || Number.isNaN(rolId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // Los roles de SISTEMA no se eliminan (Admin/CAJERO/ENCARGADO/DUEÑO_LOCAL).
    // Se mantiene además el bloqueo por "*"/nombre como defensa en profundidad.
    const rol = await prisma.rol.findUnique({
      where: { id: rolId },
      select: { nombre: true, permisos: true, esSistema: true },
    });
    if (!rol) {
      return NextResponse.json({ ok: false, error: "Rol no encontrado" }, { status: 404 });
    }
    const esUniversal = Array.isArray(rol.permisos) && rol.permisos.includes("*");
    if (rol.esSistema || esUniversal || rol.nombre === "Admin") {
      return NextResponse.json(
        { ok: false, error: "No se puede eliminar un rol de sistema." },
        { status: 400 }
      );
    }

    await prisma.rol.delete({
      where: { id: rolId }
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (e.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "Rol no encontrado o en uso" },
        { status: 409 }
      );
    }

    console.error("roles/eliminar", e);
    return NextResponse.json(
      { ok: false, error: "Error al eliminar rol" },
      { status: 500 }
    );
  }
}
