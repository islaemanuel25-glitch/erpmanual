import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { validarFondoManual } from "@/lib/caja/cierreCaja";
import { WHERE_TURNO_OPERATIVO } from "@/lib/caja/cierreRelevo";

/**
 * Estado de la caja ANTES de abrir. Lo consulta la pantalla de apertura para
 * saber si ESTE usuario ya tiene un turno abierto —lo unico que bloquea— y para
 * avisar, sin bloquear, que hay otros cajeros trabajando en el mismo local.
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

    // Todos los turnos abiertos del local. El PROPIO bloquea; los AJENOS solo
    // informan: un local puede tener varios dispositivos y varios cajeros
    // trabajando al mismo tiempo.
    // Solo los OPERATIVOS. Un turno con el corte tomado no está abierto: no
    // vende, no bloquea, y presentarlo acá como "abierto" haría que el relevo
    // crea que no puede empezar.
    const abiertos = await prisma.turno.findMany({
      where: { localId, ...WHERE_TURNO_OPERATIVO, anuladoEn: null },
      orderBy: { apertura: "asc" },
      select: { id: true, apertura: true, vendedorId: true, vendedor: { select: { nombre: true } } },
    });

    // Los congelados van aparte, informativos: son cajas a medio cerrar que
    // alguien tiene que terminar de contar.
    const enPreparacion = await prisma.turno.findMany({
      where: { localId, cierre: null, cierreEnPreparacionEn: { not: null }, anuladoEn: null },
      orderBy: { apertura: "asc" },
      select: {
        id: true, apertura: true, cierreEnPreparacionEn: true, vendedorId: true,
        vendedor: { select: { nombre: true } },
      },
    });

    const propio = abiertos.find((t) => t.vendedorId === session.id) || null;
    const ajenos = abiertos.filter((t) => t.vendedorId !== session.id);

    return NextResponse.json({
      ok: true,
      // HERENCIA DE FONDO DESACTIVADA. Con varios turnos simultáneos por local, el
      // sistema no sabe qué cierre corresponde a qué cajón físico: ofrecer el
      // fondo de cualquier cierre anterior sería adivinar. Vuelve cuando exista
      // CajaFisica. Las columnas y los datos históricos quedan intactos.
      herenciaFondoActiva: false,
      // Solo el turno del MISMO usuario impide abrir.
      turnoPropioAbierto: propio
        ? { turnoId: propio.id, apertura: propio.apertura }
        : null,
      // Informativo, NO bloqueante.
      otrosTurnosAbiertos: ajenos.map((t) => ({
        turnoId: t.id,
        apertura: t.apertura,
        vendedorNombre: t.vendedor?.nombre || "otro usuario",
      })),
      // Cajas cortadas esperando conteo. Tampoco bloquean.
      turnosEnPreparacionDeCierre: enPreparacion.map((t) => ({
        turnoId: t.id,
        apertura: t.apertura,
        iniciadoEn: t.cierreEnPreparacionEn,
        vendedorNombre: t.vendedor?.nombre || "otro usuario",
        esPropio: t.vendedorId === session.id,
      })),
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

    // UN TURNO ABIERTO POR USUARIO, NO POR LOCAL.
    //
    // Un local puede tener varios dispositivos y varios cajeros trabajando a la
    // vez, así que bloquear todo el local por existir otro turno abierto dejaba
    // sin poder operar a gente que no tenía nada que ver. Lo que sí no tiene
    // sentido es que UNA persona lleve dos cajas suyas al mismo tiempo.
    //
    // Los turnos ajenos no bloquean: se informan y listo.
    //
    // EL TURNO CONGELADO NO BLOQUEA. Un turno que ya tomó su corte de cierre no
    // está operando: el cajero lo está contando en otra pestaña. Si bloqueara,
    // el relevo no podría abrir mientras tanto y todo el flujo perdería sentido.
    const turnoPropio = await prisma.turno.findFirst({
      where: { localId, vendedorId: session.id, ...WHERE_TURNO_OPERATIVO, anuladoEn: null },
      orderBy: { apertura: "asc" },
      select: { id: true, apertura: true },
    });

    if (turnoPropio) {
      const diaApertura = fechaArgentinaISO(turnoPropio.apertura);
      const esViejo = diaApertura && diaApertura !== hoyArgentinaISO();
      // Hora local argentina; con fecha cuando el turno no es de hoy.
      const cuando = esViejo
        ? new Date(turnoPropio.apertura).toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba" })
        : new Date(turnoPropio.apertura).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Cordoba", hour: "2-digit", minute: "2-digit" });

      return NextResponse.json(
        {
          ok: false,
          error: `Ya tenés un turno abierto en este local desde ${cuando}. Cerralo antes de abrir otro.`,
          turnoPropioAbierto: { turnoId: turnoPropio.id, apertura: turnoPropio.apertura },
        },
        { status: 409 }
      );
    }

    // === FONDO DE APERTURA: DECLARADO A MANO ===
    //
    // La herencia automatica del fondo entre turnos queda DESACTIVADA. Con varios
    // cajeros abiertos a la vez en un mismo local, el sistema no sabe que cierre
    // corresponde a que cajon fisico: pasarle a un cajero el fondo que dejo otro
    // seria adivinar, y esa plata terminaria apareciendo o faltando en el arqueo
    // equivocado. Vuelve cuando exista CajaFisica.
    //
    // Las columnas y los datos historicos NO se tocan: los turnos que ya tienen
    // fondoOrigenTurnoId conservan su cadena. Simplemente se dejan de escribir.
    const ap = validarFondoManual(montoInicial);
    if (!ap.valido) {
      return NextResponse.json({ ok: false, error: ap.error }, { status: 400 });
    }

    const gateOp = await requireOperadorSegunConfig(req, session, { localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    const turno = await prisma.turno.create({
      data: {
        localId,
        vendedorId: session.id,
        operadorId: gateOp.operadorId,
        // Lo que el cajero declara haber recibido. Sin monto sugerido no hay
        // diferencia de recepcion que calcular, asi que fondoSugeridoApertura y
        // diferenciaFondoApertura quedan en NULL: significa "no aplica", no cero.
        montoInicial: ap.montoInicial,
        fondoRecibidoApertura: ap.montoInicial,
        observacionFondoApertura: String(body?.observacionFondo || "").trim() || null,
      },
    });

    // Otros turnos abiertos del local: informativo, no bloquea.
    const otrosAbiertos = await prisma.turno.findMany({
      where: { localId, ...WHERE_TURNO_OPERATIVO, anuladoEn: null, id: { not: turno.id } },
      select: { id: true, vendedor: { select: { nombre: true } } },
    });

    return NextResponse.json({
      ok: true,
      turno,
      herenciaFondoActiva: false,
      otrosTurnosAbiertos: otrosAbiertos.map((t) => ({
        turnoId: t.id,
        vendedorNombre: t.vendedor?.nombre || "otro usuario",
      })),
    });
  } catch (error) {
    // Choque contra el indice unico parcial (localId, vendedorId) WHERE cierre IS
    // NULL: dos aperturas simultaneas del MISMO usuario. Solo una puede ganar.
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya tenés un turno abierto en este local. Actualizá y volvé a intentar." },
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
