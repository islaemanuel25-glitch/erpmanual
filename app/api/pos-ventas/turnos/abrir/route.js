import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { validarApertura } from "@/lib/caja/cierreCaja";

/**
 * Estado de la caja ANTES de abrir: cuánto dejó el cierre anterior y si el local
 * ya tiene una caja abierta. Lo consulta la pantalla de apertura para poder
 * mostrar "El cierre anterior dejó $X" y para avisar temprano —con nombre y
 * hora— en vez de dejar que el cajero descubra el bloqueo recién al confirmar.
 */
export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });

    const perm = checkPerm(session, "pos.usar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const localId = scope.localId;

    const [cierrePrevio, abierto] = await Promise.all([
      prisma.turno.findFirst({
        where: {
          localId,
          cierre: { not: null },
          fondoDejadoCierre: { not: null },
          fondoConsumidoEnTurnoId: null,
        },
        orderBy: { cierre: "desc" },
        select: { id: true, fondoDejadoCierre: true, cierre: true, cerradoPor: { select: { nombre: true } } },
      }),
      prisma.turno.findFirst({
        where: { localId, cierre: null },
        orderBy: { apertura: "asc" },
        select: { id: true, apertura: true, vendedorId: true, vendedor: { select: { nombre: true } } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      // 0 cuando no hay cierre previo con fondo: el primer turno del local, o los
      // turnos cerrados antes de que existiera este circuito (campos en NULL).
      fondoSugerido: cierrePrevio ? Number(cierrePrevio.fondoDejadoCierre) : 0,
      cierrePrevio: cierrePrevio
        ? {
            turnoId: cierrePrevio.id,
            cierre: cierrePrevio.cierre,
            cerradoPor: cierrePrevio.cerradoPor?.nombre || null,
          }
        : null,
      cajaOcupada: abierto
        ? {
            turnoId: abierto.id,
            apertura: abierto.apertura,
            vendedorNombre: abierto.vendedor?.nombre || "otro usuario",
            esPropio: abierto.vendedorId === session.id,
          }
        : null,
    });
  } catch (error) {
    console.error("Error consultando estado de apertura:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req) {
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

    const body = await req.json();
    const montoInicial = body?.montoInicial;

    // Alcance seguro: un no-admin abre caja SOLO en su local de sesión; un body.localId
    // ajeno → 403 (no abrir silenciosamente en el local equivocado). Admin: contexto.
    const scope = await resolveScope(req, { explicitLocalId: body?.localId });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const localId = scope.localId;

    // UN SOLO TURNO ABIERTO POR LOCAL.
    //
    // Antes el candado era por (local + vendedor), así que cada usuario podía
    // abrir el suyo sobre el MISMO cajón físico. En producción eso dejó 63 pares
    // de turnos solapados en un local: turnos que alguien abría, usaba para dos
    // ventas y no cerraba —uno quedó abierto 11 días—, mientras el cajero real
    // abría y cerraba los suyos. Con un cajón por local, dos turnos abiertos
    // significan dos contabilidades sobre la misma plata.
    //
    // El mensaje dice QUIÉN lo tiene abierto y desde cuándo: si no, el cajero se
    // queda trabado sin saber qué cerrar.
    const turnoAbierto = await prisma.turno.findFirst({
      where: { localId, cierre: null },
      orderBy: { apertura: "asc" },
      include: { vendedor: { select: { id: true, nombre: true } } },
    });

    if (turnoAbierto) {
      const propio = turnoAbierto.vendedorId === session.id;
      const diaApertura = fechaArgentinaISO(turnoAbierto.apertura);
      const esViejo = diaApertura && diaApertura !== hoyArgentinaISO();
      const quien = turnoAbierto.vendedor?.nombre || "otro usuario";

      // Hora local argentina: el turno pudo abrirse otro día, así que se incluye
      // la fecha cuando no es de hoy.
      const cuando = esViejo
        ? new Date(turnoAbierto.apertura).toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba" })
        : new Date(turnoAbierto.apertura).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Cordoba", hour: "2-digit", minute: "2-digit" });

      const error = propio
        ? `Ya tenés un turno abierto en este local desde ${cuando}. Debe cerrarse antes de abrir otro.`
        : `Ya hay un turno abierto en este local por ${quien} desde ${cuando}. Debe cerrarse antes de abrir otro.`;

      return NextResponse.json(
        {
          ok: false,
          error,
          cajaOcupada: {
            turnoId: turnoAbierto.id,
            vendedorId: turnoAbierto.vendedorId,
            vendedorNombre: quien,
            apertura: turnoAbierto.apertura,
            esPropio: propio,
          },
        },
        { status: 409 }
      );
    }

    // === Fondo que dejó el cierre anterior ===
    //
    // El último turno cerrado del local que todavía no entregó su fondo. Se sugiere
    // ese monto, pero el que manda es el que el cajero cuenta y confirma: si el
    // sistema impusiera el sugerido, una diferencia de recepción quedaría escondida
    // y reaparecería como faltante al cerrar, culpando al cajero equivocado.
    const cierrePrevio = await prisma.turno.findFirst({
      where: {
        localId,
        cierre: { not: null },
        fondoDejadoCierre: { not: null },
        fondoConsumidoEnTurnoId: null,
      },
      orderBy: { cierre: "desc" },
      select: { id: true, fondoDejadoCierre: true, cierre: true },
    });
    const fondoSugerido = cierrePrevio ? Number(cierrePrevio.fondoDejadoCierre) : 0;

    const ap = validarApertura({
      sugerido: fondoSugerido,
      recibido: montoInicial,
      observacion: body?.observacionFondo,
    });
    if (!ap.valido) {
      return NextResponse.json(
        {
          ok: false,
          error: ap.error,
          fondoSugerido,
          diferenciaFondo: ap.diferencia,
          requiereObservacionFondo: true,
        },
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

    // Apertura + consumo del fondo previo en UNA transacción.
    //
    // `fondoOrigenTurnoId` es UNIQUE en la base: si dos aperturas concurrentes
    // intentan tomar el mismo fondo, la segunda choca con la clave y se rechaza.
    // No queda a criterio de la aplicación ganar la carrera.
    const turno = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.turno.create({
        data: {
          localId,
          vendedorId: session.id,
          operadorId: gateOp.operadorId,
          // El monto inicial es lo REALMENTE recibido, nunca lo sugerido.
          montoInicial: ap.montoInicial,
          fondoSugeridoApertura: fondoSugerido,
          fondoRecibidoApertura: ap.montoInicial,
          diferenciaFondoApertura: ap.diferencia,
          observacionFondoApertura: String(body?.observacionFondo || "").trim() || null,
          fondoOrigenTurnoId: cierrePrevio?.id ?? null,
        },
      });

      // Marca el inverso en el cierre que entregó el fondo: queda consumido y no
      // se le vuelve a ofrecer al siguiente turno.
      if (cierrePrevio) {
        await tx.turno.update({
          where: { id: cierrePrevio.id },
          data: { fondoConsumidoEnTurnoId: nuevo.id },
        });
      }

      return nuevo;
    });

    return NextResponse.json({ ok: true, turno, fondoSugerido });
  } catch (error) {
    // Choque contra el UNIQUE de fondoOrigenTurnoId: otra apertura se llevó el
    // mismo fondo mientras esta estaba en vuelo.
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Otro turno ya tomó el fondo del cierre anterior. Actualizá y volvé a intentar." },
        { status: 409 }
      );
    }
    console.error("Error abriendo turno:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
