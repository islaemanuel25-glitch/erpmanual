// app/api/transferencias/obtener/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const id = Number(searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const isAdmin = Array.isArray(session.permisos)
      ? session.permisos.includes("*")
      : false;

    const transferencia = await prisma.transferencia.findUnique({
      where: { id },
      include: {
        origen: { select: { id: true, nombre: true, es_deposito: true } },
        destino: { select: { id: true, nombre: true } },
      },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    // MISMOS CHEQUEOS DE VISIBILIDAD QUE EN /detalle
    if (!isAdmin || session.localId) {
      const localId = Number(session.localId || 0);

      if (!localId && !isAdmin) {
        return NextResponse.json(
          { ok: false, error: "Usuario sin local asignado" },
          { status: 400 }
        );
      }

      if (!isAdmin) {
        const local = await prisma.local.findUnique({
          where: { id: localId },
          select: { es_deposito: true },
        });

        if (!local) {
          return NextResponse.json(
            { ok: false, error: "Local no encontrado" },
            { status: 404 }
          );
        }

        if (local.es_deposito) {
          if (transferencia.origenId !== localId) {
            return NextResponse.json(
              { ok: false, error: "Sin permiso para ver esta transferencia" },
              { status: 403 }
            );
          }
        } else {
          if (transferencia.destinoId !== localId) {
            return NextResponse.json(
              { ok: false, error: "Sin permiso para ver esta transferencia" },
              { status: 403 }
            );
          }
        }
      }
    }

    const item = {
      id: transferencia.id,
      estado: transferencia.estado,
      origenId: transferencia.origenId,
      origenNombre: transferencia.origen.nombre,
      origenEsDeposito: transferencia.origen.es_deposito,
      destinoId: transferencia.destinoId,
      destinoNombre: transferencia.destino.nombre,
      fechaEnvio: transferencia.fechaEnvio,
      fechaRecepcion: transferencia.fechaRecepcion,
      createdAt: transferencia.createdAt,
      updatedAt: transferencia.updatedAt,
    };

    return NextResponse.json({
      ok: true,
      item,
    });
  } catch (err) {
    console.error("Error en /api/transferencias/obtener:", err);
    return NextResponse.json(
      { ok: false, error: "Error al obtener transferencia" },
      { status: 500 }
    );
  }
}
