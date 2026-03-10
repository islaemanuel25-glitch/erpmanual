import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos.usar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { localId, montoInicial } = await req.json();

    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    // Verificar que no tenga turno abierto
    const turnoAbierto = await prisma.turno.findFirst({
      where: {
        localId,
        vendedorId: session.id,
        cierre: null,
      },
    });

    if (turnoAbierto) {
      return NextResponse.json(
        { ok: false, error: "Ya tenes un turno abierto" },
        { status: 400 }
      );
    }

    const turno = await prisma.turno.create({
      data: {
        localId,
        vendedorId: session.id,
        montoInicial: Number(montoInicial) || 0,
      },
    });

    return NextResponse.json({ ok: true, turno });
  } catch (error) {
    console.error("Error abriendo turno:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
