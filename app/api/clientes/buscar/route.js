import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveGrupo } from "@/lib/grupos";

export async function GET(req) {
  try {
    // localId opcional: permite buscar por grupoId solo (admin sin local)
    const scope = await resolveGrupo(req, false);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId } = scope;

    const q = req.nextUrl.searchParams.get("q");

    if (!q || q.length < 2) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Construir where: siempre por grupoId, localId opcional
    const where = {
      grupoId,
      activo: true,
      OR: [
        { nombre: { contains: q, mode: "insensitive" } },
        { documento: { contains: q } },
        { telefono: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    };

    // Si hay localId, filtrar por localId también (scope más específico)
    if (localId) {
      where.localId = localId;
    }

    const clientes = await prisma.cliente.findMany({
      where,
      take: 20,
      orderBy: { nombre: "asc" },
      include: {
        listaPrecio: {
          select: {
            id: true,
            nombre: true,
            esDefault: true,
            activo: true,
            tipoBase: true,
            margenPorcentaje: true,
            redondeo_100: true,
          },
        },
      },
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
