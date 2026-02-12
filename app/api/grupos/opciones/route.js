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

    // Para admin padre: devolver todos los grupos
    // Para no admin: devolver solo su grupo (si aplica)
    const esAdmin = session.esAdmin && !session.localId;

    let grupos = [];

    if (esAdmin) {
      // Admin padre: todos los grupos
      grupos = await prisma.grupo.findMany({
        orderBy: { nombre: "asc" },
        select: {
          id: true,
          nombre: true,
        },
      });
    } else {
      // No admin: solo su grupo (si tiene localId)
      if (session.localId) {
        // Buscar grupo del local
        const grupoLocal = await prisma.grupoLocal.findFirst({
          where: { localId: session.localId },
          include: { grupo: { select: { id: true, nombre: true } } },
        });

        if (grupoLocal?.grupo) {
          grupos = [grupoLocal.grupo];
        } else {
          // Intentar buscar como depósito
          const grupoDeposito = await prisma.grupoDeposito.findFirst({
            where: { localId: session.localId },
            include: { grupo: { select: { id: true, nombre: true } } },
          });

          if (grupoDeposito?.grupo) {
            grupos = [grupoDeposito.grupo];
          }
        }
      }
    }

    return NextResponse.json({ ok: true, items: grupos });
  } catch (e) {
    console.error("ERROR grupos/opciones:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

