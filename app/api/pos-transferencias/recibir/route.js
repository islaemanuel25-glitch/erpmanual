// app/api/pos-transferencias/recibir/route.js
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
    const transferenciaId = Number(body.transferenciaId || 0);

    if (!transferenciaId) {
      return NextResponse.json(
        { ok: false, error: "transferenciaId requerido" },
        { status: 400 }
      );
    }

    // ======================================================
    // OBTENER TRANSFERENCIA
    // ======================================================
    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      include: { detalle: true },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    if (transferencia.estado !== "Pendiente") {
      return NextResponse.json(
        { ok: false, error: "La transferencia ya fue recibida o no está pendiente" },
        { status: 400 }
      );
    }

    const destinoId = transferencia.destinoId;

    // ======================================================
    // VALIDAR QUE EL USUARIO PUEDA RECIBIR ESTA TRANSFERENCIA
    // ======================================================
    const isAdmin = !session.localId;

    if (!isAdmin) {
      if (Number(session.localId) !== destinoId) {
        return NextResponse.json(
          { ok: false, error: "No puedes recibir una transferencia de otro local" },
          { status: 403 }
        );
      }
    }

    // Validar existencia del local destino
    const localDestino = await prisma.local.findUnique({
      where: { id: destinoId },
    });

    if (!localDestino) {
      return NextResponse.json(
        { ok: false, error: "Local destino inexistente" },
        { status: 400 }
      );
    }

    for (const item of transferencia.detalle) {
      const cant = Number(item.cantidad || 0);

      if (cant <= 0) continue;

      await prisma.stockLocal.upsert({
        where: {
          localId_productoId: {
            localId: destinoId,
            productoId: item.productoId,
          },
        },
        update: {
          cantidad: {
            increment: cant,
          },
        },
        create: {
          localId: destinoId,
          productoId: item.productoId,
          cantidad: cant,
          stockMin: 0,
          stockMax: 0,
        },
      });
    }

    const recibida = await prisma.transferencia.update({
      where: { id: transferenciaId },
      data: {
        estado: "Recibida",
        fechaRecepcion: new Date(),
      },
      include: { detalle: true },
    });

    return NextResponse.json({
      ok: true,
      item: recibida,
      error: null,
    });

  } catch (err) {
    console.error("Error recibir transferencia POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al recibir transferencia" },
      { status: 500 }
    );
  }
}
