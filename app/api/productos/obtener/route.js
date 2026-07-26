import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { mergeBaseLocalToUi } from "@/lib/mappers/producto";
import { resolveScope } from "@/lib/grupos";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, item: null, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const url = new URL(req.url);

    // ✅ ID
    const id = Number(url.searchParams.get("id") || 0);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // Alcance seguro: no-admin no puede indicar un localId ajeno (→403); admin usa
    // contexto explícito. El grupo se deriva del alcance, NUNCA del cliente.
    const qLocal = url.searchParams.get("localId");
    const scope = await resolveScope(req, { explicitLocalId: qLocal });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId, localId } = scope;

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

    // Lectura por ID: producto inexistente O de otro grupo → 404 (no revelar existencia).
    if (!base || base.grupoId !== grupoId) {
      return NextResponse.json(
        { ok: false, error: "Producto no encontrado" },
        { status: 404 }
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
