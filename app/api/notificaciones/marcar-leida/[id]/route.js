import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolverScopeNotif, whereNotifUsuario } from "@/lib/notificaciones/scope";

export async function POST(req, { params }) {
  try {
    const scope = await resolverScopeNotif(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { id } = await params;
    const notifId = Number(id);
    if (!notifId) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }
    if (!scope.grupoId) {
      return NextResponse.json({ ok: false, error: "Sin grupo" }, { status: 400 });
    }

    // updateMany con scope de grupo/usuario (evita marcar notificaciones de otro grupo).
    await prisma.notificacion.updateMany({
      where: { id: notifId, ...whereNotifUsuario(scope.grupoId, scope.userId) },
      data: { leida: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notificaciones/marcar-leida:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
