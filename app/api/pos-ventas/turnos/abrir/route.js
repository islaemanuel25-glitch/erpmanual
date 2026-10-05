import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { fechaHoraAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { validarFondoManual } from "@/lib/caja/cierreCaja";
import { WHERE_TURNO_OPERATIVO, esCajaPropia, whereCajaPropia } from "@/lib/caja/cierreRelevo";
import { identidadParaOperar } from "@/lib/caja/identidadCajaServer";
import { aCargoDelTurno } from "@/lib/finanzas/actividadFinanciera";
import { turnoOperativoDeApertura } from "@/lib/caja/turnoOperativoServer";

// Quién está a cargo de un turno ajeno, para el aviso: el operador si lo tiene,
// la cuenta si no. La MISMA función que rotula los turnos en Finanzas.
const SELECT_AVISO = {
  id: true, apertura: true, vendedorId: true, operadorId: true,
  vendedor: { select: { nombre: true } },
  operador: { select: { nombre: true } },
};
const aCargo = (t) =>
  aCargoDelTurno({ operadorNombre: t.operador?.nombre, vendedorNombre: t.vendedor?.nombre }) || "otro usuario";

/**
 * Estado de la caja ANTES de abrir. Lo consulta la pantalla de apertura para
 * saber si ESTA caja —la del operador del PIN, o la de la cuenta si no hay
 * operador— ya tiene un turno abierto, que es lo único que bloquea, y para
 * avisar, sin bloquear, que hay otras cajas trabajando en el mismo local.
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

    // La caja de quién se está por abrir: el operador del PIN validado en este
    // local, o la cuenta si no hay operador. Sin PIN donde el local lo exige no
    // hay a quién abrirle caja, igual que en el POST.
    const id = await identidadParaOperar(req, session, { localId });
    if (!id.ok) {
      return NextResponse.json(
        { ok: false, error: id.error, needsOperador: true },
        { status: id.status }
      );
    }
    const { identidad } = id;

    // Todos los turnos abiertos del local. El PROPIO bloquea; los AJENOS solo
    // informan: un local puede tener varios dispositivos y varios cajeros
    // trabajando al mismo tiempo, con la misma cuenta o con otras.
    // Solo los OPERATIVOS. Un turno con el corte tomado no está abierto: no
    // vende, no bloquea, y presentarlo acá como "abierto" haría que el relevo
    // crea que no puede empezar.
    const abiertos = await prisma.turno.findMany({
      where: { localId, ...WHERE_TURNO_OPERATIVO, anuladoEn: null },
      orderBy: { apertura: "asc" },
      select: SELECT_AVISO,
    });

    // Los congelados van aparte, informativos: son cajas a medio cerrar que
    // alguien tiene que terminar de contar.
    const enPreparacion = await prisma.turno.findMany({
      where: { localId, cierre: null, cierreEnPreparacionEn: { not: null }, anuladoEn: null },
      orderBy: { apertura: "asc" },
      select: { ...SELECT_AVISO, cierreEnPreparacionEn: true },
    });

    const propio = abiertos.find((t) => esCajaPropia(t, identidad)) || null;
    const ajenos = abiertos.filter((t) => !esCajaPropia(t, identidad));

    return NextResponse.json({
      ok: true,
      // HERENCIA DE FONDO DESACTIVADA. Con varios turnos simultáneos por local, el
      // sistema no sabe qué cierre corresponde a qué cajón físico: ofrecer el
      // fondo de cualquier cierre anterior sería adivinar. Vuelve cuando exista
      // CajaFisica. Las columnas y los datos históricos quedan intactos.
      herenciaFondoActiva: false,
      // Solo la caja PROPIA impide abrir.
      turnoPropioAbierto: propio
        ? { turnoId: propio.id, apertura: propio.apertura }
        : null,
      // Informativo, NO bloqueante. `vendedorNombre` conserva el nombre del
      // campo que lee la pantalla, pero dice quién está a cargo de esa caja.
      otrosTurnosAbiertos: ajenos.map((t) => ({
        turnoId: t.id,
        apertura: t.apertura,
        vendedorNombre: aCargo(t),
      })),
      // Cajas cortadas esperando conteo. Tampoco bloquean.
      turnosEnPreparacionDeCierre: enPreparacion.map((t) => ({
        turnoId: t.id,
        apertura: t.apertura,
        iniciadoEn: t.cierreEnPreparacionEn,
        vendedorNombre: aCargo(t),
        esPropio: esCajaPropia(t, identidad),
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

    // LA CAJA ES DEL OPERADOR, NO DE LA CUENTA NI DEL LOCAL.
    //
    // Un local puede tener varios dispositivos y varios cajeros trabajando a la
    // vez, y en el mostrador real comparten UNA cuenta: cada operador tiene su
    // propio cajón. Lo que no tiene sentido es que UNA persona lleve dos cajas
    // suyas al mismo tiempo — ni con la misma cuenta ni con otra.
    //
    // La identidad sale de la sesión y de la cookie del PIN validada en este
    // local; nunca del cuerpo. Sin operador (local sin operario, o Admin/Dueño
    // sin PIN) la caja es de la cuenta, como siempre. Los índices únicos
    // parciales de `Turno` son la garantía ante dos aperturas simultáneas.
    //
    // Los turnos ajenos no bloquean: se informan y listo.
    //
    // EL TURNO CONGELADO NO BLOQUEA. Un turno que ya tomó su corte de cierre no
    // está operando: el cajero lo está contando en otra pestaña. Si bloqueara,
    // el relevo no podría abrir mientras tanto y todo el flujo perdería sentido.
    const id = await identidadParaOperar(req, session, { localId });
    if (!id.ok) {
      return NextResponse.json(
        { ok: false, error: id.error, needsOperador: true },
        { status: id.status }
      );
    }
    const { identidad } = id;

    const turnoPropio = await prisma.turno.findFirst({
      where: { localId, ...whereCajaPropia(identidad), ...WHERE_TURNO_OPERATIVO, anuladoEn: null },
      orderBy: { apertura: "asc" },
      select: { id: true, apertura: true },
    });

    if (turnoPropio) {
      const diaApertura = fechaArgentinaISO(turnoPropio.apertura);
      const esViejo = diaApertura && diaApertura !== hoyArgentinaISO();
      // Hora local argentina; con fecha cuando el turno no es de hoy.
      // Las dos ya declaraban la zona; les faltaba `hour12: false`. Del helper.
      const cuando = esViejo
        ? fechaHoraAR(turnoPropio.apertura)
        : horaAR(turnoPropio.apertura);

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

    // EL TURNO OPERATIVO: lo elige quien abre, y el servidor lo valida contra
    // el catálogo de ESTE local. La fecha operativa la fija el servidor.
    const to = await turnoOperativoDeApertura(prisma, { localId, body });
    if (!to.ok) {
      return NextResponse.json({ ok: false, error: to.error, codigo: to.codigo }, { status: to.status });
    }

    const turno = await prisma.turno.create({
      data: {
        localId,
        ...to.datos,
        // La cuenta que abrió: auditoría de acceso, no la dueña de la caja.
        vendedorId: session.id,
        // El responsable del cajón. Se escribe acá y no se reescribe nunca.
        operadorId: identidad.operadorId,
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
      select: SELECT_AVISO,
    });

    return NextResponse.json({
      ok: true,
      turno,
      herenciaFondoActiva: false,
      otrosTurnosAbiertos: otrosAbiertos.map((t) => ({
        turnoId: t.id,
        vendedorNombre: aCargo(t),
      })),
    });
  } catch (error) {
    // Choque contra uno de los índices únicos parciales de la caja operativa
    // —por operador, o por cuenta sin operador—: dos aperturas simultáneas de
    // la MISMA caja. Solo una puede ganar.
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
