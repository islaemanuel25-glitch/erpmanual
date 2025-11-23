import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { mergeBaseLocalToUi } from "@/lib/mappers/producto";
import { getGrupoIdDeLocal } from "@/lib/grupos";

export async function GET(req) {
  try {
    const url = new URL(req.url);

    // ✅ ID
    const id = Number(url.searchParams.get("id") || 0);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // ✅ LOCAL ID DESDE QUERYSTRING (NO HEADER)
    const localId = Number(url.searchParams.get("localId") || 0);
    if (!localId || Number.isNaN(localId)) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    // ✅ Grupo
    const grupoId = await getGrupoIdDeLocal(localId);
    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "El local no pertenece a ningún grupo" },
        { status: 400 }
      );
    }

    // ✅ Base + override
    const base = await prisma.productoBase.findUnique({
      where: { id },
      include: {
        locales: {
          where: { localId },
          take: 1,
        },
      },
    });

    if (!base) {
      return NextResponse.json(
        { ok: false, error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    if (base.grupoId !== grupoId) {
      return NextResponse.json(
        { ok: false, error: "Producto fuera del grupo del local" },
        { status: 403 }
      );
    }

    const override = base.locales?.[0] ?? null;

    return NextResponse.json({
      ok: true,
      item: mergeBaseLocalToUi(base, override),
    });
  } catch (error) {
    console.error("❌ obtener()", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
