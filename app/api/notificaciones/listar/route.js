import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolverScopeNotif, whereNotifUsuario } from "@/lib/notificaciones/scope";

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

    const base = whereNotifUsuario(scope.grupoId, scope.userId);
    const where =
      filtro === "noleidas"
        ? { ...base, leida: false }
        : filtro === "leidas"
        ? { ...base, leida: true }
        : { ...base };

    // Rango temporal OBLIGATORIO (módulo de alto volumen). Si no viene `desde`,
    // se fuerza a los últimos 7 días. `hasta` es opcional (límite superior).
    let desde = null;
    const desdeParam = searchParams.get("desde");
    if (desdeParam) {
      const d = new Date(desdeParam);
      if (!isNaN(d.getTime())) desde = d;
    }
    if (!desde) {
      desde = new Date();
      desde.setDate(desde.getDate() - 7);
    }
    where.createdAt = { gte: desde };

    const hastaParam = searchParams.get("hasta");
    if (hastaParam) {
      const h = new Date(hastaParam);
      if (!isNaN(h.getTime())) where.createdAt.lte = h;
    }

    const [items, total] = await Promise.all([
      prisma.notificacion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notificacion.count({ where }),
    ]);

    return NextResponse.json({ ok: true, items, total });
  } catch (err) {
    console.error("notificaciones/listar:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
