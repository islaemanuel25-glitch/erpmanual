import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { proveedorVisibleWhere } from "@/lib/visibilidad";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, items: [], error: "No autenticado" },
        { status: 401 }
      );
    }

    // Regla B: el proveedor se ve donde se crearon los productos que lo usan
    // (fallback: quien lo creó, si aún no tiene productos). Admin sin contexto
    // activo → catálogo completo.
    const scope = await resolveLocalAndGrupo(req);
    const where = scope.error ? {} : proveedorVisibleWhere(scope.localId, scope.grupoId);

    const proveedores = await prisma.proveedor.findMany({
      where,
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, items: proveedores });
  } catch (err) {
    console.error("❌ Error PROVEEDORES:", err);
    return NextResponse.json(
      { ok: false, items: [], error: "Error al cargar proveedores" },
      { status: 500 }
    );
  }
}
