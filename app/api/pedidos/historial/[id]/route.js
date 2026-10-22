// app/api/pedidos/historial/[id]/route.js
//
// EL DETALLE DE UN PEDIDO DEL HISTORIAL DEL LOCAL (2026-10-22).
//
// Con los mismos permisos y el mismo alcance que la lista
// (`lib/pedidos/alcanceDelHistorial.js`, compartido): un pedido de OTRO local,
// uno que no se le hizo al depósito del grupo, o uno que el historial no
// muestra, contesta 404 —no 403—, igual que uno que no existe: decir "existe
// pero no es tuyo" ya es contar algo.
//
// Solo lectura. Los renglones van con la forma del carrito
// (`lib/pedidos/itemDelPedido.js`), para dibujar la misma tarjeta.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { alcanceDelHistorial, pedidosDelHistorial, ESTADOS_DEL_HISTORIAL } from "@/lib/pedidos/alcanceDelHistorial";
import { itemDelPedido } from "@/lib/pedidos/itemDelPedido";
import { depositoEmpezo } from "@/lib/pedidos/bloqueoDelPedido";

const NO_ENCONTRADO = { ok: false, error: "No se encontró ese pedido en el historial de este local." };

export async function GET(req, { params }) {
  try {
    const alcance = await alcanceDelHistorial(req);
    if (alcance.respuesta) return alcance.respuesta;

    const { id } = await params;
    const posId = Number(id);
    if (!Number.isInteger(posId) || posId <= 0) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 });
    }

    // Los cancelados entran, como en la lista (`ESTADOS_DEL_HISTORIAL`): esta
    // lectura no pasa por `sinCancelados`.
    const pos = await prisma.posTransferencia.findFirst({
      where: { ...pedidosDelHistorial(alcance), id: posId, estado: { in: ESTADOS_DEL_HISTORIAL } },
      include: {
        detalles: {
          include: { producto: { include: { base: true } } },
          orderBy: { id: "asc" },
        },
        transferencias: {
          select: { id: true, estado: true, fechaEnvio: true, fechaRecepcion: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!pos) return NextResponse.json(NO_ENCONTRADO, { status: 404 });

    const trans = pos.transferencias?.[0] || null;
    return NextResponse.json({
      ok: true,
      pedido: {
        posId: pos.id,
        estado: pos.estado,
        solicitadoAt: pos.solicitadoAt,
        createdAt: pos.createdAt,
        canceladoAt: pos.canceladoAt,
        // El criterio de "empezado" es UNO (`lib/pedidos/bloqueoDelPedido.js`):
        // separa "Enviado" de "Preparando".
        depositoEmpezo: await depositoEmpezo(prisma, pos),
        transferencia: trans
          ? { id: trans.id, estado: trans.estado, fechaEnvio: trans.fechaEnvio, fechaRecepcion: trans.fechaRecepcion }
          : null,
        items: pos.detalles.map(itemDelPedido),
      },
    });
  } catch (err) {
    console.error("Error pedidos/historial/[id]:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo leer el pedido: ${err?.message || "error desconocido"}` },
      { status: 500 }
    );
  }
}
