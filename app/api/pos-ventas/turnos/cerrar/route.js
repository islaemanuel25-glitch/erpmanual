import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { tendersParaAgregar } from "@/lib/pos-ventas/pagos";

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
        where: { turnoId },
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

    let totalEfectivo = 0;
    let totalDigital = 0;

    // Agregación POR TENDER: en una venta mixta, solo el tender efectivo cuenta al
    // efectivo esperado; el resto va a digital. Fiado no aporta plata real.
    ventas.forEach((v) => {
      for (const t of tendersParaAgregar(v)) {
        if (t.medio === "FIADO") continue;
        if (t.medio === "EFECTIVO") totalEfectivo += t.monto;
        else totalDigital += t.monto;
      }
    });

    let totalIngresosCaja = 0;
    let totalRetirosCaja = 0;
    cajaMovimientos.forEach((m) => {
      const monto = Number(m.monto) || 0;
      if (m.tipo === "INGRESO") totalIngresosCaja += monto;
      else if (m.tipo === "RETIRO") totalRetirosCaja += monto;
    });

    const montoEsperado = Number(turno.montoInicial) + totalEfectivo + totalIngresosCaja - totalRetirosCaja;
    const diferencia = Number(montoRealEfectivo) - montoEsperado;

    const turnoCerrado = await prisma.turno.update({
      where: { id: turnoId },
      data: {
        cierre: new Date(),
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

    return NextResponse.json({ ok: true, turno: turnoCerrado });
  } catch (error) {
    console.error("Error cerrando turno:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
