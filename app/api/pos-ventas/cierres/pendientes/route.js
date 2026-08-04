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
// recuperación sin token no serviría para recuperar nada. El acceso ya está
// acotado por sesión, permiso `pos.usar` y local del contexto activo: quien lee
// esta lista es alguien que podría iniciar y confirmar ese mismo cierre.
//
// Los listados generales de cajas (turnos/listar, turnos/resumen, auditoría) NO
// lo incluyen.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ESTADO_CIERRE, cierreAtrasado } from "@/lib/caja/cierreRelevo";
import { contextoRelevo, marcarCortesVencidos } from "@/lib/caja/cierreRelevoServer";

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
    const { localId } = ctx;
    const ahora = new Date();

    // Marca de ATRASO. No libera el turno ni toca el corte: ver
    // EstadoCierrePreparacion en el schema.
    await marcarCortesVencidos(localId, ahora);

    const filas = await prisma.cierrePreparacion.findMany({
      where: { localId, estado: { in: ABIERTOS } },
      orderBy: { corteEn: "asc" },
      take: 50,
      include: {
        turno: {
          select: {
            id: true, apertura: true, vendedorId: true,
            vendedor: { select: { nombre: true } },
          },
        },
      },
    });

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

    return NextResponse.json({
      ok: true,
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
      })),
    });
  } catch (error) {
    console.error("Error listando cierres pendientes:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
