// POST /api/pos-ventas/retiros/[token]/cancelar
//
// DESHACE un corte de retiro que todavía no confirmó nada.
//
// ES MÁS SIMPLE QUE CANCELAR UN CIERRE, Y NO POR CASUALIDAD
//
// Un corte de retiro no congela el turno, no publica ningún sobre y no mueve
// plata: el cambio separado nunca salió del cajón y no se creó ningún
// CajaMovimiento. No hay nadie que pueda depender de él, así que no hay nada que
// verificar antes de deshacerlo. Lo único que se exige es que no esté ya
// confirmado, porque a esa altura la plata sí salió.
//
// La fila NO se borra: queda como evidencia de que alguien tomó un corte y lo
// deshizo, con motivo y autor.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ESTADO_RETIRO, retiroCancelable } from "@/lib/caja/retiroRelevo";
import {
  cargarRetiroPorToken,
  bloquearRetiro,
  serializarRetiroPreparacion,
} from "@/lib/caja/retiroRelevoServer";
import { bloquearTurno, OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";

export async function POST(req, context) {
  try {
    const { token } = await context.params;
    const res = await cargarRetiroPorToken(req, token);
    if (res.error) {
      return NextResponse.json(
        { ok: false, error: res.error, needsContexto: res.needsContexto },
        { status: res.status }
      );
    }
    const { session, retiro } = res;

    const body = await req.json().catch(() => ({}));
    const motivo = String(body?.motivo ?? "").trim().slice(0, 500);
    if (!motivo) {
      return NextResponse.json(
        { ok: false, error: "Explicá por qué cancelás el retiro." },
        { status: 400 }
      );
    }

    const cancelado = await prisma.$transaction(async (tx) => {
      // Mismo orden de locks que la confirmación —turno y después preparación—
      // para que las dos no puedan quedar esperándose en cruz.
      await bloquearTurno(tx, retiro.turnoId);
      await bloquearRetiro(tx, retiro.id);

      const fila = await tx.retiroPreparacion.findUnique({ where: { id: retiro.id } });
      if (!retiroCancelable(fila)) {
        const e = new Error(
          fila.estado === ESTADO_RETIRO.CONFIRMADO
            ? "Este retiro ya se confirmó: no se puede cancelar."
            : "Este retiro ya estaba cancelado."
        );
        e.codigo = "conflicto";
        throw e;
      }

      return tx.retiroPreparacion.update({
        where: { id: retiro.id },
        data: {
          estado: ESTADO_RETIRO.CANCELADO,
          canceladoEn: new Date(),
          canceladoPorUsuarioId: session.id,
          motivoCancelacion: motivo,
        },
      });
    }, OPCIONES_TX);

    return NextResponse.json({ ok: true, retiro: serializarRetiroPreparacion(cancelado) });
  } catch (error) {
    if (error?.codigo === "conflicto") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    console.error("Error cancelando retiro de recaudación:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
