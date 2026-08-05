import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { WHERE_TURNO_OPERATIVO, ESTADO_CIERRE } from "@/lib/caja/cierreRelevo";
import { ESTADO_RETIRO } from "@/lib/caja/retiroRelevo";
import {
  retiroPendienteDeTurno,
  cierrePendienteDeTurno,
} from "@/lib/caja/procesoPendienteServer";

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

    // Un RETIRO a medio contar, en cambio, convive con un turno perfectamente
    // vivo: el retiro no congela la caja. Por eso se busca sobre `turno` y no en
    // la rama de arriba — si hubiera turno abierto y además un retiro en curso,
    // los dos datos tienen que viajar juntos.
    const retiroEnCurso = turno
      ? await prisma.retiroPreparacion.findFirst({
          where: { turnoId: turno.id, estado: ESTADO_RETIRO.PREPARANDO },
          select: { token: true, corteEn: true, efectivoRetiradoEsperado: true },
        })
      : null;

    // ── EL PROCESO PENDIENTE, CON FORMA DE AVISO ──────────────────────────
    //
    // Las pantallas de inicio necesitan poder MOSTRAR el proceso abierto, no
    // solo saber que existe: hora del corte, cambio separado, retiro esperado,
    // quién lo inició, y si todavía se puede deshacer. Se arma acá, con la misma
    // forma que viaja en los 409, para que el cartel sea uno solo.
    const [procesoRetiro, procesoCierre] = await Promise.all([
      retiroEnCurso ? retiroPendienteDeTurno(turno.id) : null,
      enPreparacion ? cierrePendienteDeTurno(enPreparacion.id) : null,
    ]);

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
            proceso: procesoCierre,
          }
        : null,
      // Mismo criterio para el retiro: el token viaja para poder ofrecer
      // "continuá el conteo" sin que el cajero guarde la URL. La caja sigue
      // vendiendo mientras tanto, así que esto NO bloquea nada — sólo permite
      // volver, y evita que se intente abrir un segundo corte.
      retiroEnPreparacion: retiroEnCurso
        ? {
            turnoId: turno.id,
            token: retiroEnCurso.token,
            corteEn: retiroEnCurso.corteEn,
            efectivoRetiradoEsperado: Number(retiroEnCurso.efectivoRetiradoEsperado),
            proceso: procesoRetiro,
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
