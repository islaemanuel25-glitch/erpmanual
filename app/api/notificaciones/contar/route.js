import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolverScopeNotif, whereNotifUsuario, ventanaNotif } from "@/lib/notificaciones/scope";

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
    // LA MISMA VENTANA QUE EL LISTADO, y con la misma función. Antes acá solo se
    // acotaba si venía `desde`, así que el contador miraba TODA la historia y la
    // lista solo los últimos siete días: la campanita decía 16 y al abrirla no
    // había nada. Un número que no se puede abrir es peor que ningún número.
    where.createdAt = ventanaNotif(new URL(req.url).searchParams);

    const count = await prisma.notificacion.count({ where });
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    console.error("notificaciones/contar:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
