// POST /api/pos-ventas/cambios-pendientes/liberar
//
// Devuelve un sobre reservado a DISPONIBLE, sin consumirlo.
//
// POR QUÉ ESTO SÍ SE LIBERA Y UN CORTE VENCIDO NO
//
// Una reserva abandonada no movió plata: el sobre sigue físicamente en el local,
// nadie lo abrió, y devolverlo a la lista no pierde nada. Un corte vencido, en
// cambio, ya congeló un turno y ya sacó una caja de operación: liberarlo
// perdería el cierre. Son dos vencimientos con consecuencias distintas y por eso
// se tratan distinto.
//
// Dos caminos llegan acá: el operador que dice "me arrepentí", y el vencimiento
// automático que ya corre solo al listar. Este endpoint no puede tocar un sobre
// que ya fue RECIBIDO — ese es terminal.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getOperadorActivo } from "@/lib/operador";
import { ESTADO_CAMBIO, reservaVencida, esReservaPropia } from "@/lib/caja/cierreRelevo";
import { contextoRelevo, serializarCambio } from "@/lib/caja/cierreRelevoServer";

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

    const fila = await prisma.cambioPendiente.findFirst({
      where: { id: cambioId, localId },
      select: {
        id: true, estado: true, reservadoPorUsuarioId: true, reservadoPorOperadorId: true,
        reservaVenceEn: true, turnoDestinoId: true,
      },
    });
    if (!fila) {
      return NextResponse.json({ ok: false, error: "Cambio no encontrado" }, { status: 404 });
    }
    if (fila.estado === ESTADO_CAMBIO.RECIBIDO || fila.turnoDestinoId) {
      return NextResponse.json(
        { ok: false, error: "Este cambio ya lo recibió un turno: no se puede liberar." },
        { status: 409 }
      );
    }
    if (fila.estado !== ESTADO_CAMBIO.RESERVADO) {
      return NextResponse.json(
        { ok: false, error: "Este cambio no está reservado.", estadoActual: fila.estado },
        { status: 409 }
      );
    }

    // Quién puede soltar la reserva: quien la tomó, o cualquiera si ya venció.
    // Que un tercero pueda liberar una reserva VIVA significaría que puede
    // arrebatarle el sobre a alguien que lo está contando.
    //
    // "Quien la tomó" es el usuario Y el operario: en una computadora del
    // mostrador el usuario es el dispositivo y lo comparten todos.
    const operadorId = getOperadorActivo(req)?.operadorId ?? null;
    const propia = esReservaPropia(fila, { usuarioId: session.id, operadorId });
    if (!propia && !reservaVencida(fila)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Otro operador tiene reservado este cambio y su reserva sigue vigente.",
        },
        { status: 409 }
      );
    }

    // UPDATE condicional otra vez: entre la lectura y esta escritura el sobre
    // pudo haber sido consumido por una apertura.
    const { count } = await prisma.cambioPendiente.updateMany({
      where: { id: cambioId, localId, estado: ESTADO_CAMBIO.RESERVADO, turnoDestinoId: null },
      data: {
        estado: ESTADO_CAMBIO.DISPONIBLE,
        reservadoPorUsuarioId: null,
        reservadoPorOperadorId: null,
        reservadoEn: null,
        reservaVenceEn: null,
      },
    });
    if (count !== 1) {
      return NextResponse.json(
        { ok: false, error: "El cambio dejó de estar reservado mientras se liberaba." },
        { status: 409 }
      );
    }

    const actual = await prisma.cambioPendiente.findUnique({ where: { id: cambioId } });
    return NextResponse.json({ ok: true, cambio: serializarCambio(actual) });
  } catch (error) {
    console.error("Error liberando cambio pendiente:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
