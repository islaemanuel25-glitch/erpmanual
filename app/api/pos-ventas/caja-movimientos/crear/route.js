import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { esMotivoReservado } from "@/lib/caja/retiroDinero";
import { ERROR_TURNO_EN_PREPARACION, ERROR_CAJA_AJENA, puedeActuarSobreCaja } from "@/lib/caja/cierreRelevo";
import { identidadParaOperar } from "@/lib/caja/identidadCajaServer";
import { bloquearTurno } from "@/lib/caja/cierreRelevoServer";
import { LIMITES_TRANSACCION_DEL_LOCAL } from "@/lib/pos-ventas/candadoDelLocal";

const SELECT_TURNO = {
  id: true, localId: true, vendedorId: true, operadorId: true,
  cierre: true, cierreEnPreparacionEn: true, anuladoEn: true,
};

/**
 * Por qué este turno no admite un Caja +/−, o null si lo admite. La misma regla
 * se aplica dos veces —afuera como respuesta rápida, adentro con el turno
 * tomado— y por eso vive en un solo lugar.
 */
function rechazoDelTurno(turno, localId, identidad) {
  if (!turno || turno.localId !== localId) {
    return { status: 404, cuerpo: { ok: false, error: "Turno no encontrado en este local" } };
  }
  if (!puedeActuarSobreCaja(turno, identidad)) {
    return { status: 403, cuerpo: { ok: false, error: ERROR_CAJA_AJENA, cajaAjena: true } };
  }
  if (turno.cierre !== null) {
    return { status: 400, cuerpo: { ok: false, error: "El turno ya esta cerrado" } };
  }
  // Un turno que tomó el corte de cierre tampoco admite movimientos, aunque
  // `cierre` siga en null. Su universo quedó congelado: un ingreso o un egreso
  // cargado ahora caería después de la frontera del corte y no lo vería el
  // cierre que se está confirmando. Es la misma regla que aplica a las ventas.
  if (turno.cierreEnPreparacionEn !== null) {
    return {
      status: 409,
      cuerpo: { ok: false, error: ERROR_TURNO_EN_PREPARACION, turnoEnPreparacionDeCierre: true },
    };
  }
  return null;
}

export async function POST(req) {
  try {
    const perm = requirePerm(req, "pos.usar");
    if (!perm.ok)
      return NextResponse.json(
        { ok: false, error: perm.error },
        { status: perm.status }
      );

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { localId, session } = scope;

    // Quién mueve: el operador del PIN validado en este local, o la cuenta sin
    // operador. El movimiento no guarda operador —se deriva de su turno—, así
    // que lo único que hay que garantizar es que el turno sea el de quien mueve.
    const id = await identidadParaOperar(req, session, { localId });
    if (!id.ok) {
      return NextResponse.json(
        { ok: false, error: id.error, needsOperador: true },
        { status: id.status }
      );
    }

    const body = await req.json();
    const { turnoId, tipo, monto, motivo } = body;

    if (!turnoId) {
      return NextResponse.json(
        { ok: false, error: "turnoId requerido" },
        { status: 400 }
      );
    }

    if (!tipo || !["INGRESO", "RETIRO"].includes(tipo)) {
      return NextResponse.json(
        { ok: false, error: "tipo debe ser INGRESO o RETIRO" },
        { status: 400 }
      );
    }

    if (!motivo || !motivo.trim()) {
      return NextResponse.json(
        { ok: false, error: "motivo es obligatorio" },
        { status: 400 }
      );
    }

    // El motivo del retiro automático está RESERVADO. Un egreso manual que lo
    // imite haría que el historial muestre dos "retiros de recaudación" cuando
    // solo uno tiene registro de conteo detrás — y descontaría dos veces la
    // misma plata. La recaudación se retira desde "Retirar recaudación", que
    // crea su movimiento solo.
    if (esMotivoReservado(motivo)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Ese motivo está reservado. Para sacar la recaudación usá "Retirar recaudación", que descuenta y deja el registro del conteo.',
          motivoReservado: true,
        },
        { status: 400 }
      );
    }

    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      return NextResponse.json(
        { ok: false, error: "monto debe ser mayor a 0" },
        { status: 400 }
      );
    }

    // Validar turno: existe, mismo local, es la caja de quien mueve, abierto.
    //
    // Antes se validaba solo el local: cualquier sesión del local con `pos.usar`
    // podía cargar un Caja +/− en el turno de otro mandando su id. Ahora un
    // cajero común solo alcanza su caja; Admin y el Dueño en su local, la de
    // cualquiera —es la intervención que ya tenían—, con su `usuarioId` en el
    // movimiento.
    //
    // Esta lectura es solo la respuesta rápida: no toma nada y no decide. La
    // que decide es la de adentro de la transacción, con el turno tomado.
    const turno = await prisma.turno.findUnique({ where: { id: turnoId }, select: SELECT_TURNO });
    const rechazo = rechazoDelTurno(turno, localId, id.identidad);
    if (rechazo) return NextResponse.json(rechazo.cuerpo, { status: rechazo.status });

    // LA VALIDACIÓN Y LA ESCRITURA SON UNA SOLA FRONTERA.
    //
    // Antes el turno se validaba arriba y el movimiento se insertaba aparte, sin
    // transacción. Un corte (`cierres/iniciar`) o un cierre (`turnos/cerrar`) que
    // confirmaba en el medio dejaba el movimiento adentro de un turno ya cortado
    // o cerrado y FUERA de su efectivo esperado. Forzado contra PostgreSQL.
    //
    // Ahora es el patrón de `salidaDelPago`: el turno se toma con `bloquearTurno`
    // —el mismo FOR UPDATE del corte, el retiro y los pagos en efectivo—, se
    // vuelve a leer y recién entonces se escribe. Si el movimiento tiene el
    // turno, el corte espera y lo cuenta; si el corte lo tiene, el movimiento
    // espera, lo encuentra cortado o cerrado y se rechaza con la misma respuesta
    // de siempre. Orden: Turno, después CajaMovimiento; no toma el candado del
    // local ni filas de venta o de stock, así que no hay ciclo con `crear`.
    //
    // Los límites son los de `crear` y no `OPCIONES_TX`: puede esperar a un
    // cierre que a su vez está esperando a una venta.
    const resultado = await prisma.$transaction(async (tx) => {
      await bloquearTurno(tx, turnoId);
      const vigente = await tx.turno.findUnique({ where: { id: turnoId }, select: SELECT_TURNO });
      const rechazoVigente = rechazoDelTurno(vigente, localId, id.identidad);
      if (rechazoVigente) return { rechazo: rechazoVigente };

      const creado = await tx.cajaMovimiento.create({
        data: {
          turnoId,
          usuarioId: session.id,
          tipo,
          monto: montoNum,
          motivo: motivo || null,
        },
      });
      return { movimiento: creado };
    }, LIMITES_TRANSACCION_DEL_LOCAL);

    if (resultado.rechazo) {
      return NextResponse.json(resultado.rechazo.cuerpo, { status: resultado.rechazo.status });
    }
    const { movimiento } = resultado;

    return NextResponse.json({
      ok: true,
      item: {
        id: movimiento.id,
        tipo: movimiento.tipo,
        monto: Number(movimiento.monto),
        motivo: movimiento.motivo,
        createdAt: movimiento.createdAt,
      },
    });
  } catch (error) {
    console.error("Error crear movimiento caja:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
