import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { PERMISO_VER_VENTAS_DEL_DIA } from "@/lib/rbac/permisosDelOperador";
import { getContextoActivo } from "@/lib/contexto";
import { estadoFinanciero } from "@/lib/pos-ventas/comisionPendiente";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // El total y los tickets del día no son de cualquiera: CAJERO no los tiene,
    // y con un operador activo por PIN tampoco la cuenta que sí
    // (lib/rbac/permisosDelOperador.js). Antes esta ruta no pedía permiso.
    const perm = checkPerm(session, PERMISO_VER_VENTAS_DEL_DIA);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const contexto = getContextoActivo(req, session);
    if (contexto.needsContexto) {
      return NextResponse.json(
        { ok: false, error: "Contexto requerido" },
        { status: 409 }
      );
    }

    const localId = contexto.localId;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Ventas del día: cantidad y total
    const aggVentas = await prisma.venta.aggregate({
      where: whereVentaComercial({
        localId,
        fecha: { gte: hoy },
      }),
      _count: { id: true },
      _sum: { total: true, gananciaNeta: true },
    });

    // Items vendidos hoy
    const aggItems = await prisma.ventaDetalle.aggregate({
      where: {
        venta: whereVentaComercial({
          localId,
          fecha: { gte: hoy },
        }),
      },
      _sum: { cantidad: true },
    });

    const cantidadVentas = aggVentas._count.id || 0;
    const totalVentas = Number(aggVentas._sum.total) || 0;
    const ticketPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;
    const gananciaNetaHoy = Number(aggVentas._sum.gananciaNeta) || 0;
    const itemsVendidos = Number(aggItems._sum.cantidad) || 0;

    // La ganancia neta del día es el único número de acá que depende de la
    // comisión: si hay ventas cobradas sin configurarla, descontó de menos y
    // está sobreestimada. El total facturado y los items no se ven afectados.
    const pendientesHoy = await prisma.venta.count({
      where: whereVentaComercial({ localId, fecha: { gte: hoy }, comisionPendiente: true }),
    });

    return NextResponse.json({
      ok: true,
      resumen: {
        cantidadVentas,
        totalVentas,
        ticketPromedio,
        gananciaNetaHoy,
        itemsVendidos,
        estadoFinanciero: estadoFinanciero({ pendientes: pendientesHoy, total: cantidadVentas }),
      },
    });
  } catch (error) {
    console.error("Error dashboard/resumen:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
