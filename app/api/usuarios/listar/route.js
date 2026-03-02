import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";

export async function GET(req) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(req.url);

    const search = (searchParams.get("search") || "").trim();
    const rol = searchParams.get("rol") || "";
    const local = searchParams.get("local") || "";
    const activoFilter = searchParams.get("activo"); // "true" | "false" | null

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
      select: {
        id: true,
        nombre: true,
        email: true,
        activo: true,
        rolId: true,
        localId: true,
        rol: { select: { id: true, nombre: true } },
        local: { select: { id: true, nombre: true } },
      },
    });

    return NextResponse.json(
      { ok: true, usuarios, total: usuarios.length },
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
