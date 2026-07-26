// app/api/transferencias/confirmar-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { esFiambreFijo, piezasToKg } from "@/lib/conversiones/stock";
import { esComboBase } from "@/lib/combos/guards";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "transferencias.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const esAdmin = session.esAdmin;

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

    // Validar estado antes de procesar
    if (transferencia.estado === "Recibida") {
      return NextResponse.json(
        { ok: false, error: "Esta transferencia ya fue confirmada. No se puede volver a confirmar." },
        { status: 400 }
      );
    }

    if (transferencia.estado !== "Enviada" && transferencia.estado !== "Recibiendo") {
      return NextResponse.json(
        { ok: false, error: `No se puede confirmar una transferencia en estado "${transferencia.estado}"` },
        { status: 400 }
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

    // ============================================================
    // TODO en transacción para consistencia de stock
    // ============================================================
    await prisma.$transaction(async (tx) => {
      // Barrera atómica: tomar exclusividad con updateMany condicional.
      // Solo pasa si estado es Enviada o Recibiendo.
      // Si otro proceso ya cambió el estado, count = 0 → abortar.
      const lock = await tx.transferencia.updateMany({
        where: {
          id: transferenciaId,
          estado: { in: ["Enviada", "Recibiendo"] },
        },
        data: { estado: "Confirmando" },
      });

      if (lock.count === 0) {
        throw new Error("ALREADY_CONFIRMED");
      }

      let tieneDiferencias = false;

      for (const d of transferencia.detalle) {
        // Defensa: los combos no tienen stock físico, no se procesan aquí.
        if (esComboBase(d.producto.base)) continue;

        const enviada = Number(d.cantidad || 0);

        const recibida =
          d.recibido && Number(d.recibido) > 0 ? Number(d.recibido) : enviada;

        if (recibida !== enviada) tieneDiferencias = true;

        // ============================================================
        // 🟦 CONVERSIÓN: TransferenciaDetalle.cantidad está en la unidad
        // indicada por d.unidadEnviada (BULTO/UNIDAD).
        // StockLocal SIEMPRE en UNIDADES (o kg para local de fiambre fijo).
        // ============================================================
        const factor = Number(d.producto.base.factor_pack || 1);
        const unidadEnviada = d.unidadEnviada || "BULTO"; // compat
        const esFijo = esFiambreFijo(d.producto.base);

        // Unidades para descontar del depósito (piezas para fiambre fijo, unidades normal)
        const recibidaUnidades =
          unidadEnviada === "BULTO" && factor > 1 ? recibida * factor : recibida;

        // Unidades para sumar al local (KG para fiambre fijo, unidades normal)
        const incrementoLocal = esFijo
          ? piezasToKg(recibida, Number(d.producto.base.pesoReferenciaKg))
          : recibidaUnidades;

        // ============================================================
        // 🟦 PRODUCTO DESTINO
        // ============================================================
        let productoDestino = await tx.productoLocal.findUnique({
          where: {
            localId_baseId: {
              localId: transferencia.destinoId,
              baseId: d.producto.base.id,
            },
          },
        });

        if (!productoDestino) {
          productoDestino = await tx.productoLocal.create({
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

          await tx.stockLocal.create({
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
        // 🟩 SUMAR AL DESTINO (KG para fiambre fijo, unidades normal)
        // ============================================================
        await tx.stockLocal.upsert({
          where: {
            localId_productoId: {
              localId: transferencia.destinoId,
              productoId: productoDestino.id,
            },
          },
          update: { cantidad: { increment: incrementoLocal } },
          create: {
            localId: transferencia.destinoId,
            productoId: productoDestino.id,
            cantidad: incrementoLocal,
          },
        });

        // ============================================================
        // 🟥 DESCONTAR enTransito DEL ORIGEN (por lo ENVIADO, no lo recibido)
        // La cantidad ya se descontó al enviar. Aquí solo limpiamos tránsito.
        // ============================================================
        const enviadaUnidades =
          unidadEnviada === "BULTO" && factor > 1 ? enviada * factor : enviada;

        const productoOrigen = await tx.productoLocal.findUnique({
          where: {
            localId_baseId: {
              localId: transferencia.origenId,
              baseId: d.producto.base.id,
            },
          },
        });

        if (productoOrigen) {
          await tx.stockLocal.updateMany({
            where: {
              localId: transferencia.origenId,
              productoId: productoOrigen.id,
            },
            data: { enTransito: { decrement: enviadaUnidades } },
          });
        }

        // ============================================================
        // 🟨 GUARDAR RECEPCIÓN
        // ============================================================
        await tx.transferenciaDetalle.update({
          where: { id: d.id },
          data: {
            recibido: recibida, // en la misma unidad que 'enviada'
            confirmadoPorId: session.id || null,
            fechaRecepcion: new Date(),
          },
        });
      }

      // ============================================================
      // 🟩 CABECERA
      // ============================================================
      await tx.transferencia.update({
        where: { id: transferenciaId },
        data: {
          estado: "Recibida",
          fechaRecepcion: new Date(),
          tieneDiferencias,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.message === "ALREADY_CONFIRMED") {
      return NextResponse.json(
        { ok: false, error: "Esta transferencia ya fue confirmada." },
        { status: 400 }
      );
    }
    console.error("ERROR confirmar recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
