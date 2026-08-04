import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { WHERE_TURNO_OPERATIVO, ESTADO_CIERRE } from "@/lib/caja/cierreRelevo";

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

    // EL TURNO OPERATIVO, no "el que no está cerrado".
    //
    // Un turno que tomó el corte de cierre sigue con `cierre` en null, pero ya no
    // vende: el cajero saliente lo está contando en otra pestaña. Si se devolviera
    // acá, el POS creería tener caja abierta y no dejaría abrir la del relevo —que
    // es justo lo que este flujo viene a permitir—.
    const turno = await prisma.turno.findFirst({
      where: { localId, vendedorId: session.id, ...WHERE_TURNO_OPERATIVO },
      orderBy: { apertura: "desc" },
    });

    // El congelado se informa aparte. No es "no hay nada": hay una caja a medio
    // cerrar y el POS tiene que poder decirlo en vez de hacerla desaparecer.
    const enPreparacion = turno
      ? null
      : await prisma.turno.findFirst({
          where: { localId, vendedorId: session.id, cierre: null, cierreEnPreparacionEn: { not: null } },
          orderBy: { apertura: "desc" },
          select: {
            id: true, apertura: true, cierreEnPreparacionEn: true,
            cierresPreparacion: {
              where: { estado: { in: [ESTADO_CIERRE.PREPARANDO, ESTADO_CIERRE.VENCIDO] } },
              select: { token: true, estado: true, venceEn: true },
              take: 1,
            },
          },
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

    return NextResponse.json({
      ok: true,
      turno,
      requiereCierre,
      mensaje,
      // El token viaja acá para que la pestaña principal pueda ofrecer "volver al
      // cierre" sin que el cajero tenga que guardarse la URL. No reemplaza a la
      // autenticación: el endpoint del cierre exige sesión, permiso y alcance.
      cierreEnPreparacion: enPreparacion
        ? {
            turnoId: enPreparacion.id,
            apertura: enPreparacion.apertura,
            iniciadoEn: enPreparacion.cierreEnPreparacionEn,
            token: enPreparacion.cierresPreparacion[0]?.token ?? null,
            estado: enPreparacion.cierresPreparacion[0]?.estado ?? null,
            venceEn: enPreparacion.cierresPreparacion[0]?.venceEn ?? null,
          }
        : null,
    });
  } catch (error) {
    console.error("Error obteniendo turno actual:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
