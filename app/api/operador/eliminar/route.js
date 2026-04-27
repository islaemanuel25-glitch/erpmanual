import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

export async function POST(req) {
  try {
    const perm = requirePerm(req, "usuarios.gestionar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID requerido." }, { status: 400 });
    }

    const operador = await prisma.operadorLocal.findUnique({
      where: { id: Number(id) },
    });
    if (!operador) {
      return NextResponse.json({ ok: false, error: "Operador no encontrado." }, { status: 404 });
    }

    await prisma.operadorLocal.delete({ where: { id: operador.id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("operador/eliminar:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
