import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos.usar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // Scope autorizado (antes: localId crudo del query, sin validar contra sesión).
    const scope = await resolveScope(req, {
      explicitLocalId: req.nextUrl.searchParams.get("localId"),
    });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const localId = scope.localId;

    const turno = await prisma.turno.findFirst({
      where: {
        localId,
        vendedorId: session.id,
        cierre: null,
      },
      orderBy: { apertura: "desc" },
    });

    // Marcar como vencido si la apertura no cae en el día calendario AR de hoy.
    // El front bloquea la venta y obliga a cerrar caja antes de seguir.
    let requiereCierre = false;
    let mensaje = null;
    if (turno) {
      const diaApertura = fechaArgentinaISO(turno.apertura);
      const hoy = hoyArgentinaISO();
      if (diaApertura && diaApertura !== hoy) {
        requiereCierre = true;
        mensaje =
          "Tenés una caja abierta de un día anterior. Cerrala antes de seguir vendiendo.";
      }
    }

    return NextResponse.json({ ok: true, turno, requiereCierre, mensaje });
  } catch (error) {
    console.error("Error obteniendo turno actual:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
