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

    if (!scope.userId) {
      return NextResponse.json({ ok: false, error: "Sin usuario" }, { status: 401 });
    }
    // Marca leídas SOLO para este usuario: crea filas de lectura para las notifs en
    // su alcance que aún no leyó. Nunca toca el estado global de la notificación.
    const noLeidas = await prisma.notificacion.findMany({
      where: { ...whereNotifUsuario(scope), lecturas: { none: { usuarioId: scope.userId } } },
      select: { id: true },
    });
    if (noLeidas.length > 0) {
      await prisma.notificacionLectura.createMany({
        data: noLeidas.map((n) => ({ notificacionId: n.id, usuarioId: scope.userId })),
        skipDuplicates: true,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notificaciones/marcar-todas:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
