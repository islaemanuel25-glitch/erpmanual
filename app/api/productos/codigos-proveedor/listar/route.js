// app/api/productos/codigos-proveedor/listar/route.js
// Lista los códigos internos por proveedor de un ProductoBase (solo activos).
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const url = new URL(req.url);
    const productoBaseId = Number(url.searchParams.get("productoBaseId") || 0);

    if (!productoBaseId) {
      return NextResponse.json(
        { ok: false, error: "productoBaseId requerido" },
        { status: 400 }
      );
    }

    // Validar que el ProductoBase pertenece al grupo del usuario
    const base = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: { id: true },
    });
    if (!base) {
      return NextResponse.json(
        { ok: false, error: "Producto no encontrado en este grupo" },
        { status: 404 }
      );
    }

    const items = await prisma.productoCodigoProveedor.findMany({
      where: { grupoId, productoBaseId, activo: true },
      include: {
        proveedor: { select: { id: true, nombre: true, cuit: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("ERROR productos/codigos-proveedor/listar:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
