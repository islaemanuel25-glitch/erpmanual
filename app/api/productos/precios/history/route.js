import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { getContextoActivo } from "@/lib/contexto";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // Resolver grupoId: session → query localId → session.localId → contexto cookie
    const { searchParams } = new URL(req.url);
    let grupoId = Number(session.grupoId) || 0;
    if (!grupoId) {
      let localId = Number(searchParams.get("localId")) || 0;
      if (!localId && session.localId) localId = Number(session.localId);
      if (!localId && session.esAdmin) {
        const ctx = getContextoActivo(req, session);
        if (ctx.localId) localId = Number(ctx.localId);
      }
      if (localId) grupoId = await getGrupoIdDeLocal(localId);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[precios/history] CTX:", { sessionGrupoId: session.grupoId, grupoIdResolved: grupoId });
    }

    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "Seleccioná un grupo activo para trabajar." },
        { status: 400 }
      );
    }

    const updates = await prisma.precioUpdate.findMany({
      where: { grupoId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: { select: { id: true } },
      },
    });

    const proveedorIds = [...new Set(updates.map((u) => u.proveedorId).filter(Boolean))];
    const proveedores = await prisma.proveedor.findMany({
      where: { id: { in: proveedorIds } },
      select: { id: true, nombre: true },
    });
    const proveedoresMap = new Map(proveedores.map((p) => [p.id, p.nombre]));

    const items = updates.map((u) => ({
      id: u.id,
      fecha: new Date(u.createdAt).toLocaleString("es-AR"),
      proveedorId: u.proveedorId,
      proveedorNombre: u.proveedorId ? proveedoresMap.get(u.proveedorId) || null : null,
      metodo: u.metodo,
      pricingMode: u.pricingMode,
      itemsCount: u.items.length,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("ERROR productos/precios/history:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
