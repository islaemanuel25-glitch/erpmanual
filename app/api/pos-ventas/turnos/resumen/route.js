import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { tendersParaAgregar } from "@/lib/pos-ventas/pagos";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";

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
        // Mismo criterio que turnos/cerrar: el operador tiene que ver exactamente
        // el mismo esperado que después calcula el cierre.
        where: whereVentaComercial({ turnoId }),
        select: {
          total: true, formaPago: true, esFiado: true, comisionBancaria: true, netoRecibido: true,
          pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
        },
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

    // Agregación POR TENDER: cada pago aporta su monto al bucket de SU medio. Una
    // venta mixta puede sumar parcialmente en efectivo y en un medio digital.
    ventas.forEach((v) => {
      for (const t of tendersParaAgregar(v)) {
        if (t.medio === "FIADO") {
          totalFiado += t.monto;
          desglose.fiado += t.monto;
        } else if (t.medio === "EFECTIVO") {
          totalEfectivo += t.monto;
        } else {
          // digital (MERCADOPAGO / DEBITO / CREDITO)
          totalDigital += t.monto;
          totalComision += t.comision;
          netoDigital += t.neto;
          const key = t.medio.toLowerCase();
          if (desglose[key] !== undefined) desglose[key] += t.monto;
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
