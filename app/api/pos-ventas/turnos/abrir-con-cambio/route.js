// POST /api/pos-ventas/turnos/abrir-con-cambio
//
// El operador entrante cuenta el sobre que le dejó el turno anterior y abre el
// suyo con lo que realmente contó.
//
// EL MONTO INICIAL SALE DEL CONTEO, NO DE LO ESPERADO
//
// Si el sistema impusiera el total que dejó el cierre anterior, una diferencia de
// recepción quedaría escondida y reaparecería como faltante al cerrar, culpando
// al cajero equivocado. Por eso `montoInicial` toma siempre `totalRecibido`, y
// una diferencia obliga a explicarla ANTES de abrir, cuando todavía está fresca.
//
// Todo en UNA transacción: sin ella, el sobre podría quedar consumido sin turno,
// o el turno abierto sin haber tomado el sobre.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { validarDesgloseServidor } from "@/lib/caja/desgloseServidor";
import {
  ESTADO_CAMBIO,
  WHERE_TURNO_OPERATIVO,
  evaluarRecepcionCambio,
} from "@/lib/caja/cierreRelevo";
import { contextoRelevo, serializarCambio, OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";

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

    // El conteo se valida en el servidor. `permitirVacio: false` porque recibir un
    // sobre sin contarlo es exactamente lo que este flujo viene a evitar: si el
    // operador entrante no cuenta, la diferencia aparece recién al cerrar y ya no
    // hay forma de saber de qué turno vino.
    const recibido = validarDesgloseServidor(body?.desgloseRecibido, {
      etiqueta: "conteo de lo recibido",
      permitirVacio: false,
    });
    if (!recibido.valido) {
      return NextResponse.json({ ok: false, error: recibido.error }, { status: 400 });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const sobre = await tx.cambioPendiente.findFirst({
        where: { id: cambioId, localId },
      });
      if (!sobre) {
        const e = new Error("Cambio no encontrado");
        e.codigo = "no_encontrado";
        throw e;
      }
      // Tiene que estar RESERVADO POR ESTE USUARIO. Abrir directo sobre un sobre
      // DISPONIBLE parecería más cómodo, pero saltearse la reserva es lo que
      // permite que dos operadores cuenten el mismo sobre en paralelo y los dos
      // crean que es suyo.
      if (sobre.estado !== ESTADO_CAMBIO.RESERVADO || sobre.turnoDestinoId) {
        const e = new Error(
          sobre.estado === ESTADO_CAMBIO.RECIBIDO
            ? "Este cambio ya lo recibió otro turno."
            : "Reservá el cambio antes de abrir el turno."
        );
        e.codigo = "conflicto";
        throw e;
      }
      if (sobre.reservadoPorUsuarioId !== session.id) {
        const e = new Error("Este cambio está reservado por otro operador.");
        e.codigo = "conflicto";
        throw e;
      }

      const recepcion = evaluarRecepcionCambio({
        totalEsperado: Number(sobre.total),
        totalRecibido: recibido.total,
        motivo: body?.motivoDiferencia,
      });
      if (!recepcion.valido) {
        const e = new Error(recepcion.error);
        e.codigo = "recepcion_invalida";
        e.clase = recepcion.clase;
        e.diferencia = recepcion.diferencia;
        e.totalEsperado = Number(sobre.total);
        e.totalRecibido = recibido.total;
        throw e;
      }

      // "Un turno operativo por usuario y local". Un turno del mismo usuario que
      // ya tomó su corte NO bloquea: ese es justamente el caso del relevo, y si
      // bloqueara, nadie podría abrir mientras el saliente cuenta.
      const propio = await tx.turno.findFirst({
        where: { localId, vendedorId: session.id, ...WHERE_TURNO_OPERATIVO, anuladoEn: null },
        select: { id: true, apertura: true },
      });
      if (propio) {
        const e = new Error("Ya tenés un turno abierto en este local. Cerralo antes de abrir otro.");
        e.codigo = "conflicto";
        throw e;
      }

      const ahora = new Date();

      const turno = await tx.turno.create({
        data: {
          localId,
          vendedorId: session.id,
          operadorId: gateOp.operadorId,
          // LO QUE SE CONTÓ DE VERDAD.
          montoInicial: recepcion.montoInicial,
          // Los campos viejos de fondo (`fondoRecibidoApertura`,
          // `fondoOrigenTurnoId` y compañía) NO se escriben. Aquella cadena era
          // automática —adivinaba qué cierre correspondía a qué cajón— y por eso
          // se desactivó. La fuente de verdad de este traspaso es CambioPendiente,
          // donde el operador ELIGE qué sobre está tomando. Escribir las dos
          // dejaría dos versiones de la misma historia.
          observaciones: null,
        },
      });

      // El vínculo. `turnoDestinoId` es UNIQUE en la base: aunque todas las
      // validaciones de arriba fallaran, dos turnos no pueden consumir el mismo
      // sobre. Es la garantía dura, no la de la aplicación.
      const consumido = await tx.cambioPendiente.update({
        where: { id: sobre.id },
        data: {
          estado: ESTADO_CAMBIO.RECIBIDO,
          turnoDestinoId: turno.id,
          recibidoPorUsuarioId: session.id,
          recibidoPorOperadorId: gateOp.operadorId ?? null,
          recibidoEn: ahora,
          totalRecibido: recepcion.montoInicial,
          desgloseRecibido: recibido.desglose,
          diferencia: recepcion.diferencia,
          motivoDiferencia: recepcion.motivo,
        },
      });

      return { turno, consumido, recepcion };
    }, OPCIONES_TX);

    return NextResponse.json({
      ok: true,
      turno: resultado.turno,
      cambio: serializarCambio(resultado.consumido),
      recepcion: {
        clase: resultado.recepcion.clase,
        diferencia: resultado.recepcion.diferencia,
        montoInicial: resultado.recepcion.montoInicial,
      },
    });
  } catch (error) {
    if (error?.codigo === "no_encontrado") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    if (error?.codigo === "conflicto") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    if (error?.codigo === "recepcion_invalida") {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          necesitaMotivo: true,
          clase: error.clase,
          diferencia: error.diferencia,
          totalEsperado: error.totalEsperado,
          totalRecibido: error.totalRecibido,
        },
        { status: 400 }
      );
    }
    // Choque contra el UNIQUE de turnoDestinoId o el índice parcial de "un turno
    // abierto por usuario": otro pedido ganó la carrera.
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Este cambio ya fue tomado. Actualizá y volvé a intentar.", duplicado: true },
        { status: 409 }
      );
    }
    console.error("Error abriendo turno con cambio:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
