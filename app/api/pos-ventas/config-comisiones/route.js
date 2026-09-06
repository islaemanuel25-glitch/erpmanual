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

    // `null` cuando no hay comisión configurada, y no un 7 inventado. Acá había
    // `?? 7` en las tres: una segunda copia del respaldo que el dominio ya no
    // tiene. Quien consuma esto tiene que poder distinguir "no configurada" de
    // "0 %", que es toda la diferencia.
    const pct = (v) => (v == null ? null : Number(v));

    return NextResponse.json({
      ok: true,
      comisiones: {
        debito: pct(config?.comisionDebito),
        credito: pct(config?.comisionCredito),
        mercadopago: pct(config?.comisionMercadopago),
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
