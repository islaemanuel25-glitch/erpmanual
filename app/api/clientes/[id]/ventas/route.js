import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req, context) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const clienteId = Number(id);

    if (!clienteId || Number.isNaN(clienteId)) {
      return NextResponse.json(
        { ok: false, error: "ID de cliente inválido" },
        { status: 400 }
      );
    }

    // Verificar que el cliente existe y pertenece al scope del usuario
    // localId es obligatorio: clientes son por local
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId } = scope;

    // Verificar que el cliente pertenece al localId del usuario
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

    // Obtener ventas del cliente en el local específico
    const ventas = await prisma.venta.findMany({
      where: {
        clienteId,
        localId,
      },
      include: {
        local: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy: {
        fecha: "desc",
      },
      take: 100, // Limitar a las últimas 100 ventas
    });

    // Formatear respuesta
    const items = ventas.map((v) => ({
      id: v.id,
      fecha: v.fecha.toISOString(),
      numero: v.numero,
      total: Number(v.total),
      localId: v.localId,
      localNombre: v.local?.nombre || "-",
    }));

    return NextResponse.json({
      ok: true,
      items,
      total: items.length,
    });
  } catch (error) {
    console.error("Error obteniendo ventas del cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

