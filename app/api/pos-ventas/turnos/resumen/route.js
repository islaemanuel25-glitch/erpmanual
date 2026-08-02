import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { tendersParaAgregar } from "@/lib/pos-ventas/pagos";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { calcularEfectivoEsperado } from "@/lib/caja/efectivoEsperado";

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
      select: { localId: true, montoInicial: true },
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

    // Totales por tender e ingresos/retiros: misma función que usa el cierre y
    // el arqueo (lib/caja/efectivoEsperado). Antes esta agregación estaba
    // escrita a mano acá y otra vez en cerrar/route.js.
    const calculo = calcularEfectivoEsperado({
      montoInicial: turno?.montoInicial ?? 0,
      ventas,
      movimientos: cajaMovimientos,
    });

    // El desglose POR MEDIO digital es propio de esta pantalla —el cierre no lo
    // necesita— así que se arma acá, sobre los mismos tenders.
    const desglose = { mercadopago: 0, debito: 0, credito: 0, fiado: 0 };
    ventas.forEach((v) => {
      for (const t of tendersParaAgregar(v)) {
        const key = String(t.medio || "").toLowerCase();
        if (desglose[key] !== undefined) desglose[key] += t.monto;
      }
    });

    return NextResponse.json({
      ok: true,
      cantidadVentas: calculo.cantidadVentas,
      totalEfectivo: calculo.ventasEfectivo,
      totalDigital: calculo.ventasDigital,
      totalFiado: calculo.ventasFiado,
      totalComision: calculo.comisionDigital,
      netoDigital: calculo.netoDigital,
      totalIngresosCaja: calculo.ingresos,
      totalRetirosCaja: calculo.retiros,
      // El esperado ya calculado por el backend: el modal de cierre lo muestra
      // en vez de recalcularlo por su cuenta.
      montoInicial: calculo.montoInicial,
      efectivoEsperado: calculo.efectivoEsperado,
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
