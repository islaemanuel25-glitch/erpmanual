import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveGrupo } from "@/lib/grupos";

export async function GET(req) {
  try {
    // localId opcional: permite listar por grupoId solo (admin sin local)
    const scope = await resolveGrupo(req, false);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId } = scope;
    const activoParam = req.nextUrl.searchParams.get("activo");
    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const take =
      Number.isInteger(limitParam) && limitParam > 0
        ? Math.min(limitParam, 500)
        : undefined;
    
    // Construir where: siempre por grupoId, localId opcional
    const where = { grupoId };
    if (localId) {
      where.localId = localId;
    }
    if (activoParam === "true") {
      where.activo = true;
    } else if (activoParam === "false") {
      where.activo = false;
    }

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nombre: "asc" },
      ...(take ? { take } : {}),
    });

    let capped = false;
    if (take) {
      const total = await prisma.cliente.count({ where });
      capped = total > take;
    }

    return NextResponse.json({ ok: true, items: clientes, capped });
  } catch (error) {
    console.error("Error listando clientes:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
