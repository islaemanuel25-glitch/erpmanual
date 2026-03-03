import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { getContextoActivo } from "@/lib/contexto";

export async function GET(req, { params }) {
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
      console.log("[precios/history/id] CTX:", { sessionGrupoId: session.grupoId, grupoIdResolved: grupoId });
    }

    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "Seleccioná un grupo activo para trabajar." },
        { status: 400 }
      );
    }

    const id = Number(params?.id || 0);
    if (!id) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    const update = await prisma.precioUpdate.findFirst({
      where: {
        id,
        grupoId,
      },
      include: {
        items: {
          orderBy: { id: "asc" },
        },
      },
    });

    if (!update) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }

    const productoIds = update.items.map((it) => it.productoBaseId);
    const productos = await prisma.productoBase.findMany({
      where: { id: { in: productoIds } },
      select: { id: true, nombre: true },
    });
    const productoMap = new Map(productos.map((p) => [p.id, p.nombre]));

    const item = {
      id: update.id,
      metodo: update.metodo,
      pricingMode: update.pricingMode,
      proveedorId: update.proveedorId,
      createdAt: update.createdAt,
      items: update.items.map((it) => ({
        ...it,
        nombre: productoMap.get(it.productoBaseId) || null,
      })),
    };

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error("ERROR productos/precios/history/[id]:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
