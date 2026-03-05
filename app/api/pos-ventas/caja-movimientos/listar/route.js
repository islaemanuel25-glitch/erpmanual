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

    // Validar turno pertenece al local
    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: { localId: true, vendedorId: true },
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
          { ok: false, error: "No tenes permiso para ver este turno" },
          { status: 403 }
        );
      }
    }

    const movimientos = await prisma.cajaMovimiento.findMany({
      where: { turnoId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tipo: true,
        monto: true,
        motivo: true,
        createdAt: true,
        usuario: {
          select: { id: true, nombre: true },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      items: movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        monto: Number(m.monto),
        motivo: m.motivo,
        createdAt: m.createdAt,
        usuario: m.usuario,
      })),
    });
  } catch (error) {
    console.error("Error listar movimientos caja:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
