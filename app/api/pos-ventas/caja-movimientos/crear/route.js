import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { esMotivoReservado } from "@/lib/caja/retiroDinero";
import { ERROR_TURNO_EN_PREPARACION } from "@/lib/caja/cierreRelevo";

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

    const gateOp = await requireOperadorSegunConfig(req, session, { localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
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

    // Validar turno: existe, mismo local, abierto
    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: { id: true, localId: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true },
    });

    if (!turno || turno.localId !== localId) {
      return NextResponse.json(
        { ok: false, error: "Turno no encontrado en este local" },
        { status: 404 }
      );
    }

    if (turno.cierre !== null) {
      return NextResponse.json(
        { ok: false, error: "El turno ya esta cerrado" },
        { status: 400 }
      );
    }

    // Un turno que tomó el corte de cierre tampoco admite movimientos, aunque
    // `cierre` siga en null. Su universo quedó congelado: un ingreso o un egreso
    // cargado ahora caería después de la frontera del corte y no lo vería el
    // cierre que se está confirmando. Es la misma regla que aplica a las ventas.
    if (turno.cierreEnPreparacionEn !== null) {
      return NextResponse.json(
        { ok: false, error: ERROR_TURNO_EN_PREPARACION, turnoEnPreparacionDeCierre: true },
        { status: 409 }
      );
    }

    const movimiento = await prisma.cajaMovimiento.create({
      data: {
        turnoId,
        usuarioId: session.id,
        tipo,
        monto: montoNum,
        motivo: motivo || null,
      },
    });

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
