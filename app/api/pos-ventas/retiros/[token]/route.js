// GET /api/pos-ventas/retiros/[token]
//
// Recupera un corte de retiro congelado para que la pantalla de conteo pueda
// mostrarlo: en otra pestaña, en otro dispositivo, o después de reiniciar el
// navegador.
//
// Devuelve los DOS números congelados —efectivo esperado al corte y retiro
// esperado— y nunca uno recalculado. También los movimientos de caja del turno
// hasta la frontera del corte, para que el cajero pueda explicar de dónde sale
// el número.
//
// LA ACTIVIDAD POSTERIOR SE INFORMA, NO SE APLICA. Si el POS siguió vendiendo
// —que es lo esperable, porque este turno NO se congela— se devuelve una señal
// para mostrar un aviso. Ningún importe cambia por eso.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { desglosarMovimientos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { estadoDelTurno } from "@/lib/caja/cierreRelevo";
import { retiroConfirmable, actividadPosterior } from "@/lib/caja/retiroRelevo";
import {
  cargarRetiroPorToken,
  fronteraActual,
  serializarRetiroPreparacion,
} from "@/lib/caja/retiroRelevoServer";

export async function GET(req, context) {
  try {
    const { token } = await context.params;
    const res = await cargarRetiroPorToken(req, token);
    if (res.error) {
      return NextResponse.json(
        { ok: false, error: res.error, needsContexto: res.needsContexto },
        { status: res.status }
      );
    }
    const { retiro } = res;

    // ── Movimientos HASTA LA FRONTERA ──────────────────────────────────────
    //
    // El filtro es `id <= ultimoMovimientoId`, no una fecha. Un ingreso
    // posterior al corte pertenece al período siguiente y no tiene por qué
    // aparecer en este retiro — ni siquiera si el cajero recarga la página tres
    // horas después.
    const enFrontera =
      retiro.ultimoMovimientoId == null
        ? []
        : await prisma.cajaMovimiento.findMany({
            where: { turnoId: retiro.turnoId, id: { lte: retiro.ultimoMovimientoId } },
            orderBy: { createdAt: "asc" },
            select: { id: true, tipo: true, monto: true, motivo: true, createdAt: true },
          });

    // ── Solo los MANUALES ──────────────────────────────────────────────────
    //
    // Los retiros de recaudación anteriores tienen su propio historial.
    // Mezclarlos acá haría leer un retiro de $103.400 como si alguien hubiera
    // sacado plata a mano del cajón.
    //
    // Se excluyen por el VÍNCULO (`ArqueoCaja.cajaMovimientoRetiroId`), no por
    // el texto del motivo: el motivo es para que un humano lea el historial, y
    // filtrar por texto rompería con el primer retiro que lo tuviera distinto.
    const automaticos = enFrontera.length
      ? await prisma.arqueoCaja.findMany({
          where: {
            turnoId: retiro.turnoId,
            cajaMovimientoRetiroId: { in: enFrontera.map((m) => m.id) },
          },
          select: { cajaMovimientoRetiroId: true },
        })
      : [];
    const idsAutomaticos = new Set(automaticos.map((a) => a.cajaMovimientoRetiroId));
    const movimientos = enFrontera.filter((m) => !idsAutomaticos.has(m.id));
    const agregados = desglosarMovimientos(movimientos);

    // ── La AUTORÍA, resuelta desde lo que quedó grabado en el corte ─────────
    const [operadorRetiro, cajero, localFila, ahora] = await Promise.all([
      retiro.iniciadoPorOperadorId
        ? prisma.operadorLocal.findUnique({
            where: { id: retiro.iniciadoPorOperadorId },
            select: { id: true, nombre: true },
          })
        : null,
      prisma.usuario.findUnique({
        where: { id: retiro.turno.vendedorId },
        select: { id: true, nombre: true },
      }),
      prisma.local.findUnique({ where: { id: retiro.localId }, select: { id: true, nombre: true } }),
      fronteraActual(retiro.turnoId),
    ]);

    const posterior = actividadPosterior({
      ultimaVentaId: retiro.ultimaVentaId,
      ultimoMovimientoId: retiro.ultimoMovimientoId,
      ...ahora,
    });

    return NextResponse.json({
      ok: true,
      retiro: serializarRetiroPreparacion(retiro),
      confirmable: retiroConfirmable(retiro),
      turno: {
        id: retiro.turno.id,
        apertura: retiro.turno.apertura,
        estado: estadoDelTurno(retiro.turno),
        montoInicial: Number(retiro.turno.montoInicial),
        cajeroNombre: cajero?.nombre ?? null,
      },
      operadorRetiro: operadorRetiro
        ? { id: operadorRetiro.id, nombre: operadorRetiro.nombre }
        : null,
      local: localFila ? { id: localFila.id, nombre: localFila.nombre } : null,
      // Informativo. No cambia ningún importe de la pantalla.
      actividadPosterior: posterior,
      // `desglosarMovimientos` devuelve CENTAVOS enteros —así es como toda la
      // aritmética monetaria del circuito evita el error de coma flotante— y la
      // conversión a pesos se hace acá, igual que en turnos/resumen.
      movimientos: {
        ingresos: desdeCentavos(agregados.ingresosCentavos),
        retiros: desdeCentavos(agregados.retirosCentavos),
        neto: desdeCentavos(agregados.ingresosCentavos - agregados.retirosCentavos),
        cantidad: movimientos.length,
        // `fecha` y no `createdAt`: es el nombre que ya lee PanelMovimientos.
        detalle: movimientos.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          monto: Number(m.monto),
          motivo: m.motivo ?? null,
          fecha: m.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Error leyendo retiro en preparación:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
