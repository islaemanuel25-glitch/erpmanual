import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

export async function GET(req) {
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

    const [ventas, cajaMovimientos] = await Promise.all([
      prisma.venta.findMany({
        where: { turnoId },
        select: { total: true, formaPago: true, esFiado: true, comisionBancaria: true, netoRecibido: true },
      }),
      prisma.cajaMovimiento.findMany({
        where: { turnoId },
        select: { tipo: true, monto: true },
      }),
    ]);

    let totalEfectivo = 0;
    let totalDigital = 0;
    let totalComision = 0;
    let netoDigital = 0;
    let totalFiado = 0;
    const desglose = { mercadopago: 0, debito: 0, credito: 0, fiado: 0 };

    ventas.forEach((v) => {
      const total = Number(v.total);
      const comision = Number(v.comisionBancaria) || 0;
      const neto = Number(v.netoRecibido) || total;

      if (v.esFiado === true) {
        totalFiado += total;
        desglose.fiado += total;
        return;
      }

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

    // Sumar movimientos de caja (ingresos y retiros)
    let totalIngresosCaja = 0;
    let totalRetirosCaja = 0;
    cajaMovimientos.forEach((m) => {
      const monto = Number(m.monto) || 0;
      if (m.tipo === "INGRESO") totalIngresosCaja += monto;
      else if (m.tipo === "RETIRO") totalRetirosCaja += monto;
    });

    return NextResponse.json({
      ok: true,
      cantidadVentas: ventas.length,
      totalEfectivo,
      totalDigital,
      totalFiado,
      totalComision,
      netoDigital,
      totalIngresosCaja,
      totalRetirosCaja,
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
