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
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const estado = searchParams.get("estado") || "activos";
    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 20);

    // Regla B: visibilidad por local activo. Admin sin contexto → todos.
    const scope = await resolveLocalAndGrupo(req);
    const visFilter = scope.error ? [] : [proveedorVisibleWhere(scope.localId, scope.grupoId)];

    const where = {
      AND: [
        estado === "activos" ? { activo: true } : {},
        search
          ? {
              OR: [
                { nombre: { contains: search, mode: "insensitive" } },
                { cuit: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { direccion: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        ...visFilter,
      ],
    };

    const total = await prisma.proveedor.count({ where });

    const items = await prisma.proveedor.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        cuit: true,
        telefono: true,
        email: true,
        direccion: true,
        dias_pedido: true,   // 🔥 NECESARIO
        activo: true,
      },
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      page,
      pageSize,
    });
  } catch (e) {
    console.error("Error LISTAR PROVEEDORES:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
