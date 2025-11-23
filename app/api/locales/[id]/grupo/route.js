import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req, context) {
  try {
    const { id } = await context.params;
    const localId = Number(id);

    if (!localId || Number.isNaN(localId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // 1) Buscar si es depósito
    const deposito = await prisma.grupoDeposito.findFirst({
      where: { localId },
      include: { grupo: true },
    });

    if (deposito) {
      return NextResponse.json({
        ok: true,
        tipo: "deposito",
        grupo: deposito.grupo,
      });
    }

    // 2) Buscar si es local normal
    const local = await prisma.grupoLocal.findFirst({
      where: { localId },
      include: { grupo: true },
    });

    if (local) {
      return NextResponse.json({
        ok: true,
        tipo: "local",
        grupo: local.grupo,
      });
    }

    // Si no pertenece a ningún grupo (error lógico)
    return NextResponse.json({
      ok: false,
      error: "El local no está asignado a ningún grupo",
    });
  } catch (e) {
    console.error("GET /locales/[id]/grupo ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
