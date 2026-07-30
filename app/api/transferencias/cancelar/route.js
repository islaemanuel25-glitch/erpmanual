// app/api/transferencias/cancelar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { getCookieValue } from "@/lib/auth";
import { toUnidades } from "@/lib/conversiones/stock";
import { bloqueoCancelacion } from "@/lib/ventas-internas/integracionVenta";

export async function POST(req) {
  try {
    const auth = requirePerm(req, "transferencias.cancelar");
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
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

    // Scope: non-admin solo puede cancelar transferencias de su local
    if (!auth.session.esAdmin) {
      let localId = null;
      const raw = getCookieValue(req, "erpazul_contexto_activo");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const ctx = Number(parsed.localId);
          if (ctx > 0) localId = ctx;
        } catch {}
      }
      if (!localId && auth.session.localId) localId = Number(auth.session.localId);

      if (!localId || transferencia.origenId !== localId) {
        return NextResponse.json(
          { ok: false, error: "No podés cancelar esta transferencia" },
          { status: 403 }
        );
      }
    }

    // Generada desde una venta: cancelar haría `cantidad += enviado`, pero la venta
    // ya hizo el `cantidad -=` (la transferencia usa SOLO_TRANSITO). Devolvería
    // mercadería que la venta sigue cobrando: stock inventado y deuda viva.
    // Se rechaza ANTES de la transacción: no se toca stock ni estado.
    const bloqueo = bloqueoCancelacion(transferencia);
    if (bloqueo) {
      return NextResponse.json(
        { ok: false, error: bloqueo.error, code: bloqueo.code },
        { status: bloqueo.status }
      );
    }

    if (transferencia.estado !== "Enviada") {
      return NextResponse.json(
        {
          ok: false,
          error: `Solo se puede cancelar una transferencia en estado "Enviada". Estado actual: "${transferencia.estado}"`,
        },
        { status: 400 }
      );
    }

    // ============================================================
    // TRANSACCIÓN CON BARRERA ATÓMICA
    // ============================================================
    await prisma.$transaction(async (tx) => {
      // Barrera atómica: tomar exclusividad con updateMany condicional.
      // Solo pasa si estado es "Enviada".
      // Si otro proceso ya cambió el estado, count = 0 → abortar.
      const lock = await tx.transferencia.updateMany({
        where: {
          id: transferenciaId,
          estado: "Enviada",
        },
        data: { estado: "Cancelando" },
      });

      if (lock.count === 0) {
        throw new Error("ALREADY_PROCESSED");
      }

      // Revertir stock en origen para cada detalle
      for (const d of transferencia.detalle) {
        const enviada = Number(d.cantidad || 0);
        if (enviada <= 0) continue;

        const factor = Number(d.producto?.base?.factor_pack || 1);
        const unidadEnviada = d.unidadEnviada || "BULTO";

        // Misma conversión que enviar/route.js línea 250-254
        const unidadesStock = toUnidades({
          cantidad: enviada,
          unidad: unidadEnviada,
          factorPack: factor,
        });

        if (unidadesStock <= 0) continue;

        // Buscar producto en origen por baseId
        const productoOrigen = await tx.productoLocal.findUnique({
          where: {
            localId_baseId: {
              localId: transferencia.origenId,
              baseId: d.producto.base.id,
            },
          },
        });

        if (productoOrigen) {
          // Revertir: cantidad += enviado, enTransito -= enviado
          await tx.stockLocal.updateMany({
            where: {
              localId: transferencia.origenId,
              productoId: productoOrigen.id,
            },
            data: {
              cantidad: { increment: unidadesStock },
              enTransito: { decrement: unidadesStock },
            },
          });
        }
      }

      // Estado final (no hay campos fechaCancelacion/canceladaPor en el schema,
      // se usa updatedAt como registro implícito de cuándo se canceló)
      await tx.transferencia.update({
        where: { id: transferenciaId },
        data: { estado: "Cancelada" },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.message === "ALREADY_PROCESSED") {
      return NextResponse.json(
        { ok: false, error: "Esta transferencia ya fue procesada y no se puede cancelar." },
        { status: 400 }
      );
    }
    console.error("ERROR cancelar transferencia:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al cancelar" },
      { status: 500 }
    );
  }
}
