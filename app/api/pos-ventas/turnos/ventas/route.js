import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";

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
    const turnoId = Number(req.nextUrl.searchParams.get("turnoId"));

    if (!turnoId) {
      return NextResponse.json(
        { ok: false, error: "turnoId requerido" },
        { status: 400 }
      );
    }

    // Buscar turno y validar scope
    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        localId: true,
        vendedorId: true,
        apertura: true,
        cierre: true,
        montoInicial: true,
        montoEsperadoEfectivo: true,
        montoRealEfectivo: true,
        diferenciaEfectivo: true,
        totalVentasEfectivo: true,
        totalVentasDigital: true,
        cantidadVentas: true,
        observaciones: true,
        vendedor: {
          select: { id: true, nombre: true },
        },
      },
    });

    if (!turno || turno.localId !== localId) {
      return NextResponse.json(
        { ok: false, error: "Turno no encontrado en este local" },
        { status: 404 }
      );
    }

    // Si no es su turno, necesita turnos.ver_todos o ser admin
    if (turno.vendedorId !== session.id) {
      const puedeVerTodos =
        session.esAdmin || session.permisos.includes("turnos.ver_todos");
      if (!puedeVerTodos) {
        return NextResponse.json(
          { ok: false, error: "No tenés permiso para ver este turno" },
          { status: 403 }
        );
      }
    }

    // Obtener ventas del turno
    const ventas = await prisma.venta.findMany({
      where: { turnoId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        numero: true,
        createdAt: true,
        total: true,
        formaPago: true,
        netoRecibido: true,
        comisionBancaria: true,
        costoTotal: true,
        gananciaNeta: true,
      },
    });

    return NextResponse.json({
      ok: true,
      turno: {
        id: turno.id,
        apertura: turno.apertura,
        cierre: turno.cierre,
        montoInicial: Number(turno.montoInicial),
        montoEsperadoEfectivo: turno.montoEsperadoEfectivo != null ? Number(turno.montoEsperadoEfectivo) : null,
        montoRealEfectivo: turno.montoRealEfectivo != null ? Number(turno.montoRealEfectivo) : null,
        diferenciaEfectivo: turno.diferenciaEfectivo != null ? Number(turno.diferenciaEfectivo) : null,
        totalVentasEfectivo: turno.totalVentasEfectivo != null ? Number(turno.totalVentasEfectivo) : null,
        totalVentasDigital: turno.totalVentasDigital != null ? Number(turno.totalVentasDigital) : null,
        cantidadVentas: turno.cantidadVentas,
        observaciones: turno.observaciones,
        vendedor: turno.vendedor,
      },
      ventas: ventas.map((v) => ({
        id: v.id,
        numero: v.numero,
        fecha: v.createdAt,
        total: Number(v.total),
        formaPago: v.formaPago,
        netoRecibido: Number(v.netoRecibido),
        comisionBancaria: Number(v.comisionBancaria),
        costoTotal: Number(v.costoTotal),
        gananciaNeta: Number(v.gananciaNeta),
      })),
    });
  } catch (error) {
    console.error("Error ventas por turno:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
