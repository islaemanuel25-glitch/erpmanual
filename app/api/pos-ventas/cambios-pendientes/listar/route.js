// GET /api/pos-ventas/cambios-pendientes/listar
//
// Los sobres de cambio que hay dando vueltas en el local: lo que cada cierre dejó
// en el cajón esperando al próximo operador.
//
// Antes de listar libera las reservas vencidas. No hay job ni cron: el momento en
// que a alguien le importa que un sobre esté libre es justo cuando abre esta
// pantalla para tomarlo, así que resolverlo acá evita infraestructura para
// adelantar unos segundos algo que se resuelve solo.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ESTADO_CAMBIO } from "@/lib/caja/cierreRelevo";
import {
  contextoRelevo,
  liberarReservasVencidas,
  marcarCortesVencidos,
  serializarCambio,
} from "@/lib/caja/cierreRelevoServer";

/** Estados que se listan por defecto: los que todavía esperan a alguien. */
const ABIERTOS = [ESTADO_CAMBIO.DISPONIBLE, ESTADO_CAMBIO.RESERVADO, ESTADO_CAMBIO.VENCIDO];

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

    const [liberadas, atrasados] = await Promise.all([
      liberarReservasVencidas(localId, ahora),
      // Marca de ATRASO, nada más: un corte vencido sigue congelado y su turno
      // sigue sin operar. Ver EstadoCierrePreparacion en el schema.
      marcarCortesVencidos(localId, ahora),
    ]);

    const incluirCerrados = req.nextUrl.searchParams.get("incluirCerrados") === "1";

    const filas = await prisma.cambioPendiente.findMany({
      where: {
        localId,
        ...(incluirCerrados ? {} : { estado: { in: ABIERTOS } }),
      },
      orderBy: { dejadoEn: "desc" },
      take: 50,
      include: {
        turnoOrigen: {
          select: {
            id: true, apertura: true, cierre: true,
            vendedor: { select: { nombre: true } },
            operador: { select: { nombre: true } },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      reservasLiberadas: liberadas,
      cortesMarcadosVencidos: atrasados,
      items: filas.map((f) => ({
        ...serializarCambio(f),
        turnoOrigen: {
          id: f.turnoOrigen.id,
          apertura: f.turnoOrigen.apertura,
          cierre: f.turnoOrigen.cierre,
        },
      })),
    });
  } catch (error) {
    console.error("Error listando cambios pendientes:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
