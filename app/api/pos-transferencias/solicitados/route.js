// app/api/pos-transferencias/solicitados/route.js
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

    const isAdmin =
      Array.isArray(session.permisos) &&
      session.permisos.includes("*") &&
      !session.localId;

    let where = { estado: "Solicitado" };

    if (isAdmin) {
      // Admin ve todos los solicitados
    } else {
      const localId = Number(session.localId);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "Usuario sin local válido" },
          { status: 400 }
        );
      }

      const local = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });

      if (local?.es_deposito) {
        // Depósito ve pedidos donde él es el origen
        where.origenId = localId;
      } else {
        // Local ve pedidos donde él es el destino
        where.destinoId = localId;
      }
    }

    const rows = await prisma.posTransferencia.findMany({
      where,
      include: {
        origen: { select: { id: true, nombre: true } },
        destino: { select: { id: true, nombre: true } },
        solicitadoPor: { select: { id: true, nombre: true } },
        _count: { select: { detalles: true } },
      },
      orderBy: { solicitadoAt: "desc" },
    });

    const items = rows.map((r) => ({
      id: r.id,
      origenId: r.origenId,
      origenNombre: r.origen?.nombre || "-",
      destinoId: r.destinoId,
      destinoNombre: r.destino?.nombre || "-",
      solicitadoAt: r.solicitadoAt?.toISOString() || null,
      itemCount: r._count.detalles,
      solicitadoPorNombre: r.solicitadoPor?.nombre || "-",
    }));

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("Error solicitados POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
