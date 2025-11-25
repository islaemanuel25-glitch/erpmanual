// app/api/categorias/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 20);

    const search = searchParams.get("search")?.trim() || "";
    const estado = searchParams.get("estado") || "todos"; 
    // opciones: "todos" | "activas" | "inactivas"

    const where = {};

    // 🔍 FILTRO SEARCH
    if (search) {
      where.nombre = {
        contains: search,
        mode: "insensitive",
      };
    }

    // 🔍 FILTRO ESTADO
    if (estado === "activas") {
      where.activo = true;
    } else if (estado === "inactivas") {
      where.activo = false;
    }

    // =====================
    // 🧮 TOTAL
    // =====================
    const total = await prisma.categoria.count({ where });

    // =====================
    // 📄 LISTA
    // =====================
    const items = await prisma.categoria.findMany({
      where,
      orderBy: { nombre: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      ok: true,
      items,
      page,
      pageSize,
      total,
      totalPages,
    });

  } catch (e) {
    console.error("ERROR /api/categorias/listar", e);
    return NextResponse.json(
      { ok: false, error: "Error al listar categorías" },
      { status: 500 }
    );
  }
}
