import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

// PUT /api/clientes/[id]/tags (asignar tags al cliente)
export async function PUT(req, context) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { localId, grupoId } = scope;
    const { id } = await context.params;
    const clienteId = Number(id);

    if (!clienteId || Number.isNaN(clienteId)) {
      return NextResponse.json(
        { ok: false, error: "ID de cliente inválido" },
        { status: 400 }
      );
    }

    // Verificar que el cliente existe y pertenece al local
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: clienteId,
        grupoId,
        localId,
      },
    });

    if (!cliente) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    const { tagIds } = await req.json();

    if (!Array.isArray(tagIds)) {
      return NextResponse.json(
        { ok: false, error: "tagIds debe ser un array" },
        { status: 400 }
      );
    }

    // Validar que todos los tags pertenecen al local
    if (tagIds.length > 0) {
      const tags = await prisma.tagCliente.findMany({
        where: {
          id: { in: tagIds },
          localId,
        },
      });

      if (tags.length !== tagIds.length) {
        return NextResponse.json(
          { ok: false, error: "Algunos tags no pertenecen a este local" },
          { status: 400 }
        );
      }
    }

    // Actualizar tags del cliente (transacción)
    await prisma.$transaction(async (tx) => {
      // Eliminar tags actuales
      await tx.clienteTag.deleteMany({
        where: { clienteId },
      });

      // Agregar nuevos tags
      if (tagIds.length > 0) {
        await tx.clienteTag.createMany({
          data: tagIds.map((tagId) => ({
            clienteId,
            tagId,
          })),
          skipDuplicates: true,
        });
      }
    });

    // Obtener tags actualizados
    const tagsActualizados = await prisma.tagCliente.findMany({
      where: {
        id: { in: tagIds },
        localId,
      },
      select: {
        id: true,
        nombre: true,
        descuentoPorcentaje: true,
      },
    });

    return NextResponse.json({
      ok: true,
      items: tagsActualizados,
    });
  } catch (error) {
    console.error("Error actualizando tags del cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

