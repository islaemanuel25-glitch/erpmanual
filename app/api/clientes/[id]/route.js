import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

// GET /api/clientes/[id] - Obtener datos del cliente
export async function GET(req, context) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId } = scope;
    const { id } = await context.params;
    const clienteId = Number(id);

    if (!clienteId || Number.isNaN(clienteId)) {
      return NextResponse.json(
        { ok: false, error: "ID de cliente inválido" },
        { status: 400 }
      );
    }

    // Obtener cliente con tags
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: clienteId,
        grupoId,
        localId,
      },
      include: {
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        listaPrecio: {
          select: { id: true, nombre: true, esDefault: true, activo: true },
        },
      },
    });

    if (!cliente) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    // Formatear respuesta
    const clienteFormateado = {
      ...cliente,
      tags: cliente.tags.map((ct) => ct.tag),
    };

    return NextResponse.json({ ok: true, cliente: clienteFormateado });
  } catch (error) {
    console.error("Error obteniendo cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

