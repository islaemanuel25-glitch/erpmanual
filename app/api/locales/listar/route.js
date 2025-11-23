import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const soloDepositos = searchParams.get("soloDepositos") === "true";
    const soloLocales = searchParams.get("soloLocales") === "true";

    let where = {};
    if (soloDepositos) where = { ...where, es_deposito: true };
    if (soloLocales) where = { ...where, es_deposito: false };

    const rows = await prisma.local.findMany({
      where,
      orderBy: { nombre: "asc" },
    });

    // FIX COMPLETO: no incluir ningún campo "tipo"
    const items = rows.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      direccion: l.direccion,
      telefono: l.telefono,
      email: l.email,
      cuil: l.cuil,
      ciudad: l.ciudad,
      provincia: l.provincia,
      codigoPostal: l.codigoPostal,
      activo: l.activo,
      esDeposito: l.es_deposito === true,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("GET locales/listar ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
