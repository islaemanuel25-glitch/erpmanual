import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { getRangoArgentina, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { identidadParaMirar } from "@/lib/caja/identidadCajaServer";

export async function GET(req) {
  try {
    const perm = requirePerm(req, "pos.usar");
    if (!perm.ok)
      return NextResponse.json(
        { ok: false, error: perm.error },
        { status: perm.status }
      );

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { localId, session } = scope;
    const params = req.nextUrl.searchParams;

    // Filtros
    const numero = params.get("numero");
    const formaPago = params.get("formaPago");
    const soloConTurno = params.get("soloConTurno") === "true";
    let vendedorId = params.get("vendedorId")
      ? Number(params.get("vendedorId"))
      : null;

    // Scope: solo sus ventas si no tiene turnos.ver_todos ni es admin.
    //
    // "Sus" ventas son las del OPERADOR del PIN cuando lo hay: con una cuenta
    // compartida por el mostrador, "las de mi cuenta" eran las de todos los
    // operadores. Sin operador, las de la cuenta, como siempre.
    const puedeVerTodos =
      session.esAdmin || session.permisos.includes("turnos.ver_todos");
    let operadorPropio = null;
    if (!puedeVerTodos) {
      vendedorId = session.id;
      operadorPropio = (await identidadParaMirar(req, session, { localId })).operadorId;
    }

    // Ventas del día en hora Argentina. El contenedor corre en UTC; con
    // new Date().setHours(0,...) la ventana era el día UTC y de noche (después
    // de las ~21:00 ART) se vaciaba. getRangoArgentina da el día ART correcto.
    const fechaHoy = hoyArgentinaISO();
    const { fechaInicio, fechaFin } = getRangoArgentina(fechaHoy, fechaHoy);

    const where = {
      localId,
      fecha: { gte: fechaInicio, lte: fechaFin },
    };

    if (operadorPropio != null) {
      where.operadorId = operadorPropio;
    } else if (vendedorId) {
      where.vendedorId = vendedorId;
    }

    if (numero) {
      where.numero = Number(numero);
    }

    if (formaPago && formaPago !== "TODAS") {
      where.formaPago = formaPago;
    }

    if (soloConTurno) {
      where.turnoId = { not: null };
    }

    const limit = params.get("limit") ? Number(params.get("limit")) : undefined;

    const ventas = await prisma.venta.findMany({
      where: whereVentaComercial(where),
      orderBy: { fecha: "desc" },
      ...(limit && { take: limit }),
      select: {
        id: true,
        numero: true,
        fecha: true,
        subtotal: true,
        descuento: true,
        total: true,
        formaPago: true,
        turnoId: true,
        detalles: {
          select: {
            nombre: true,
            cantidad: true,
            precio: true,
            subtotal: true,
          },
        },
        vendedor: {
          select: { id: true, nombre: true, email: true },
        },
        turno: {
          select: {
            id: true,
            apertura: true,
            cierre: true,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, items: ventas });
  } catch (error) {
    console.error("Error historial dia:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
