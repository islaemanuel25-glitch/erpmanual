import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolverScopeNotif, whereNotifUsuario, ventanaNotif } from "@/lib/notificaciones/scope";

// Query params:
//   filtro=todas|noleidas|leidas  (default todas)
//   page (default 1), pageSize (default 20, máx 100)
export async function GET(req) {
  try {
    const scope = await resolverScopeNotif(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    if (!scope.grupoId) return NextResponse.json({ ok: true, items: [], total: 0 });

    const { searchParams } = new URL(req.url);
    const filtro = searchParams.get("filtro") || "todas";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

    // Estado de lectura POR USUARIO (tabla puente NotificacionLectura):
    //  - no leída = NO existe fila de lectura para este usuario.
    //  - leída    = existe.
    const uid = scope.userId ?? -1;
    const base = whereNotifUsuario(scope);
    const where =
      filtro === "noleidas"
        ? { ...base, lecturas: { none: { usuarioId: uid } } }
        : filtro === "leidas"
        ? { ...base, lecturas: { some: { usuarioId: uid } } }
        : { ...base };

    // Rango temporal OBLIGATORIO (módulo de alto volumen). La regla estaba
    // escrita acá y el contador tenía la suya, distinta; ahora las dos salen de
    // `ventanaNotif` para que no puedan volver a separarse.
    where.createdAt = ventanaNotif(searchParams);

    const [rows, total] = await Promise.all([
      prisma.notificacion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { lecturas: { where: { usuarioId: uid }, select: { id: true } } },
      }),
      prisma.notificacion.count({ where }),
    ]);

    // `leida` es POR USUARIO (presencia de fila de lectura); nunca el flag global.
    const items = rows.map(({ lecturas, ...n }) => ({ ...n, leida: lecturas.length > 0 }));

    return NextResponse.json({ ok: true, items, total });
  } catch (err) {
    console.error("notificaciones/listar:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
