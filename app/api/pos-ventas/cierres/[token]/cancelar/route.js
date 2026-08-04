// POST /api/pos-ventas/cierres/[token]/cancelar
//
// DESHACE un corte que todavía no confirmó nada, y devuelve el turno a la
// operación.
//
// CANCELAR ES LA EXCEPCIÓN, NO LA SALIDA HABITUAL
//
// Solo existe para el caso real de "tomé el corte por error, todavía no conté
// nada". Apenas alguien dependa del relevo —hay un sobre de cambio publicado,
// reservado, recibido, o un turno destino— cancelar dejaría plata contada dos
// veces, y se rechaza.
//
// Un cierre VENCIDO no se cancela desde acá. Vencido significa que el cajero se
// fue sin contar y la plata está en el cajón: eso necesita una resolución
// administrativa que todavía no está definida, y fabricar una acá sería inventar
// política. Se informa como pendiente y se deja para quien la defina.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ESTADO_CIERRE, ESTADO_TURNO, estadoDelTurno } from "@/lib/caja/cierreRelevo";
import {
  cargarCierrePorToken,
  bloquearTurno,
  bloquearCierre,
  serializarCierre,
  OPCIONES_TX,
} from "@/lib/caja/cierreRelevoServer";

export async function POST(req, context) {
  try {
    const { token } = await context.params;
    const res = await cargarCierrePorToken(req, token);
    if (res.error) {
      return NextResponse.json(
        { ok: false, error: res.error, needsContexto: res.needsContexto },
        { status: res.status }
      );
    }
    const { session, localId, cierre } = res;

    const body = await req.json().catch(() => ({}));
    const motivo = String(body?.motivo ?? "").trim().slice(0, 500);
    if (!motivo) {
      return NextResponse.json(
        { ok: false, error: "Explicá por qué cancelás el corte." },
        { status: 400 }
      );
    }

    const cancelado = await prisma.$transaction(async (tx) => {
      // Mismo orden de locks que la confirmación —turno y después corte— para
      // que las dos no puedan quedar esperándose en cruz.
      await bloquearTurno(tx, cierre.turnoId);
      await bloquearCierre(tx, cierre.id);

      const fila = await tx.cierrePreparacion.findUnique({ where: { id: cierre.id } });

      // Solo PREPARANDO. Confirmado ya movió plata; cancelado ya está; vencido
      // necesita una resolución que no está definida.
      if (fila.estado !== ESTADO_CIERRE.PREPARANDO) {
        const e = new Error(
          fila.estado === ESTADO_CIERRE.CONFIRMADO
            ? "Este cierre ya se confirmó: no se puede cancelar."
            : fila.estado === ESTADO_CIERRE.VENCIDO
              ? "Este cierre está vencido y necesita resolución administrativa. No se cancela desde acá."
              : "Este cierre ya estaba cancelado."
        );
        e.codigo = "conflicto";
        throw e;
      }

      // Nada puede depender del relevo. Se consulta la fila real, no el include
      // de afuera: entre pedidos pudo publicarse un sobre.
      const sobre = await tx.cambioPendiente.findUnique({
        where: { cierrePreparacionId: cierre.id },
        select: { id: true, estado: true, turnoDestinoId: true },
      });
      if (sobre) {
        const e = new Error(
          "Este cierre ya dejó un cambio para el próximo turno. No se puede cancelar."
        );
        e.codigo = "conflicto";
        throw e;
      }

      const turno = await tx.turno.findFirst({
        where: { id: cierre.turnoId, localId },
        select: { id: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true },
      });
      if (estadoDelTurno(turno) !== ESTADO_TURNO.CIERRE_EN_PREPARACION) {
        const e = new Error("El turno ya no está en preparación de cierre.");
        e.codigo = "conflicto";
        throw e;
      }

      const ahora = new Date();
      const actualizado = await tx.cierrePreparacion.update({
        where: { id: cierre.id },
        data: {
          estado: ESTADO_CIERRE.CANCELADO,
          canceladoEn: ahora,
          canceladoPorUsuarioId: session.id,
          motivoCancelacion: motivo,
        },
      });

      // El turno vuelve a operar. La fila del corte NO se borra: queda como
      // evidencia de que alguien lo tomó y lo deshizo, con motivo y autor.
      await tx.turno.update({
        where: { id: turno.id },
        data: { cierreEnPreparacionEn: null },
      });

      return actualizado;
    }, OPCIONES_TX);

    return NextResponse.json({ ok: true, cierre: serializarCierre(cancelado) });
  } catch (error) {
    if (error?.codigo === "conflicto") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    console.error("Error cancelando cierre con relevo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
