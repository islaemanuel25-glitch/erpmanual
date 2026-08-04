// POST /api/pos-ventas/turnos/abrir-sin-cambio
//
// Abre un turno contando el cajón por denominación, sin tomar ningún sobre de
// cambio pendiente.
//
// POR QUÉ EL MOTIVO ES OBLIGATORIO
//
// Si hay sobres esperando en el local y alguien abre igual con plata propia, eso
// tiene que quedar explicado. Si no, el sobre queda huérfano: nadie sabe por qué
// no se tomó, y la plata que dejó el turno anterior deja de tener a quién
// atribuirse. El motivo es lo único que después permite reconstruir qué pasó.
//
// POR QUÉ NO SE MODIFICÓ /turnos/abrir
//
// El endpoint clásico recibe un monto total escrito a mano y lo usa la pantalla
// de apertura que está hoy en producción. Exigirle denominaciones ahí rompería
// esa pantalla en el mismo despliegue, y esta subetapa es de motor: sin UI. El
// clásico queda intacto y funcionando; la migración de la pantalla es la
// subetapa D.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { validarDesgloseServidor } from "@/lib/caja/desgloseServidor";
import {
  ESTADO_CAMBIO,
  WHERE_TURNO_OPERATIVO,
  evaluarAperturaSinCambio,
} from "@/lib/caja/cierreRelevo";
import { contextoRelevo, OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";

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

    const gateOp = await requireOperadorSegunConfig(req, session, { localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    // CONTEO OBLIGATORIO. No hay monto total manual: el número sale de sumar
    // denominaciones en el servidor, igual que en todo el resto del circuito.
    const contado = validarDesgloseServidor(body?.desgloseContado, {
      etiqueta: "conteo de apertura",
      permitirVacio: false,
    });
    if (!contado.valido) {
      return NextResponse.json({ ok: false, error: contado.error }, { status: 400 });
    }

    const apertura = evaluarAperturaSinCambio({
      totalContado: contado.total,
      motivo: body?.motivo,
    });
    if (!apertura.valido) {
      return NextResponse.json(
        { ok: false, error: apertura.error, necesitaMotivo: true },
        { status: 400 }
      );
    }

    const turno = await prisma.$transaction(async (tx) => {
      // Un turno del mismo usuario que ya tomó su corte NO bloquea: ese es el
      // caso del relevo.
      const propio = await tx.turno.findFirst({
        where: { localId, vendedorId: session.id, ...WHERE_TURNO_OPERATIVO, anuladoEn: null },
        select: { id: true },
      });
      if (propio) {
        const e = new Error("Ya tenés un turno abierto en este local. Cerralo antes de abrir otro.");
        e.codigo = "conflicto";
        throw e;
      }

      return tx.turno.create({
        data: {
          localId,
          vendedorId: session.id,
          operadorId: gateOp.operadorId,
          // El total realmente contado. Ningún sobre se consume.
          montoInicial: apertura.montoInicial,
          observacionFondoApertura: apertura.motivo,
        },
      });
    }, OPCIONES_TX);

    // Informativo: si quedaron sobres sin tomar, la pantalla puede avisarlo. No
    // bloquea la apertura —el operador ya explicó por qué abre así— pero dejar
    // el dato afuera haría que el sobre se olvide en silencio.
    const sinTomar = await prisma.cambioPendiente.count({
      where: { localId, estado: { in: [ESTADO_CAMBIO.DISPONIBLE, ESTADO_CAMBIO.RESERVADO] } },
    });

    return NextResponse.json({
      ok: true,
      turno,
      montoInicial: apertura.montoInicial,
      motivo: apertura.motivo,
      cambiosPendientesSinTomar: sinTomar,
    });
  } catch (error) {
    if (error?.codigo === "conflicto") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya tenés un turno abierto en este local. Actualizá y volvé a intentar." },
        { status: 409 }
      );
    }
    console.error("Error abriendo turno sin cambio:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
