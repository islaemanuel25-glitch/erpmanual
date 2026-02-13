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

    const localId = Number(req.nextUrl.searchParams.get("localId"));
    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    const turno = await prisma.turno.findFirst({
      where: {
        localId,
        vendedorId: session.id,
        cierre: null,
      },
      orderBy: { apertura: "desc" },
    });

    return NextResponse.json({ ok: true, turno });
  } catch (error) {
    console.error("Error obteniendo turno actual:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
