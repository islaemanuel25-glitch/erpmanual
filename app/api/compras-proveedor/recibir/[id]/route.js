// app/api/compras-proveedor/recibir/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

export async function POST(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId } = ctx;
    const { id } = await params;
    const pedidoId = Number(id);

    if (!pedidoId) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
      include: {
        detalles: {
          include: {
            producto: {
              include: {
                base: {
                  select: {
                    id: true,
                    factor_pack: true,
                    modoCompraProveedor: true,
                    pesoReferenciaKg: true,
                    pesoEsFijo: true,
                    pesoPromedioKg: true,
                    actualizaPromedioPorRecepcion: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!pedido || pedido.grupoId !== grupoId) {
      return NextResponse.json(
        { ok: false, error: "Pedido no encontrado" },
        { status: 404 }
      );
    }

    // Solo ENVIADO → RECIBIDO
    if (pedido.estado !== "ENVIADO") {
      return NextResponse.json(
        {
          ok: false,
          error: `Solo se puede recibir un pedido en estado ENVIADO. Estado actual: ${pedido.estado}`,
        },
        { status: 400 }
      );
    }

    // Leer cantidades recibidas del body (opcional — si no vienen, usa cantidad pedida)
    const body = await req.json().catch(() => ({}));
    const recibidos = body.recibidos || {}; // { detalleId: cantidadRecibida }
    const kgRecibidosMap = body.kgRecibidos || {}; // { detalleId: kgReales }

    // Validar cantidades recibidas: entero finito >= 0
    for (const [detId, cant] of Object.entries(recibidos)) {
      const c = Number(cant);
      if (!Number.isFinite(c) || !Number.isInteger(c) || c < 0) {
        return NextResponse.json(
          { ok: false, error: `cantidad debe ser un entero >= 0 (detalleId: ${detId})` },
          { status: 400 }
        );
      }
    }

    // Validar kg recibidos para fiambres
    for (const [detId, kg] of Object.entries(kgRecibidosMap)) {
      const k = Number(kg);
      if (!Number.isFinite(k) || k < 0) {
        return NextResponse.json(
          { ok: false, error: `kgRecibidos debe ser un numero >= 0 (detalleId: ${detId})` },
          { status: 400 }
        );
      }
    }

    const depositoId = pedido.depositoId;

    // Transacción: incrementar stock + marcar recibido
    await prisma.$transaction(async (tx) => {
      for (const det of pedido.detalles) {
        const cantRecibida =
          recibidos[det.id] !== undefined
            ? Number(recibidos[det.id])
            : Number(det.cantidad);

        if (cantRecibida <= 0) continue;

        const base = det.producto?.base;
        const modoCompra = base?.modoCompraProveedor || "BULTO";

        let incremento;
        let kgReales = null;

        if (modoCompra === "UNIDAD") {
          // FIAMBRE: stock incrementa por kg reales, no por unidades
          kgReales = kgRecibidosMap[det.id] !== undefined
            ? Number(kgRecibidosMap[det.id])
            : null;

          if (kgReales === null || kgReales <= 0) {
            // Fallback: estimar desde pesoReferencia * cantRecibida
            const pesoRef = Number(base.pesoReferenciaKg || 1);
            kgReales = cantRecibida * pesoRef;
          }

          incremento = kgReales;

          // Actualizar pesoPromedioKg si está habilitado
          if (base.actualizaPromedioPorRecepcion && cantRecibida > 0 && kgReales > 0) {
            const nuevoPesoPromedio = kgReales / cantRecibida;
            await tx.productoBase.update({
              where: { id: base.id },
              data: { pesoPromedioKg: nuevoPesoPromedio },
            });
          }
        } else {
          // BULTO: StockLocal del depósito SIEMPRE en UNIDADES.
          // cantRecibida viene en bultos → convertir a unidades.
          const factorPack = Math.max(1, Number(base?.factor_pack || 1));
          incremento = cantRecibida * factorPack;
        }

        // productoLocalId ya apunta directo al ProductoLocal del depósito
        await tx.stockLocal.upsert({
          where: {
            localId_productoId: {
              localId: depositoId,
              productoId: det.productoLocalId,
            },
          },
          update: {
            cantidad: { increment: incremento },
          },
          create: {
            localId: depositoId,
            productoId: det.productoLocalId,
            cantidad: incremento,
          },
        });

        // Actualizar cantidadRecibida y kgRecibidos en detalle
        await tx.pedidoProveedorDetalle.update({
          where: { id: det.id },
          data: {
            cantidadRecibida: cantRecibida,
            kgRecibidos: kgReales,
          },
        });
      }

      // Marcar pedido como RECIBIDO
      await tx.pedidoProveedor.update({
        where: { id: pedidoId },
        data: {
          estado: "RECIBIDO",
          fechaRecibido: new Date(),
        },
      });
    });

    // Devolver pedido actualizado
    const updated = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        deposito: { select: { id: true, nombre: true } },
        detalles: {
          include: {
            producto: {
              include: {
                base: { select: { id: true, nombre: true, sku: true, modoCompraProveedor: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (err) {
    console.error("Error compras-proveedor/recibir:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al recibir pedido" },
      { status: 500 }
    );
  }
}
