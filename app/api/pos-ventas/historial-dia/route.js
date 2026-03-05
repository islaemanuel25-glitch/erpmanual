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
    const params = req.nextUrl.searchParams;

    // Filtros
    const numero = params.get("numero");
    const formaPago = params.get("formaPago");
    const soloConTurno = params.get("soloConTurno") === "true";
    let vendedorId = params.get("vendedorId")
      ? Number(params.get("vendedorId"))
      : null;

    // Scope: solo sus ventas si no tiene turnos.ver_todos ni es admin
    const puedeVerTodos =
      session.esAdmin || session.permisos.includes("turnos.ver_todos");
    if (!puedeVerTodos) {
      vendedorId = session.id;
    }

    // Ventas de hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const where = {
      localId,
      fecha: { gte: hoy },
    };

    if (vendedorId) {
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

    const ventas = await prisma.venta.findMany({
      where,
      orderBy: { fecha: "desc" },
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
