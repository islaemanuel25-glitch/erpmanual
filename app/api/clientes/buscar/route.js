import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const q = req.nextUrl.searchParams.get("q");

    if (!q || q.length < 2) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Obtener grupoId del usuario
    let grupoId = session.grupoId;
    if (!grupoId && session.localId) {
      const gl = await prisma.grupoLocal.findFirst({
        where: { localId: session.localId },
        select: { grupoId: true },
      });
      grupoId = gl?.grupoId;
    }

    if (!grupoId) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const clientes = await prisma.cliente.findMany({
      where: {
        grupoId,
        activo: true,
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { documento: { contains: q } },
          { telefono: { contains: q } },
        ],
      },
      take: 20,
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, items: clientes });
  } catch (error) {
    console.error("Error buscando clientes:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
