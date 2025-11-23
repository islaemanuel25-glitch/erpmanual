import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const page = Number(searchParams.get("page")) || 1;
    const PAGE_SIZE = 25;
    const q = String(searchParams.get("q") || "").trim();

    const where = q
      ? { nombre: { contains: q, mode: "insensitive" } }
      : {};

    const total = await prisma.rol.count({ where });

    const items = await prisma.rol.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: { nombre: "asc" }
    });

    return NextResponse.json({
      ok: true,
      items,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE)
    });
  } catch (e) {
    console.error("roles/listar", e);
    return NextResponse.json(
      { ok: false, error: "Error al listar roles" },
      { status: 500 }
    );
  }
}
