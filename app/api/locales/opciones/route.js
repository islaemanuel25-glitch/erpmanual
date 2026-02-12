import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    let where = { activo: true };

    // Si NO es admin, solo retornar su local
    if (!session.esAdmin && session.localId) {
      where.id = session.localId;
    }

    // Si es admin con grupo activo, filtrar por grupo
    if (session.esAdmin && session.grupoId) {
      const grupoLocales = await prisma.grupoLocal.findMany({
        where: { grupoId: session.grupoId },
        select: { localId: true },
      });
      const grupoDepositos = await prisma.grupoDeposito.findMany({
        where: { grupoId: session.grupoId },
        select: { localId: true },
      });
      const ids = [
        ...grupoLocales.map((gl) => gl.localId),
        ...grupoDepositos.map((gd) => gd.localId),
      ];
      if (ids.length > 0) {
        where.id = { in: ids };
      }
    }

    const rows = await prisma.local.findMany({
      where,
      orderBy: { nombre: "asc" },
    });

    const items = rows.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      esDeposito: l.es_deposito === true,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("GET locales/opciones ERROR:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
