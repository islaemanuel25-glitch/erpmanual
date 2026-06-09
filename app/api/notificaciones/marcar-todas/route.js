import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolverScopeNotif, whereNotifUsuario } from "@/lib/notificaciones/scope";

export async function POST(req) {
  try {
    const scope = await resolverScopeNotif(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    if (!scope.grupoId) {
      return NextResponse.json({ ok: false, error: "Sin grupo" }, { status: 400 });
    }

    await prisma.notificacion.updateMany({
      where: { ...whereNotifUsuario(scope.grupoId, scope.userId), leida: false },
      data: { leida: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notificaciones/marcar-todas:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
