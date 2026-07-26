import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

export async function POST(req) {
  try {
    const perm = requirePerm(req, "config_local.operadores");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }
    const session = perm.session;

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID requerido." }, { status: 400 });
    }

    const operador = await prisma.operadorLocal.findUnique({
      where: { id: Number(id) },
      include: { locales: { select: { localId: true } } },
    });
    if (!operador) {
      return NextResponse.json({ ok: false, error: "Operador no encontrado." }, { status: 404 });
    }

    // Scope: un no-admin solo puede eliminar operadores que pertenecen EXCLUSIVA-
    // mente a su local (borrar uno multi-local afectaría a otros locales → 403).
    if (!session.esAdmin) {
      const propio = Number(session.localId) || 0;
      const localesOp = operador.locales.map((l) => l.localId);
      if (!propio || !localesOp.includes(propio)) {
        return NextResponse.json({ ok: false, error: "No autorizado para este operador." }, { status: 403 });
      }
      if (localesOp.some((lid) => lid !== propio)) {
        return NextResponse.json(
          { ok: false, error: "El operador pertenece a otros locales; pedí a un administrador." },
          { status: 403 }
        );
      }
    }

    await prisma.operadorLocal.delete({ where: { id: operador.id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("operador/eliminar:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
