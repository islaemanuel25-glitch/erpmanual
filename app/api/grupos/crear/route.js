import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST /api/grupos/crear  { nombre }
export async function POST(req) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { ok: false, error: "Content-Type debe ser application/json" },
        { status: 415 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const nombre = (body?.nombre || "").trim();

    if (!nombre) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    const grupo = await prisma.grupo.create({ data: { nombre } });
    return NextResponse.json({ ok: true, data: grupo });
  } catch (e) {
    // Prisma duplicate unique key -> P2002
    if (e?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un grupo con ese nombre" },
        { status: 409 }
      );
    }
    console.error("POST /grupos/crear ERROR:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

// GET /api/grupos/crear?nombre=Central   (opcional para test rápido)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const nombre = (searchParams.get("nombre") || "").trim();
    if (!nombre) {
      return NextResponse.json(
        { ok: false, error: "Usá POST con JSON o GET ?nombre=" },
        { status: 400 }
      );
    }

    const grupo = await prisma.grupo.create({ data: { nombre } });
    return NextResponse.json({ ok: true, data: grupo });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un grupo con ese nombre" },
        { status: 409 }
      );
    }
    console.error("GET /grupos/crear ERROR:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
