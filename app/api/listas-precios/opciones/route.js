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

    const items = await prisma.listaPrecio.findMany({
      where: { grupoId, activo: true },
      orderBy: [{ esDefault: "desc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        tipoBase: true,
        esDefault: true,
      },
    });

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("Error en opciones listas de precios:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
