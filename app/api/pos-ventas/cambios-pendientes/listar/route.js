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
import { getOperadorActivo } from "@/lib/operador";
import { ESTADO_CAMBIO, esReservaPropia, whereReservaPropia } from "@/lib/caja/cierreRelevo";
import {
  contextoRelevo,
  liberarReservasVencidas,
  marcarCortesVencidos,
  serializarCambio,
} from "@/lib/caja/cierreRelevoServer";

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
    // El operario del PIN es la PERSONA; la sesión es el dispositivo. Acá alcanza
    // con leerlo: este endpoint no exige operario —listar no opera la caja— pero
    // si lo hay, es lo que define de quién es cada reserva.
    const operadorId = getOperadorActivo(req)?.operadorId ?? null;
    const ahora = new Date();

    const [liberadas, atrasados] = await Promise.all([
      liberarReservasVencidas(localId, ahora),
      // Marca de ATRASO, nada más: un corte vencido sigue congelado y su turno
      // sigue sin operar. Ver EstadoCierrePreparacion en el schema.
      marcarCortesVencidos(localId, ahora),
    ]);

    const incluirCerrados = req.nextUrl.searchParams.get("incluirCerrados") === "1";

    // ── QUÉ SE MUESTRA ─────────────────────────────────────────────────────
    //
    // Los DISPONIBLES, más la reserva PROPIA si la hay. Las reservas ajenas
    // vigentes se ocultan: mostrarlas solo serviría para que alguien intente
    // tomar un sobre que otro está contando y se lleve un 409, o peor, para que
    // dos personas crean que están contando lo mismo.
    //
    // Los RECIBIDOS y CANCELADOS tampoco: ya no esperan a nadie.
    //
    // "Propia" es del USUARIO Y DEL OPERARIO. En una computadora del mostrador
    // todos comparten `erpazul_sesion`: comparando solo el usuario, María veía
    // la reserva de Juan como suya. Reproducido en una sola PC.
    const dondeAbiertos = {
      OR: [
        { estado: { in: [ESTADO_CAMBIO.DISPONIBLE, ESTADO_CAMBIO.VENCIDO] } },
        // La propia, sea cual sea su vencimiento: si volvió dentro del plazo la
        // recupera, y si venció ya la liberó el barrido de arriba.
        {
          estado: ESTADO_CAMBIO.RESERVADO,
          ...whereReservaPropia({ usuarioId: ctx.session.id, operadorId }),
        },
      ],
    };

    const filas = await prisma.cambioPendiente.findMany({
      where: {
        localId,
        ...(incluirCerrados ? {} : dondeAbiertos),
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

    const items = filas.map((f) => ({
      ...serializarCambio(f),
      // La pantalla necesita saber cuál es "el mío" para ofrecer continuar en vez
      // de tomar. Se resuelve en el servidor y no comparando ids en el cliente.
      esMio:
        f.estado === ESTADO_CAMBIO.RESERVADO &&
        esReservaPropia(f, { usuarioId: ctx.session.id, operadorId }),
      turnoOrigen: {
        id: f.turnoOrigen.id,
        apertura: f.turnoOrigen.apertura,
        cierre: f.turnoOrigen.cierre,
      },
    }));

    return NextResponse.json({
      ok: true,
      reservasLiberadas: liberadas,
      cortesMarcadosVencidos: atrasados,
      // La reserva propia se devuelve aparte para que la pantalla la ponga
      // primero sin tener que buscarla.
      miReserva: items.find((i) => i.esMio) ?? null,
      items,
    });
  } catch (error) {
    console.error("Error listando cambios pendientes:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
