// GET /api/pos-ventas/cambios-pendientes/[id]
//
// Detalle de UN sobre de cambio: quién lo dejó, cuándo, cuánto y con qué
// billetes. Es lo que la pantalla de apertura necesita para que el operador
// entrante pueda contar contra algo concreto en vez de un total suelto.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reservaVencida } from "@/lib/caja/cierreRelevo";
import { contextoRelevo, serializarCambio } from "@/lib/caja/cierreRelevoServer";

export async function GET(req, context) {
  try {
    const ctx = await contextoRelevo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error, needsContexto: ctx.needsContexto },
        { status: ctx.status }
      );
    }

    const { id } = await context.params;
    const cambioId = Number(id);
    if (!Number.isInteger(cambioId) || cambioId <= 0) {
      return NextResponse.json({ ok: false, error: "Id inválido" }, { status: 400 });
    }

    // El localId va en el WHERE, no en una validación posterior: un sobre de otro
    // local simplemente no existe para esta consulta.
    const fila = await prisma.cambioPendiente.findFirst({
      where: { id: cambioId, localId: ctx.localId },
      include: {
        turnoOrigen: {
          select: {
            id: true, apertura: true, cierre: true,
            vendedor: { select: { nombre: true } },
            operador: { select: { nombre: true } },
          },
        },
      },
    });
    if (!fila) {
      return NextResponse.json({ ok: false, error: "Cambio no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      cambio: {
        ...serializarCambio(fila),
        // Se informa, no se corrige: liberar acá convertiría una lectura en una
        // escritura silenciosa. La liberación real ocurre en el listado y al
        // intentar reservar.
        reservaVencida: reservaVencida(fila),
        turnoOrigen: {
          id: fila.turnoOrigen.id,
          apertura: fila.turnoOrigen.apertura,
          cierre: fila.turnoOrigen.cierre,
        },
      },
    });
  } catch (error) {
    console.error("Error leyendo cambio pendiente:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
