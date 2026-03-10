import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const perm = requirePerm(req, "pos.usar");
    if (!perm.ok)
      return NextResponse.json(
        { ok: false, error: perm.error },
        { status: perm.status }
      );

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId } = scope;

    const config = await prisma.configuracionGrupo.findUnique({
      where: { grupoId },
      select: {
        comisionDebito: true,
        comisionCredito: true,
        comisionMercadopago: true,
      },
    });

    return NextResponse.json({
      ok: true,
      comisiones: {
        debito: Number(config?.comisionDebito ?? 7),
        credito: Number(config?.comisionCredito ?? 7),
        mercadopago: Number(config?.comisionMercadopago ?? 7),
      },
    });
  } catch (error) {
    console.error("Error config comisiones:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
