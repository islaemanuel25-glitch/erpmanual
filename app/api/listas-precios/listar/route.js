import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const scope = await resolveGrupo(req, false);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, session } = scope;

    const perm = checkPerm(session, "listas_precios.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const activoParam = req.nextUrl.searchParams.get("activo");
    const incluirInactivas = req.nextUrl.searchParams.get("incluirInactivas") === "true";

    const where = { grupoId };
    if (activoParam === "true") {
      where.activo = true;
    } else if (activoParam === "false") {
      where.activo = false;
    } else if (!incluirInactivas) {
      // por defecto, solo activas — salvo que se pida explicitamente lo contrario
      where.activo = true;
    }

    const items = await prisma.listaPrecio.findMany({
      where,
      orderBy: [{ esDefault: "desc" }, { nombre: "asc" }],
      select: {
        id: true,
        grupoId: true,
        localId: true,
        nombre: true,
        tipoBase: true,
        margenPorcentaje: true,
        esDefault: true,
        redondeo_100: true,
        activo: true,
        notas: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { clientes: true } },
      },
    });

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("Error listando listas de precios:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
