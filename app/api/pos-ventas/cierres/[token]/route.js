// GET /api/pos-ventas/cierres/[token]
//
// Recupera un corte congelado para que la pantalla de cierre pueda mostrarlo,
// incluso en otra pestaña, otro dispositivo, o después de recargar.
//
// Devuelve el esperado CONGELADO —nunca uno recalculado— y los movimientos de
// caja del turno hasta la frontera del corte, para que el cajero pueda explicar
// de dónde sale el número.
import { NextResponse } from "next/server";
import { desglosarMovimientos } from "@/lib/caja/efectivoEsperado";
import { cargarCierrePorToken, serializarCierre } from "@/lib/caja/cierreRelevoServer";
import { estadoDelTurno, cierreConfirmable } from "@/lib/caja/cierreRelevo";
import prisma from "@/lib/prisma";

export async function GET(req, context) {
  try {
    const { token } = await context.params;
    const res = await cargarCierrePorToken(req, token);
    if (res.error) {
      return NextResponse.json(
        { ok: false, error: res.error, needsContexto: res.needsContexto },
        { status: res.status }
      );
    }
    const { cierre } = res;

    // Movimientos HASTA LA FRONTERA. Un ingreso posterior al corte pertenece al
    // turno siguiente y no tiene por qué aparecer en este cierre. Si el corte no
    // registró frontera (turno sin movimientos), no hay nada que traer.
    const movimientos =
      cierre.ultimoMovimientoId == null
        ? []
        : await prisma.cajaMovimiento.findMany({
            where: { turnoId: cierre.turnoId, id: { lte: cierre.ultimoMovimientoId } },
            orderBy: { createdAt: "asc" },
            select: { id: true, tipo: true, monto: true, motivo: true, createdAt: true },
          });

    const agregados = desglosarMovimientos(movimientos);

    return NextResponse.json({
      ok: true,
      cierre: serializarCierre(cierre),
      confirmable: cierreConfirmable(cierre),
      turno: {
        id: cierre.turno.id,
        apertura: cierre.turno.apertura,
        estado: estadoDelTurno(cierre.turno),
        montoInicial: Number(cierre.turno.montoInicial),
      },
      movimientos: {
        ingresos: agregados.ingresos,
        retiros: agregados.retiros,
        neto: agregados.neto,
        cantidad: movimientos.length,
        detalle: movimientos.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          monto: Number(m.monto),
          motivo: m.motivo ?? null,
          createdAt: m.createdAt,
        })),
      },
      cambioPendiente: cierre.cambioPendiente
        ? { id: cierre.cambioPendiente.id, estado: cierre.cambioPendiente.estado }
        : null,
    });
  } catch (error) {
    console.error("Error leyendo cierre en preparación:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
