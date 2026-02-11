// app/api/pos-transferencias/enviar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { toUnidades, validarEnvio } from "@/lib/conversiones/stock";

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
    // Preparar ítems válidos (cantidadRaw + unidadEnviada)
    // Nota: TransferenciaDetalle.cantidad se guarda en la unidad indicada por unidadEnviada.
    //       La conversión a UNIDADES se hace en confirmar-recepcion para actualizar StockLocal.
    // --------------------------------------------------
    const items = pos.detalles
      .map((detalle) => {
        const cantidadPreparada = Number(detalle.preparado || 0);
        const cantidadSugerida = Number(detalle.sugerido || 0);
        const cantidadRaw =
          cantidadPreparada > 0 ? cantidadPreparada : cantidadSugerida;

        if (!cantidadRaw || cantidadRaw <= 0) return null;

        const base = detalle.producto?.base;
        const factorPack = Number(base?.factor_pack || 1);

        const modoEnvio =
          base?.modo_envio ||
          (base?.unidad_medida === "cajon" ? "SOLO_BULTO" : "MIXTO");

        // Unidad usada (BULTO/UNIDAD) queda persistida en TransferenciaDetalle.unidadEnviada
        const unidadPreparada =
          detalle.unidadPreparada || detalle.unidadSugerida || "BULTO";

        // Validar según modo_envio
        const validacion = validarEnvio({
          modoEnvio,
          unidadElegida: unidadPreparada,
        });
        if (!validacion.ok) {
          throw new Error(
            `Producto ${base?.nombre || "N/A"}: ${validacion.error}`
          );
        }

        // Solo para validar coherencia (no se guarda en transferencia)
        // Esto asegura que si alguien elige BULTO con factor 1, la conversión no rompe.
        toUnidades({
          cantidad: cantidadRaw,
          unidad: unidadPreparada,
          factorPack,
        });

        return {
          detalle,
          cantidadRaw, // Cantidad original (bultos o unidades, según unidadEnviada)
          unidadEnviada: unidadPreparada, // "BULTO" | "UNIDAD"
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
            nombre: item.productoLocalOrigen?.nombre || base?.nombre || "",
            descripcion:
              item.productoLocalOrigen?.descripcion || base?.descripcion || "",
            precio_costo:
              item.productoLocalOrigen?.precio_costo || base?.precio_costo,
            precio_venta:
              item.productoLocalOrigen?.precio_venta || base?.precio_venta,
          },
        });

        detallesTransferencia.push({
          productoId: productoLocalDestino.id,
          cantidad: item.cantidadRaw, // 👈 IMPORTANTE: en unidad indicada por unidadEnviada
          unidadEnviada: item.unidadEnviada, // "BULTO" | "UNIDAD"
        });
      }

      if (!detallesTransferencia.length) {
        throw new Error(
          "No se generaron detalles válidos para la transferencia"
        );
      }

      const nuevaTransferencia = await tx.transferencia.create({
        data: {
          origenId: pos.origenId,
          destinoId: pos.destinoId,
          creadaPor: pos.usuarioId,

          estado: "Enviada",
          fechaEnvio: new Date(),

          detalle: {
            create: detallesTransferencia,
          },
        },
        include: { detalle: true },
      });

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
