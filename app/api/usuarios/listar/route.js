import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const search = (searchParams.get("search") || "").trim();
    const rol = searchParams.get("rol") || "";
    const local = searchParams.get("local") || "";
    const activoFilter = searchParams.get("activo"); // "true" | "false" | null

    // ✅ NO USAMOS paginación aquí (la hace el frontend)
    const where = {
      AND: [
        search
          ? {
              OR: [
                { nombre: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        rol ? { rolId: Number(rol) } : {},
        local ? { localId: Number(local) } : {},
        activoFilter === "true" ? { activo: true } : {},
        activoFilter === "false" ? { activo: false } : {},
      ],
    };

    const usuarios = await prisma.usuario.findMany({
      where,
      orderBy: { id: "desc" },
      include: { rol: true, local: true },
    });

    return NextResponse.json(
      {
        ok: true,
        usuarios,       // ✅ nombre correcto
        total: usuarios.length,
      },
      { status: 200 }
    );

  } catch (e) {
    console.error("❌ usuarios/listar", e);
    return NextResponse.json(
      { ok: false, error: "Error al listar usuarios." },
      { status: 500 }
    );
  }
}
