import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

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

    // Calcular totales de ventas del turno
    const [ventas, cajaMovimientos] = await Promise.all([
      prisma.venta.findMany({
        where: { turnoId },
        select: { total: true, formaPago: true },
      }),
      prisma.cajaMovimiento.findMany({
        where: { turnoId },
        select: { tipo: true, monto: true },
      }),
    ]);

    let totalEfectivo = 0;
    let totalDigital = 0;

    ventas.forEach((v) => {
      const total = Number(v.total);
      if (v.formaPago === "efectivo") {
        totalEfectivo += total;
      } else {
        totalDigital += total;
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
