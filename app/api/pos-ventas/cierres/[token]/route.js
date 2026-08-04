// GET /api/pos-ventas/cierres/[token]
//
// Recupera un corte congelado para que la pantalla de cierre pueda mostrarlo,
// incluso en otra pestaña, otro dispositivo, o después de recargar.
//
// Devuelve el esperado CONGELADO —nunca uno recalculado— y los movimientos de
// caja del turno hasta la frontera del corte, para que el cajero pueda explicar
// de dónde sale el número.
import { NextResponse } from "next/server";
import { desglosarMovimientos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
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

    // ── Movimientos HASTA LA FRONTERA ──────────────────────────────────────
    //
    // El filtro es `id <= ultimoMovimientoId`, no una fecha. Un ingreso
    // posterior al corte pertenece al turno siguiente y no tiene por qué
    // aparecer en este cierre — ni siquiera si el cajero recarga la página tres
    // horas después. Si el corte no registró frontera (turno sin movimientos),
    // no hay nada que traer y la lista queda vacía para siempre.
    const enFrontera =
      cierre.ultimoMovimientoId == null
        ? []
        : await prisma.cajaMovimiento.findMany({
            where: { turnoId: cierre.turnoId, id: { lte: cierre.ultimoMovimientoId } },
            orderBy: { createdAt: "asc" },
            select: { id: true, tipo: true, monto: true, motivo: true, createdAt: true },
          });

    // ── Solo los MANUALES ──────────────────────────────────────────────────
    //
    // Los retiros de recaudación tienen su propia pantalla y su propio
    // historial. Mezclarlos acá haría leer un retiro de $103.400 como si alguien
    // hubiera sacado plata a mano del cajón.
    //
    // Se excluyen por el VÍNCULO (`ArqueoCaja.cajaMovimientoRetiroId`), no por
    // el texto del motivo: el motivo es para que un humano lea el historial, y
    // filtrar por texto rompería con el primer retiro que lo tuviera distinto.
    // Mismo criterio que usa turnos/resumen.
    const automaticos = enFrontera.length
      ? await prisma.arqueoCaja.findMany({
          where: { turnoId: cierre.turnoId, cajaMovimientoRetiroId: { in: enFrontera.map((m) => m.id) } },
          select: { cajaMovimientoRetiroId: true },
        })
      : [];
    const idsAutomaticos = new Set(automaticos.map((a) => a.cajaMovimientoRetiroId));
    const movimientos = enFrontera.filter((m) => !idsAutomaticos.has(m.id));

    const agregados = desglosarMovimientos(movimientos);

    // ── La AUTORÍA, resuelta desde lo que quedó grabado en el corte ─────────
    //
    // No se lee el operador ACTIVO. Para cuando el cajero termina de contar, la
    // cookie del navegador puede estar mostrando al operador que lo relevó —es
    // una cookie del navegador entero, no de la pestaña— y la pantalla del
    // cierre pasaría a decir que cierra alguien que no contó nada.
    const [operadorCierre, cajero, localFila] = await Promise.all([
      cierre.iniciadoPorOperadorId
        ? prisma.operadorLocal.findUnique({
            where: { id: cierre.iniciadoPorOperadorId },
            select: { id: true, nombre: true },
          })
        : null,
      prisma.usuario.findUnique({
        where: { id: cierre.turno.vendedorId },
        select: { id: true, nombre: true },
      }),
      prisma.local.findUnique({ where: { id: cierre.localId }, select: { id: true, nombre: true } }),
    ]);

    return NextResponse.json({
      ok: true,
      cierre: serializarCierre(cierre),
      confirmable: cierreConfirmable(cierre),
      turno: {
        id: cierre.turno.id,
        apertura: cierre.turno.apertura,
        estado: estadoDelTurno(cierre.turno),
        montoInicial: Number(cierre.turno.montoInicial),
        cajeroNombre: cajero?.nombre ?? null,
      },
      operadorCierre: operadorCierre
        ? { id: operadorCierre.id, nombre: operadorCierre.nombre }
        : null,
      local: localFila ? { id: localFila.id, nombre: localFila.nombre } : null,
      // `desglosarMovimientos` devuelve CENTAVOS enteros —así es como toda la
      // aritmética monetaria del circuito evita el error de coma flotante— y la
      // conversión a pesos se hace acá, igual que en turnos/resumen.
      movimientos: {
        ingresos: desdeCentavos(agregados.ingresosCentavos),
        retiros: desdeCentavos(agregados.retirosCentavos),
        neto: desdeCentavos(agregados.ingresosCentavos - agregados.retirosCentavos),
        cantidad: movimientos.length,
        // `fecha` y no `createdAt`: es el nombre que ya lee PanelMovimientos,
        // compartido con la pantalla de retiro.
        detalle: movimientos.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          monto: Number(m.monto),
          motivo: m.motivo ?? null,
          fecha: m.createdAt,
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
