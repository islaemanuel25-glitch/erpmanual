import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { resolveScope } from "@/lib/grupos";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
// Fórmula única del efectivo esperado. Antes vivía duplicada acá, en
// turnos/resumen y en ModalCierreTurno; ahora los tres —y los arqueos— usan la
// misma función, así que el cierre y el arqueo no pueden informar faltantes
// distintos sobre la misma caja.
import { calcularEfectivoEsperado, calcularDiferencia } from "@/lib/caja/efectivoEsperado";

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

    const { turnoId, montoRealEfectivo, observaciones } = await req.json();

    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
    });

    if (!turno || turno.vendedorId !== session.id) {
      return NextResponse.json(
        { ok: false, error: "Turno no encontrado" },
        { status: 404 }
      );
    }

    if (turno.cierre) {
      return NextResponse.json(
        { ok: false, error: "Turno ya cerrado" },
        { status: 400 }
      );
    }

    // Aislamiento por local. Antes solo se validaba `vendedorId === session.id`:
    // el local del turno nunca se contrastaba contra el alcance de la sesión.
    // Un usuario reasignado a otro local conservaba la llave de un turno ajeno.
    const scope = await resolveScope(req, { explicitLocalId: turno.localId });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    if (scope.localId !== turno.localId) {
      return NextResponse.json(
        { ok: false, error: "Turno fuera de tu alcance." },
        { status: 403 }
      );
    }

    // Gate de operario. El local autorizado es el del turno (ya validado por
    // vendedorId === session.id), no un valor crudo del cliente. Para DUEÑO_LOCAL
    // el bypass solo aplica si ese local es el suyo (puedeOperarSinOperador).
    const gateOp = await requireOperadorSegunConfig(req, session, { localId: turno.localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    // Calcular totales de ventas del turno.
    // Misma lógica que resumen/route.js: fiado va aparte, no infla digital.
    // (El modelo Turno no tiene campo totalVentasFiado, así que fiado no se
    // persiste — sólo se evita que contamine totalVentasDigital).
    const [ventas, cajaMovimientos] = await Promise.all([
      prisma.venta.findMany({
        // Las operaciones internas (venta con remito vinculado) no son cobros:
        // sumarlas al efectivo esperado produce un faltante de caja que nunca
        // ocurrió. Mismo criterio que turnos/resumen y turnos/ventas.
        where: whereVentaComercial({ turnoId }),
        select: {
          total: true, formaPago: true, esFiado: true,
          pagos: { select: { medio: true, monto: true } },
        },
      }),
      prisma.cajaMovimiento.findMany({
        where: { turnoId },
        select: { tipo: true, monto: true },
      }),
    ]);

    // Agregación POR TENDER: en una venta mixta, solo el tender efectivo cuenta al
    // efectivo esperado; el resto va a digital. Fiado no aporta plata real.
    // Toda esa aritmética vive ahora en lib/caja/efectivoEsperado.
    const calculo = calcularEfectivoEsperado({
      montoInicial: turno.montoInicial,
      ventas,
      movimientos: cajaMovimientos,
    });

    const totalEfectivo = calculo.ventasEfectivo;
    const totalDigital = calculo.ventasDigital;
    const montoEsperado = calculo.efectivoEsperado;
    const diferencia = calcularDiferencia(montoRealEfectivo, montoEsperado);

    const ahora = new Date();

    // El cierre YA pide el efectivo contado, así que ese mismo conteo se guarda
    // como arqueo FINAL en vez de pedirlo dos veces. Es la MISMA diferencia
    // persistida en dos lugares con el mismo valor —el turno la conserva para no
    // romper reportes, el arqueo la incorpora al historial de cortes—, no dos
    // diferencias distintas sobre el mismo conteo.
    //
    // Transacción: si la creación del arqueo fallara, el turno no puede quedar
    // cerrado sin su corte final.
    const { turnoCerrado } = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.turno.update({
        where: { id: turnoId },
        data: {
          cierre: ahora,
          cerradoPorId: session.id,
          montoEsperadoEfectivo: montoEsperado,
          montoRealEfectivo: Number(montoRealEfectivo),
          diferenciaEfectivo: diferencia,
          totalVentasEfectivo: totalEfectivo,
          totalVentasDigital: totalDigital,
          cantidadVentas: ventas.length,
          observaciones: observaciones || null,
        },
      });

      // El período del corte final arranca donde terminó el último parcial, o en
      // la apertura si no hubo ninguno.
      const ultimo = await tx.arqueoCaja.findFirst({
        where: { turnoId },
        orderBy: { fechaHora: "desc" },
        select: { fechaHora: true },
      });

      await tx.arqueoCaja.create({
        data: {
          turnoId,
          localId: turno.localId,
          usuarioId: turno.vendedorId,
          operadorId: turno.operadorId ?? null,
          realizadoPorId: session.id,
          fechaHora: ahora,
          periodoDesde: ultimo?.fechaHora ?? turno.apertura,
          periodoHasta: ahora,
          efectivoEsperado: montoEsperado,
          efectivoContado: Number(montoRealEfectivo),
          diferencia,
          observacion: observaciones || null,
          tipo: "FINAL",
          // Un turno cerrado no se vuelve a cerrar, así que la clave fija basta
          // para que un doble envío no genere dos cortes finales.
          idempotencyKey: `cierre-${turnoId}`,
        },
      });

      return { turnoCerrado: actualizado };
    });

    return NextResponse.json({ ok: true, turno: turnoCerrado });
  } catch (error) {
    console.error("Error cerrando turno:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
