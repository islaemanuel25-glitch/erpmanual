// app/api/compras-proveedor/recibir/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { subtotalLinea } from "@/lib/compras-proveedor/calculoPedido";

export async function POST(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

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

    // --- Factura / ganancia (opcionales) ---
    // totalFactura se computa en la transacción desde cantRecibida * precioCosto
    let totalReal = null;
    let nroFactura = null;
    let fechaFactura = null;

    if (body.totalReal !== undefined && body.totalReal !== "" && body.totalReal !== null) {
      const tr = Number(body.totalReal);
      if (!Number.isFinite(tr) || tr < 0) {
        return NextResponse.json(
          { ok: false, error: "totalReal debe ser un número >= 0" },
          { status: 400 }
        );
      }
      totalReal = tr;
    }

    if (body.nroFactura !== undefined && body.nroFactura !== null) {
      const nf = String(body.nroFactura).trim();
      nroFactura = nf || null;
    }

    if (body.fechaFactura !== undefined && body.fechaFactura !== "" && body.fechaFactura !== null) {
      const ff = new Date(body.fechaFactura);
      if (isNaN(ff.getTime())) {
        return NextResponse.json(
          { ok: false, error: "fechaFactura inválida" },
          { status: 400 }
        );
      }
      fechaFactura = ff;
    }

    // --- Costos editados por ítem (opcionales) ---
    const costosMap = body.costos || {}; // { detalleId: precioCosto }

    for (const [detId, costo] of Object.entries(costosMap)) {
      if (costo === "" || costo === null) continue;
      const c = Number(costo);
      if (!Number.isFinite(c) || c < 0) {
        return NextResponse.json(
          { ok: false, error: `precioCosto debe ser un número >= 0 (detalleId: ${detId})` },
          { status: 400 }
        );
      }
    }

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
      let totalFacturaComputed = 0;

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
          // No-fiambre: el StockLocal del depósito SIEMPRE se guarda en UNIDADES.
          // Respeta la unidad de la línea (Opción A): BULTO entra ×factor_pack,
          // UNIDAD entra ×1. factor_pack solo afecta la ENTRADA de stock, no el dinero.
          const factorPack = Math.max(1, Number(base?.factor_pack || 1));
          const multiplicador = det.unidad === "UNIDAD" ? 1 : factorPack;
          incremento = cantRecibida * multiplicador;
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
        // Actualizar detalle: cantRecibida, kg, y costo si fue editado
        const detData = {
          cantidadRecibida: cantRecibida,
          kgRecibidos: kgReales,
        };

        const costoEditado = costosMap[det.id];
        if (costoEditado !== undefined && costoEditado !== "" && costoEditado !== null) {
          const cv = Number(costoEditado);
          if (Number.isFinite(cv) && cv >= 0) {
            detData.precioCosto = cv;
          }
        }

        await tx.pedidoProveedorDetalle.update({
          where: { id: det.id },
          data: detData,
        });

        // Acumular totalFactura con la fórmula económica única.
        // Fiambre: kg × costo (kg reales recibidos); resto: cantRecibida × costo.
        const costoFinal = detData.precioCosto !== undefined
          ? Number(detData.precioCosto)
          : Number(det.precioCosto || 0);
        const { subtotal: subtotalEconomico } = subtotalLinea({
          base,
          cantidad: cantRecibida,
          costo: costoFinal,
          kg: kgReales,
        });
        totalFacturaComputed += subtotalEconomico || 0;
      }

      // Marcar pedido como RECIBIDO + guardar factura/ganancia
      await tx.pedidoProveedor.update({
        where: { id: pedidoId },
        data: {
          estado: "RECIBIDO",
          fechaRecibido: new Date(),
          totalFactura: totalFacturaComputed,
          totalReal,
          nroFactura,
          fechaFactura,
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
