import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

// Bitácora de auditoría central. Gobernada por el permiso "auditoria.ver".
// NO se scopea por local: quien tiene el permiso ve TODO, de todos los locales.
export async function GET(req) {
  try {
    const perm = requirePerm(req, "auditoria.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(sp.get("pageSize")) || 25));
    const skip = (page - 1) * pageSize;

    const posInt = (k) => {
      const n = Number(sp.get(k));
      return Number.isInteger(n) && n > 0 ? n : null;
    };

    const where = {};
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    if (desde || hasta) {
      where.createdAt = {};
      if (desde) {
        const d = new Date(desde);
        if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
      }
      if (hasta) {
        const h = new Date(hasta);
        if (!Number.isNaN(h.getTime())) {
          h.setHours(23, 59, 59, 999);
          where.createdAt.lte = h;
        }
      }
    }
    const localId = posInt("localId");
    if (localId) where.localId = localId;
    const usuarioId = posInt("usuarioId");
    if (usuarioId) where.usuarioId = usuarioId;
    const operadorId = posInt("operadorId");
    if (operadorId) where.operadorId = operadorId;
    const accion = sp.get("accion");
    if (accion) where.accion = accion;
    const entidad = sp.get("entidad");
    if (entidad) where.entidad = entidad;

    const [total, rows] = await Promise.all([
      prisma.auditoriaBitacora.count({ where }),
      prisma.auditoriaBitacora.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    // Enriquecer con nombres (sin FK dura → lookups acotados a la página)
    const uIds = [...new Set(rows.map((r) => r.usuarioId).filter(Boolean))];
    const oIds = [...new Set(rows.map((r) => r.operadorId).filter(Boolean))];
    const lIds = [...new Set(rows.map((r) => r.localId).filter(Boolean))];

    const [usuarios, operadores, locales] = await Promise.all([
      uIds.length
        ? prisma.usuario.findMany({ where: { id: { in: uIds } }, select: { id: true, nombre: true, email: true } })
        : [],
      oIds.length
        ? prisma.operadorLocal.findMany({ where: { id: { in: oIds } }, select: { id: true, nombre: true } })
        : [],
      lIds.length
        ? prisma.local.findMany({ where: { id: { in: lIds } }, select: { id: true, nombre: true } })
        : [],
    ]);

    const uMap = Object.fromEntries(usuarios.map((u) => [u.id, u.nombre || u.email || `#${u.id}`]));
    const oMap = Object.fromEntries(operadores.map((o) => [o.id, o.nombre || `#${o.id}`]));
    const lMap = Object.fromEntries(locales.map((l) => [l.id, l.nombre || `#${l.id}`]));

    const items = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      accion: r.accion,
      entidad: r.entidad,
      entidadId: r.entidadId,
      metodo: r.metodo,
      usuario: r.usuarioId ? { id: r.usuarioId, nombre: uMap[r.usuarioId] || `#${r.usuarioId}` } : null,
      operador: r.operadorId ? { id: r.operadorId, nombre: oMap[r.operadorId] || `#${r.operadorId}` } : null,
      local: r.localId ? { id: r.localId, nombre: lMap[r.localId] || `#${r.localId}` } : null,
      antes: r.antes,
      despues: r.despues,
    }));

    return NextResponse.json({
      ok: true,
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 1 : Math.ceil(total / pageSize),
      },
    });
  } catch (e) {
    console.error("auditoria/listar:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
