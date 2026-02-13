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
    const { localId, clienteId, turnoId, formaPago, descuento, comision, items } = body;

    // Validaciones
    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    if (!formaPago) {
      return NextResponse.json(
        { ok: false, error: "Forma de pago requerida" },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay items en la venta" },
        { status: 400 }
      );
    }

    // Validar cada item
    for (const item of items) {
      if (!item.productoBaseId || !item.cantidad || item.cantidad <= 0) {
        return NextResponse.json(
          { ok: false, error: `Item invalido: ${item.nombre || "sin nombre"}` },
          { status: 400 }
        );
      }
      if (!item.precio || item.precio <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Precio invalido para: ${item.nombre || "sin nombre"}`,
          },
          { status: 400 }
        );
      }
    }

    // Calcular totales
    const subtotal = items.reduce(
      (acc, item) => acc + item.precio * item.cantidad,
      0
    );
    const descuentoVal = Number(descuento) || 0;
    const comisionVal = Number(comision) || 0;
    const total = subtotal - descuentoVal + comisionVal;

    if (total <= 0) {
      return NextResponse.json(
        { ok: false, error: "El total debe ser mayor a 0" },
        { status: 400 }
      );
    }

    // Transaccion: crear venta + descontar stock
    const venta = await prisma.$transaction(async (tx) => {
      // Obtener proximo numero de venta para este local
      const ultima = await tx.venta.findFirst({
        where: { localId },
        orderBy: { numero: "desc" },
        select: { numero: true },
      });
      const numero = (ultima?.numero || 0) + 1;

      // Crear venta
      const nuevaVenta = await tx.venta.create({
        data: {
          localId,
          vendedorId: session.id,
          clienteId: clienteId || null,
          turnoId: turnoId || null,
          numero,
          subtotal,
          comision: comisionVal,
          descuento: descuentoVal,
          total,
          formaPago,
          detalles: {
            create: items.map((item) => ({
              productoBaseId: item.productoBaseId,
              nombre: item.nombre,
              precio: item.precio,
              cantidad: item.cantidad,
              subtotal: item.precio * item.cantidad,
            })),
          },
        },
      });

      // Descontar stock de cada item
      for (const item of items) {
        // Buscar productoLocal para este local y productoBase
        const productoLocal = await tx.productoLocal.findFirst({
          where: { localId, baseId: item.productoBaseId },
          select: { id: true },
        });

        if (!productoLocal) continue;

        // Descontar stock
        await tx.stockLocal.updateMany({
          where: {
            localId,
            productoId: productoLocal.id,
          },
          data: {
            cantidad: { decrement: item.cantidad },
          },
        });
      }

      return nuevaVenta;
    });

    return NextResponse.json({
      ok: true,
      ventaId: venta.id,
      numero: venta.numero,
      message: `Venta #${venta.numero} registrada correctamente`,
    });
  } catch (err) {
    console.error("Error crear venta POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al registrar la venta" },
      { status: 500 }
    );
  }
}
