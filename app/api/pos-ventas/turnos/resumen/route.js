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

    const ventas = await prisma.venta.findMany({
      where: { turnoId },
      select: { total: true, formaPago: true },
    });

    let totalEfectivo = 0;
    let totalDigital = 0;
    const desglose = { mercadopago: 0, debito: 0, credito: 0 };

    ventas.forEach((v) => {
      const total = Number(v.total);
      if (v.formaPago === "efectivo") {
        totalEfectivo += total;
      } else {
        totalDigital += total;
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
