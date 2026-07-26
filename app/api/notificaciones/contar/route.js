import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolverScopeNotif, whereNotifUsuario } from "@/lib/notificaciones/scope";

// Query: desde (ISO) opcional → solo cuenta no leídas con createdAt >= desde.
export async function GET(req) {
  try {
    const scope = await resolverScopeNotif(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    if (!scope.grupoId) return NextResponse.json({ ok: true, count: 0 });

    // No leída POR USUARIO = no existe fila de lectura para este usuario.
    const where = {
      ...whereNotifUsuario(scope),
      lecturas: { none: { usuarioId: scope.userId ?? -1 } },
    };
    const desde = new URL(req.url).searchParams.get("desde");
    if (desde) {
      const d = new Date(desde);
      if (!isNaN(d.getTime())) where.createdAt = { gte: d };
    }

    const count = await prisma.notificacion.count({ where });
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    console.error("notificaciones/contar:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
