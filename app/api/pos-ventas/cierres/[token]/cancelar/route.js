// POST /api/pos-ventas/cierres/[token]/cancelar
//
// DESHACE un corte que todavía no confirmó nada, y devuelve el turno a la
// operación.
//
// CANCELAR ES LA EXCEPCIÓN, NO LA SALIDA HABITUAL
//
// Solo existe para el caso real de "tomé el corte por error, todavía no conté
// nada". Como el cambio se separa y se publica en el mismo acto del corte, el
// sobre SIEMPRE existe: encontrarlo no es motivo de rechazo. Lo que bloquea es
// que alguien ya dependa de él —reservado, recibido o con turno destino—, porque
// ahí cancelar dejaría la misma plata contada en dos turnos distintos.
//
// Cuando sí se cancela, el sobre se marca CANCELADO junto con el corte: dejarlo
// DISPONIBLE ofrecería al próximo operador un cambio de un cierre que se deshizo.
//
// Un cierre VENCIDO no se cancela desde acá. Vencido significa que el cajero se
// fue sin contar y la plata está en el cajón: eso necesita una resolución
// administrativa que todavía no está definida, y fabricar una acá sería inventar
// política. Se informa como pendiente y se deja para quien la defina.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ESTADO_CIERRE, ESTADO_CAMBIO, ESTADO_TURNO, estadoDelTurno } from "@/lib/caja/cierreRelevo";
import {
  cargarCierrePorToken,
  bloquearTurno,
  bloquearCierre,
  bloquearCambio,
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

      // ── EL SOBRE: sólo se cancela si NADIE lo tocó ────────────────────────
      //
      // Desde que el cambio se separa antes del corte, el sobre existe desde el
      // primer instante y encontrarlo ya no es motivo para rechazar: lo normal es
      // que esté ahí, DISPONIBLE y sin que nadie lo haya mirado.
      //
      // Lo que sí bloquea es que alguien DEPENDA de él. Si el relevo lo reservó
      // está contando esos billetes en este momento; si lo recibió, ya abrió su
      // turno con esa plata como monto inicial. Cancelar en cualquiera de los dos
      // casos dejaría la misma plata contada dos veces, en dos turnos distintos.
      //
      // Se relee la fila real, con lock: entre la lectura de afuera y este punto
      // el relevo pudo reservarlo.
      const sobre = await tx.cambioPendiente.findUnique({
        where: { cierrePreparacionId: cierre.id },
        select: { id: true, estado: true, turnoDestinoId: true },
      });
      if (sobre) {
        await bloquearCambio(tx, sobre.id);
        const actual = await tx.cambioPendiente.findUnique({
          where: { id: sobre.id },
          select: { id: true, estado: true, turnoDestinoId: true },
        });
        const libre = actual.estado === ESTADO_CAMBIO.DISPONIBLE && actual.turnoDestinoId == null;
        if (!libre) {
          const e = new Error(
            actual.estado === ESTADO_CAMBIO.RECIBIDO || actual.turnoDestinoId != null
              ? "El cambio de este cierre ya fue recibido por otro turno. No se puede cancelar: hace falta una resolución administrativa."
              : "El cambio de este cierre ya fue tomado por otro operador, que lo está contando. No se puede cancelar."
          );
          e.codigo = "conflicto";
          throw e;
        }
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

      // El sobre se marca CANCELADO, no se borra. Que un cambio se publicó y se
      // retiró de circulación es parte de la historia de la caja: borrar la fila
      // dejaría un hueco inexplicable entre dos turnos consecutivos.
      if (sobre) {
        await tx.cambioPendiente.update({
          where: { id: sobre.id },
          data: { estado: ESTADO_CAMBIO.CANCELADO },
        });
      }

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
