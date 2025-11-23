import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // Parámetros
    const q = searchParams.get("q")?.trim() || "";
    const ordenParam = searchParams.get("orden") || "nombre_asc";
    const page = Number(searchParams.get("page")) || 1;

    const PAGE_SIZE = 12;
    const skip = (page - 1) * PAGE_SIZE;

    // Filtro búsqueda
    const where = q
      ? {
          nombre: {
            contains: q,
            mode: "insensitive",
          },
        }
      : {};

    // Orden dinámico
    let orderBy = {};

    switch (ordenParam) {
      case "nombre_asc":
        orderBy = { nombre: "asc" };
        break;

      case "nombre_desc":
        orderBy = { nombre: "desc" };
        break;

      case "depositos_desc":
        orderBy = { locales: { _count: "desc" } };
        break;

      case "locales_desc":
        orderBy = { localesGrupo: { _count: "desc" } };
        break;

      default:
        orderBy = { nombre: "asc" };
        break;
    }

    // Query paralelo
    const [rows, total] = await Promise.all([
      prisma.grupo.findMany({
        where,
        orderBy,
        skip,
        take: PAGE_SIZE,
        include: {
          locales: { include: { local: true } },
          localesGrupo: { include: { local: true } },
        },
      }),

      prisma.grupo.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      items: rows,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (error) {
    console.error("GET /grupos/listar ERROR:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar los grupos" },
      { status: 500 }
    );
  }
}
