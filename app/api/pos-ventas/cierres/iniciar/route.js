// POST /api/pos-ventas/cierres/iniciar
//
// TOMA EL CORTE CONGELADO del turno y libera el mostrador.
//
// Es instantáneo y no pide ningún dato de conteo: solo congela el efectivo
// esperado y la frontera de qué ventas y movimientos pertenecen a este turno.
// Desde acá el turno deja de operar y el relevo ya puede abrir el suyo.
//
// Lo que este endpoint NO hace, a propósito:
//   · no cierra el turno — `cierre` sigue en null hasta la confirmación;
//   · no crea arqueo, ni movimiento, ni cambio pendiente;
//   · no toca ninguna venta ni ningún movimiento anterior.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireOperadorSegunConfig } from "@/lib/operador";
import {
  ESTADO_TURNO,
  ESTADO_CIERRE,
  estadoDelTurno,
  generarToken,
  claveIdempotenciaCierre,
  vencimientoCierre,
} from "@/lib/caja/cierreRelevo";
import {
  contextoRelevo,
  calcularCorte,
  bloquearTurno,
  serializarCierre,
  OPCIONES_TX,
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
    const { session, localId, grupoId } = ctx;

    const body = await req.json().catch(() => ({}));
    const turnoId = Number(body?.turnoId);
    if (!Number.isInteger(turnoId) || turnoId <= 0) {
      return NextResponse.json({ ok: false, error: "turnoId requerido" }, { status: 400 });
    }

    // Gate de operario. El operador que inicia el corte queda GRABADO en la fila:
    // es la autoría real del cierre. Desde este instante la pantalla del cierre
    // no vuelve a mirar el operador activo —que es una cookie compartida y va a
    // cambiar cuando el relevo haga login—, así que el conteo no puede terminar
    // firmado por quien no contó.
    const gateOp = await requireOperadorSegunConfig(req, session, { localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // El lock va PRIMERO. Bloquear después de leer no sirve: la lectura vieja
      // ya se usó para decidir. Dos "iniciar cierre" simultáneos sobre el mismo
      // turno se serializan acá; el segundo ve el corte del primero.
      await bloquearTurno(tx, turnoId);

      const turno = await tx.turno.findFirst({
        where: { id: turnoId, localId },
        select: {
          id: true, localId: true, vendedorId: true, operadorId: true,
          apertura: true, cierre: true, cierreEnPreparacionEn: true,
          anuladoEn: true, montoInicial: true,
        },
      });
      if (!turno) {
        const e = new Error("Turno no encontrado en este local");
        e.codigo = "no_encontrado";
        throw e;
      }

      const estado = estadoDelTurno(turno);
      if (estado === ESTADO_TURNO.CERRADO) {
        const e = new Error("El turno ya fue cerrado.");
        e.codigo = "conflicto";
        throw e;
      }
      if (estado === ESTADO_TURNO.ANULADO) {
        const e = new Error("El turno fue anulado.");
        e.codigo = "conflicto";
        throw e;
      }
      // Un corte VIGENTE ya existente. Se busca por estado y no solo por turno
      // porque un corte cancelado deja su fila y no debe bloquear uno nuevo.
      const vigente = await tx.cierrePreparacion.findFirst({
        where: { turnoId, estado: { in: [ESTADO_CIERRE.PREPARANDO, ESTADO_CIERRE.VENCIDO] } },
      });

      if (estado === ESTADO_TURNO.CIERRE_EN_PREPARACION || vigente) {
        // No es un error del usuario: probablemente ya lo inició en otra pestaña.
        // Se devuelve el corte que existe en vez de romper.
        if (vigente) return { cierre: vigente, repetido: true };
        const e = new Error("El turno quedó marcado en preparación sin un corte vigente.");
        e.codigo = "conflicto";
        throw e;
      }

      // EL CORTE. Se calcula acá dentro, con el lock tomado, para que el número
      // que se congela sea exactamente el estado que se persiste.
      const corte = await calcularCorte(turno, tx);
      const ahora = new Date();

      const cierre = await tx.cierrePreparacion.create({
        data: {
          token: generarToken(randomBytes),
          turnoId: turno.id,
          localId,
          grupoId,
          iniciadoPorUsuarioId: session.id,
          iniciadoPorOperadorId: gateOp.operadorId ?? turno.operadorId ?? null,
          corteEn: ahora,
          efectivoEsperadoCorte: corte.efectivoEsperadoCorte,
          ultimaVentaId: corte.ultimaVentaId,
          ultimoMovimientoId: corte.ultimoMovimientoId,
          cantidadVentasCorte: corte.cantidadVentasCorte,
          idempotencyKey: claveIdempotenciaCierre(turno.id),
          venceEn: vencimientoCierre(ahora),
        },
      });

      // Y recién ahora el turno deja de operar. El orden importa: si se marcara
      // antes de crear el corte y la creación fallara, el turno quedaría
      // congelado sin ningún cierre al que volver. Están en la misma transacción,
      // así que o pasan las dos cosas o no pasa ninguna.
      await tx.turno.update({
        where: { id: turno.id },
        data: { cierreEnPreparacionEn: ahora },
      });

      return { cierre, repetido: false, desglose: corte.calculo };
    }, OPCIONES_TX);

    return NextResponse.json({
      ok: true,
      repetido: resultado.repetido,
      cierre: serializarCierre(resultado.cierre),
      desglose: resultado.desglose
        ? {
            montoInicial: resultado.desglose.montoInicial,
            ventasEfectivo: resultado.desglose.ventasEfectivo,
            ingresos: resultado.desglose.ingresos,
            retiros: resultado.desglose.retiros,
          }
        : null,
    });
  } catch (error) {
    if (error?.codigo === "no_encontrado") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    if (error?.codigo === "conflicto") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    // Choque contra el UNIQUE de turnoId: otro pedido tomó el corte mientras este
    // estaba en vuelo. La base es la garantía dura de "un corte por turno".
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Esta caja ya tiene un cierre en preparación.", duplicado: true },
        { status: 409 }
      );
    }
    console.error("Error iniciando cierre con relevo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
