// app/api/productos/codigos-proveedor/eliminar/route.js
// Soft-delete de un vínculo de código interno (activo=false). No borra físicamente.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function DELETE(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    // id por query (?id=) o por body JSON
    const url = new URL(req.url);
    let id = Number(url.searchParams.get("id") || 0);
    if (!id) {
      try {
        const body = await req.json();
        id = Number(body?.id || 0);
      } catch {
        // sin body JSON
      }
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    // El vínculo debe pertenecer al grupo del usuario
    const actual = await prisma.productoCodigoProveedor.findFirst({
      where: { id, grupoId },
      select: { id: true },
    });
    if (!actual) {
      return NextResponse.json(
        { ok: false, error: "Vínculo no encontrado" },
        { status: 404 }
      );
    }

    const item = await prisma.productoCodigoProveedor.update({
      where: { id },
      data: { activo: false },
    });

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error("ERROR productos/codigos-proveedor/eliminar:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
