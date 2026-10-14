// GET /api/pos-ventas/cierres/pendientes
//
// Los cierres que tomaron corte y todavía nadie terminó de contar.
//
// Existe para que un cierre no se pierda. La pestaña se puede cerrar, el
// navegador se puede reiniciar y el cajero se puede ir a su casa: el corte ya
// congeló un turno, y sin una forma de encontrarlo esa caja quedaría trabada sin
// que nadie sepa por qué.
//
// SOBRE EL TOKEN EN LA RESPUESTA
//
// Acá SÍ viaja, y es la única lista donde eso pasa. El token es lo único que
// permite continuar el cierre —no se acepta turnoId como sustituto, justamente
// para que no exista un identificador adivinable— así que una bandeja de
// recuperación sin token no serviría para recuperar nada. El acceso está
// acotado por sesión, permiso `pos.usar`, local del contexto activo Y CAJA:
// quien lee esta lista es alguien que podría iniciar y confirmar ese mismo
// cierre. Antes alcanzaba con el local, porque la caja era de la cuenta; desde
// que es del operador, con una cuenta compartida eso le daba a B el token del
// conteo de A. Ahora cada uno ve los cortes de su caja; Admin y el Dueño en su
// local —la intervención— y quien tiene `pos.cerrar_sin_conteo` —el que
// resuelve los cierres trabados— ven todos.
//
// Los listados generales de cajas (turnos/listar, turnos/resumen, auditoría) NO
// lo incluyen.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  ESTADO_CIERRE,
  cierreAtrasado,
  puedeActuarSobreCaja,
  puedeForzarCierre,
  PERMISO_CERRAR_SIN_CONTEO,
  WHERE_TURNO_OPERATIVO,
} from "@/lib/caja/cierreRelevo";
import { contextoRelevo, marcarCortesVencidos } from "@/lib/caja/cierreRelevoServer";
import { identidadParaMirar } from "@/lib/caja/identidadCajaServer";

/** Los dos estados que todavía esperan a alguien. */
const ABIERTOS = [ESTADO_CIERRE.PREPARANDO, ESTADO_CIERRE.VENCIDO];

export async function GET(req) {
  try {
    const ctx = await contextoRelevo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error, needsContexto: ctx.needsContexto },
        { status: ctx.status }
      );
    }
    const { localId, session } = ctx;
    const ahora = new Date();

    const identidad = await identidadParaMirar(req, session, { localId });
    const veTodos =
      identidad.puedeIntervenir === true ||
      (Array.isArray(session.permisos) && session.permisos.includes(PERMISO_CERRAR_SIN_CONTEO));

    // Marca de ATRASO. No libera el turno ni toca el corte: ver
    // EstadoCierrePreparacion en el schema.
    await marcarCortesVencidos(localId, ahora);

    const todas = await prisma.cierrePreparacion.findMany({
      where: { localId, estado: { in: ABIERTOS } },
      orderBy: { corteEn: "asc" },
      take: 50,
      include: {
        turno: {
          select: {
            id: true, apertura: true, vendedorId: true, operadorId: true,
            vendedor: { select: { nombre: true } },
          },
        },
      },
    });
    const filas = veTodos ? todas : todas.filter((f) => puedeActuarSobreCaja(f.turno, identidad));

    // Los operarios son Int planos (mismo patrón que Turno.anuladoPorId), así que
    // los nombres se resuelven en una consulta aparte en vez de con un include.
    const idsOperador = [...new Set(filas.map((f) => f.iniciadoPorOperadorId).filter(Boolean))];
    const operadores = idsOperador.length
      ? await prisma.operadorLocal.findMany({
          where: { id: { in: idsOperador } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombreOperador = new Map(operadores.map((o) => [o.id, o.nombre]));

    // ── LAS CAJAS QUE SE PUEDEN FORZAR ─────────────────────────────────────
    //
    // Solo para quien puede forzar (Admin, o el dueño en su local): las cajas
    // ABIERTAS de otros operadores, que es lo único que un forzado cierra. Una
    // caja con el corte ya tomado no va acá: está arriba, en los pendientes, y
    // se fuerza desde su fila.
    const forzar = { operadorDelPin: identidad.operadorId, puedeForzar: identidad.puedeIntervenir === true };
    const abiertas = forzar.puedeForzar
      ? await prisma.turno.findMany({
          where: { localId, anuladoEn: null, ...WHERE_TURNO_OPERATIVO },
          orderBy: { apertura: "asc" },
          take: 50,
          select: {
            id: true, apertura: true, vendedorId: true, operadorId: true, montoInicial: true,
            vendedor: { select: { nombre: true } },
            operador: { select: { nombre: true } },
          },
        })
      : [];

    return NextResponse.json({
      ok: true,
      cajasAbiertas: abiertas
        .filter((t) => puedeForzarCierre(t, forzar))
        .map((t) => ({
          turnoId: t.id,
          apertura: t.apertura,
          montoInicial: Number(t.montoInicial),
          // Una caja sin operador es de las abiertas antes de esta regla: se
          // dice así, para que no parezca de nadie.
          operadorNombre: t.operador?.nombre ?? null,
          cajeroNombre: t.vendedor?.nombre ?? null,
        })),
      items: filas.map((f) => ({
        id: f.id,
        token: f.token,
        turnoId: f.turnoId,
        localId: f.localId,
        estado: f.estado,
        corteEn: f.corteEn,
        venceEn: f.venceEn,
        atrasado: cierreAtrasado(f, ahora),
        efectivoEsperadoCorte: Number(f.efectivoEsperadoCorte),
        cantidadVentasCorte: f.cantidadVentasCorte,
        aperturaTurno: f.turno?.apertura ?? null,
        cajeroNombre: f.turno?.vendedor?.nombre ?? null,
        operadorNombre: f.iniciadoPorOperadorId
          ? nombreOperador.get(f.iniciadoPorOperadorId) ?? null
          : null,
        forzado: f.forzadoPorUsuarioId != null,
        // Un corte de otro operador, todavía no forzado: quien puede forzar lo
        // ve, pero el conteo no lo termina hasta forzarlo.
        sePuedeForzar: f.forzadoPorUsuarioId == null && puedeForzarCierre(f.turno, forzar),
      })),
    });
  } catch (error) {
    console.error("Error listando cierres pendientes:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
