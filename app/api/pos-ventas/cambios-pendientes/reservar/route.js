// POST /api/pos-ventas/cambios-pendientes/reservar
//
// Toma un sobre de cambio para contarlo, sin abrir el turno todavía.
//
// LA RESERVA ES UN UPDATE CONDICIONAL, NO UN LOCK
//
//     UPDATE ... SET estado = RESERVADO
//     WHERE id = ? AND estado = DISPONIBLE
//
// Un UPDATE con condición es atómico por sí mismo en Postgres: si dos operadores
// tocan el mismo sobre al mismo tiempo, uno afecta 1 fila y el otro afecta 0. No
// hace falta bloquear nada ni leer antes de escribir — leer primero es
// exactamente lo que abre la ventana de carrera.
//
// La reserva vence sola y vuelve a DISPONIBLE: ver MINUTOS_RESERVA_CAMBIO.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { ESTADO_CAMBIO, vencimientoReserva } from "@/lib/caja/cierreRelevo";
import {
  contextoRelevo,
  liberarReservasVencidas,
  serializarCambio,
} from "@/lib/caja/cierreRelevoServer";

export async function POST(req) {
  try {
    const ctx = await contextoRelevo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error, needsContexto: ctx.needsContexto },
        { status: ctx.status }
      );
    }
    const { session, localId } = ctx;

    const body = await req.json().catch(() => ({}));
    const cambioId = Number(body?.cambioPendienteId);
    if (!Number.isInteger(cambioId) || cambioId <= 0) {
      return NextResponse.json(
        { ok: false, error: "cambioPendienteId requerido" },
        { status: 400 }
      );
    }

    const gateOp = await requireOperadorSegunConfig(req, session, { localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    const ahora = new Date();

    // Primero se liberan las reservas caídas: si el sobre que se quiere tomar
    // tenía una reserva abandonada, esto lo devuelve a DISPONIBLE y el UPDATE de
    // abajo lo encuentra libre.
    await liberarReservasVencidas(localId, ahora);

    const { count } = await prisma.cambioPendiente.updateMany({
      // `estado: DISPONIBLE` y `turnoDestinoId: null` en el WHERE son el candado.
      // El segundo es redundante hoy —RECIBIDO siempre tiene destino— y está a
      // propósito: si alguna vez un camino nuevo dejara un estado inconsistente,
      // la reserva igual no podría robar un sobre ya consumido.
      where: {
        id: cambioId,
        localId,
        estado: ESTADO_CAMBIO.DISPONIBLE,
        turnoDestinoId: null,
      },
      data: {
        estado: ESTADO_CAMBIO.RESERVADO,
        reservadoPorUsuarioId: session.id,
        reservadoPorOperadorId: gateOp.operadorId ?? null,
        reservadoEn: ahora,
        reservaVenceEn: vencimientoReserva(ahora),
      },
    });

    if (count !== 1) {
      // Perdió la carrera, o el sobre ya no estaba disponible. Se lee para
      // explicar POR QUÉ en vez de devolver un "no se pudo" seco.
      const actual = await prisma.cambioPendiente.findFirst({
        where: { id: cambioId, localId },
        select: { id: true, estado: true },
      });
      if (!actual) {
        return NextResponse.json({ ok: false, error: "Cambio no encontrado" }, { status: 404 });
      }
      const porque =
        actual.estado === ESTADO_CAMBIO.RESERVADO
          ? "Otro operador acaba de tomar este cambio."
          : actual.estado === ESTADO_CAMBIO.RECIBIDO
            ? "Este cambio ya lo recibió otro turno."
            : "Este cambio ya no está disponible.";
      return NextResponse.json(
        { ok: false, error: porque, estadoActual: actual.estado },
        { status: 409 }
      );
    }

    const fila = await prisma.cambioPendiente.findUnique({ where: { id: cambioId } });
    return NextResponse.json({ ok: true, cambio: serializarCambio(fila) });
  } catch (error) {
    console.error("Error reservando cambio pendiente:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
