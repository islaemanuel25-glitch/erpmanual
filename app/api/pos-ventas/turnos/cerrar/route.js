import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

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
    const ventas = await prisma.venta.findMany({
      where: { turnoId },
      select: { total: true, formaPago: true },
    });

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

    const montoEsperado = Number(turno.montoInicial) + totalEfectivo;
    const diferencia = Number(montoRealEfectivo) - montoEsperado;

    const turnoCerrado = await prisma.turno.update({
      where: { id: turnoId },
      data: {
        cierre: new Date(),
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
