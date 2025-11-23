// app/api/pos-transferencias/enviar/route.js
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

    const pos = await prisma.posTransferencia.findUnique({
      where: { id: posId },
      include: {
        detalles: {
          include: {
            producto: {
              include: { base: true },
            },
          },
        },
      },
    });

    if (!pos) {
      return NextResponse.json(
        { ok: false, error: "POS no encontrada" },
        { status: 404 }
      );
    }

    if (pos.estado === "Enviado") {
      return NextResponse.json(
        { ok: false, error: "La POS ya fue enviada" },
        { status: 400 }
      );
    }

    if (!pos.detalles || pos.detalles.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay ítems para enviar" },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // Preparar ítems válidos
    // --------------------------------------------------
    const items = pos.detalles
      .map((detalle) => {
        const cantidadPreparada = Number(detalle.preparado || 0);
        const cantidadSugerida = Number(detalle.sugerido || 0);
        const cantidad =
          cantidadPreparada > 0 ? cantidadPreparada : cantidadSugerida;

        if (!cantidad || cantidad <= 0) return null;

        return {
          detalle,
          cantidad,
          baseId: detalle.producto?.baseId,
          productoLocalOrigen: detalle.producto,
        };
      })
      .filter(Boolean);

    if (!items.length) {
      return NextResponse.json(
        { ok: false, error: "No hay cantidades válidas para enviar" },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // TRANSACCIÓN REAL
    // --------------------------------------------------
    const transferencia = await prisma.$transaction(async (tx) => {
      const detallesTransferencia = [];

      for (const item of items) {
        if (!item.baseId) {
          throw new Error("Producto sin baseId asignado");
        }

        const base = item.productoLocalOrigen?.base;

        // Producto en el destino
        const productoLocalDestino = await tx.productoLocal.upsert({
          where: {
            localId_baseId: {
              localId: pos.destinoId,
              baseId: item.baseId,
            },
          },
          update: {},
          create: {
            localId: pos.destinoId,
            baseId: item.baseId,
            nombre:
              item.productoLocalOrigen?.nombre || base?.nombre || "",
            descripcion:
              item.productoLocalOrigen?.descripcion ||
              base?.descripcion ||
              "",
            precio_costo:
              item.productoLocalOrigen?.precio_costo ||
              base?.precio_costo,
            precio_venta:
              item.productoLocalOrigen?.precio_venta ||
              base?.precio_venta,
          },
        });

        detallesTransferencia.push({
          productoId: productoLocalDestino.id,
          cantidad: item.cantidad,
        });
      }

      if (!detallesTransferencia.length) {
        throw new Error("No se generaron detalles válidos para la transferencia");
      }

      // --------------------------------------------------
      // CREAR TRANSFERENCIA REAL (ACÁ ESTÁ EL CAMBIO)
      // --------------------------------------------------
      const nuevaTransferencia = await tx.transferencia.create({
        data: {
          origenId: pos.origenId,
          destinoId: pos.destinoId,
          creadaPor: pos.usuarioId,

          estado: "Enviada",        // 🔥 ANTES: Pendiente
          fechaEnvio: new Date(),   // 🔥 NUEVO CAMPO

          detalle: {
            create: detallesTransferencia,
          },
        },
        include: { detalle: true },
      });

      // MARCAR POS COMO ENVIADA
      await tx.posTransferencia.update({
        where: { id: pos.id },
        data: { estado: "Enviado" },
      });

      return nuevaTransferencia;
    });

    return NextResponse.json({
      ok: true,
      item: transferencia,
      posId,
      totalItems: items.length,
      error: null,
    });
  } catch (err) {
    console.error("Error enviar POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al enviar POS" },
      { status: 500 }
    );
  }
}
