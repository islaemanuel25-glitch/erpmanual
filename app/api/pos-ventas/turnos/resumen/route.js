import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const turnoId = Number(req.nextUrl.searchParams.get("turnoId"));
    if (!turnoId) {
      return NextResponse.json(
        { ok: false, error: "turnoId requerido" },
        { status: 400 }
      );
    }

    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: { localId: true },
    });

    if (!turno) {
      return NextResponse.json(
        { ok: false, error: "Turno no encontrado" },
        { status: 404 }
      );
    }

    if (!session.esAdmin && Number(session.localId) !== Number(turno.localId)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para este turno" },
        { status: 403 }
      );
    }

    const ventas = await prisma.venta.findMany({
      where: { turnoId },
      select: { total: true, formaPago: true, comisionBancaria: true, netoRecibido: true },
    });

    let totalEfectivo = 0;
    let totalDigital = 0;
    let totalComision = 0;
    let netoDigital = 0;
    const desglose = { mercadopago: 0, debito: 0, credito: 0 };

    ventas.forEach((v) => {
      const total = Number(v.total);
      const comision = Number(v.comisionBancaria) || 0;
      const neto = Number(v.netoRecibido) || total;

      if (v.formaPago === "efectivo") {
        totalEfectivo += total;
      } else {
        totalDigital += total;
        totalComision += comision;
        netoDigital += neto;
        if (desglose[v.formaPago] !== undefined) {
          desglose[v.formaPago] += total;
        }
      }
    });

    return NextResponse.json({
      ok: true,
      cantidadVentas: ventas.length,
      totalEfectivo,
      totalDigital,
      totalComision,
      netoDigital,
      desglose,
    });
  } catch (error) {
    console.error("Error resumen turno:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
