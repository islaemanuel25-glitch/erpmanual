// app/api/pos-transferencias/cancelar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const posId = Number(body.posId || 0);

    if (!posId) {
      return NextResponse.json(
        { ok: false, error: "posId requerido" },
        { status: 400 }
      );
    }

    // ============================
    // Validar POS
    // ============================
    const pos = await prisma.posTransferencia.findUnique({
      where: { id: posId },
      select: { id: true, estado: true },
    });

    if (!pos) {
      return NextResponse.json(
        { ok: false, error: "POS no encontrada" },
        { status: 404 }
      );
    }

    if (pos.estado === "Enviado") {
      return NextResponse.json(
        { ok: false, error: "No se puede cancelar una POS ya enviada" },
        { status: 400 }
      );
    }

    // ============================
    // Eliminar detalles
    // ============================
    await prisma.posTransferenciaDetalle.deleteMany({
      where: { posTransferenciaId: posId },
    });

    // ============================
    // Eliminar POS
    // ============================
    await prisma.posTransferencia.delete({
      where: { id: posId },
    });

    return NextResponse.json({
      ok: true,
      item: null,
      error: null,
    });

  } catch (err) {
    console.error("Error cancelar POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al cancelar POS" },
      { status: 500 }
    );
  }
}
