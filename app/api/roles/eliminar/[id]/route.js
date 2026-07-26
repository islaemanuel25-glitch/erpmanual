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

    // Protección interina del rol administrador (pre-esSistema): ningún rol que
    // contenga "*" (privilegio universal) puede eliminarse.
    const rol = await prisma.rol.findUnique({
      where: { id: rolId },
      select: { nombre: true, permisos: true },
    });
    if (!rol) {
      return NextResponse.json({ ok: false, error: "Rol no encontrado" }, { status: 404 });
    }
    const esUniversal = Array.isArray(rol.permisos) && rol.permisos.includes("*");
    if (esUniversal || rol.nombre === "Admin") {
      return NextResponse.json(
        { ok: false, error: "No se puede eliminar el rol administrador." },
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
