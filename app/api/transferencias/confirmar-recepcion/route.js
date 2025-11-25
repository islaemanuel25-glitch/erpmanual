// app/api/transferencias/confirmar-recepcion/route.js
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

    const esAdmin =
      Array.isArray(session.permisos) && session.permisos.includes("*");

    const body = await req.json();
    const transferenciaId = Number(body.transferenciaId || 0);

    if (!transferenciaId) {
      return NextResponse.json(
        { ok: false, error: "transferenciaId requerido" },
        { status: 400 }
      );
    }

    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      include: {
        detalle: {
          include: {
            producto: { include: { base: true } },
          },
        },
      },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    if (!esAdmin) {
      const localId = Number(session.localId || 0);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "Usuario sin local asignado" },
          { status: 400 }
        );
      }
      if (localId !== transferencia.destinoId) {
        return NextResponse.json(
          { ok: false, error: "No podés confirmar esta transferencia" },
          { status: 403 }
        );
      }
    }

    let tieneDiferencias = false;

    for (const d of transferencia.detalle) {
      const enviada = Number(d.cantidad || 0);

      const recibida =
        d.recibido && Number(d.recibido) > 0
          ? Number(d.recibido)
          : enviada;

      if (recibida !== enviada) tieneDiferencias = true;

      // ============================================================
      // 🟦 FACTOR DE CONVERSIÓN
      // ============================================================
      const factor = Number(d.producto.base.factor_pack || 1);

      const recibidaBultos = recibida;             // depósito
      const recibidaUnidades = recibida * factor;  // local

      // ============================================================
      // 🟦 BUSCAR PRODUCTO DEL DESTINO
      // ============================================================
      let productoDestino = await prisma.productoLocal.findUnique({
        where: {
          localId_baseId: {
            localId: transferencia.destinoId,
            baseId: d.producto.base.id,
          },
        },
      });

      if (!productoDestino) {
        productoDestino = await prisma.productoLocal.create({
          data: {
            localId: transferencia.destinoId,
            baseId: d.producto.base.id,
            precio_costo:
              d.producto.precio_costo || d.producto.base.precio_costo || 0,
            precio_venta:
              d.producto.precio_venta || d.producto.base.precio_venta || 0,
            margen: d.producto.margen || d.producto.base.margen || 0,
            activo: true,
          },
        });

        await prisma.stockLocal.create({
          data: {
            localId: transferencia.destinoId,
            productoId: productoDestino.id,
            cantidad: 0,
            stockMin: 0,
            stockMax: 0,
          },
        });
      }

      // ============================================================
      // 🟩 SUMAR UNIDADES AL LOCAL
      // ============================================================
      await prisma.stockLocal.upsert({
        where: {
          localId_productoId: {
            localId: transferencia.destinoId,
            productoId: productoDestino.id,
          },
        },
        update: { cantidad: { increment: recibidaUnidades } },
        create: {
          localId: transferencia.destinoId,
          productoId: productoDestino.id,
          cantidad: recibidaUnidades,
        },
      });

      // ============================================================
      // 🟥 BUSCAR PRODUCTO ORIGEN (DEPÓSITO)
      // ============================================================
      let productoOrigen = await prisma.productoLocal.findUnique({
        where: {
          localId_baseId: {
            localId: transferencia.origenId,
            baseId: d.producto.base.id,
          },
        },
      });

      if (!productoOrigen) {
        productoOrigen = await prisma.productoLocal.create({
          data: {
            localId: transferencia.origenId,
            baseId: d.producto.base.id,
            precio_costo:
              d.producto.precio_costo || d.producto.base.precio_costo || 0,
            precio_venta:
              d.producto.precio_venta || d.producto.base.precio_venta || 0,
            margen: d.producto.margen || d.producto.base.margen || 0,
            activo: true,
          },
        });

        await prisma.stockLocal.create({
          data: {
            localId: transferencia.origenId,
            productoId: productoOrigen.id,
            cantidad: 0,
            stockMin: 0,
            stockMax: 0,
          },
        });
      }

      // ============================================================
      // 🟥 DESCONTAR BULTOS DEL DEPÓSITO
      // ============================================================
      await prisma.stockLocal.upsert({
        where: {
          localId_productoId: {
            localId: transferencia.origenId,
            productoId: productoOrigen.id,
          },
        },
        update: { cantidad: { decrement: recibidaBultos } },
        create: {
          localId: transferencia.origenId,
          productoId: productoOrigen.id,
          cantidad: -recibidaBultos,
        },
      });

      // ============================================================
      // 🟨 GUARDAR RECEPCIÓN
      // ============================================================
      await prisma.transferenciaDetalle.update({
        where: { id: d.id },
        data: {
          recibido: recibida,
          confirmadoPorId: session.id || null,
          fechaRecepcion: new Date(),
        },
      });
    }

    // ============================================================
    // 🟩 CABECERA
    // ============================================================
    await prisma.transferencia.update({
      where: { id: transferenciaId },
      data: {
        estado: "Recibida",
        fechaRecepcion: new Date(),
        tieneDiferencias,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("ERROR confirmar recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
