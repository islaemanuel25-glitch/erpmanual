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

    if (!scope.userId) {
      return NextResponse.json({ ok: false, error: "Sin usuario" }, { status: 401 });
    }
    // La notif debe estar en el alcance del usuario (grupo + ubicación + permiso).
    // Si no → 404 (ajena/inexistente): no revela existencia.
    const notif = await prisma.notificacion.findFirst({
      where: { id: notifId, ...whereNotifUsuario(scope) },
      select: { id: true },
    });
    if (!notif) {
      return NextResponse.json({ ok: false, error: "No encontrada" }, { status: 404 });
    }
    // Marca leída SOLO para este usuario (nunca global).
    await prisma.notificacionLectura.upsert({
      where: { notificacionId_usuarioId: { notificacionId: notifId, usuarioId: scope.userId } },
      update: { leidaAt: new Date() },
      create: { notificacionId: notifId, usuarioId: scope.userId, leidaAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notificaciones/marcar-leida:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
