// app/api/pos-transferencias/cancelar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { requireOperadorSegunConfig } from "@/lib/operador";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // Local autorizado = el de la sesión (identidad del JWT, no del body). El
    // scope de propiedad del POS (destino + grupo) se valida más abajo. Para
    // DUEÑO_LOCAL el bypass de operario solo aplica en su propio local.
    const gateOp = await requireOperadorSegunConfig(req, session, { localId: session.localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    // ============================
    // Permiso: admin (*) o pedidos.editar
    // ============================
    const permisos = Array.isArray(session.permisos) ? session.permisos : [];
    // Admin = "*" SIN local asignado (mismo criterio que solicitados/enviar/opciones).
    // Un usuario "*" CON local no debe saltarse la validación de propiedad (destino+grupo).
    const esAdmin = permisos.includes("*") && !session.localId;

    if (!esAdmin && !permisos.includes("pedidos.editar")) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso para cancelar pedidos" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const posId = Number(body.posId || 0);

    if (!posId) {
      return NextResponse.json(
        { ok: false, error: "posId requerido" },
        { status: 400 }
      );
    }

    // ============================
    // Validar POS
    // ============================
    const pos = await prisma.posTransferencia.findUnique({
      where: { id: posId },
      select: { id: true, estado: true, origenId: true, destinoId: true },
    });

    if (!pos) {
      return NextResponse.json(
        { ok: false, error: "POS no encontrada" },
        { status: 404 }
      );
    }

    // ============================
    // Ownership: usuario no-admin debe pertenecer al local destino y al mismo grupo
    // ============================
    if (!esAdmin) {
      const localId = Number(session.localId);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "Usuario sin local asignado" },
          { status: 403 }
        );
      }

      if (pos.destinoId !== localId) {
        return NextResponse.json(
          { ok: false, error: "No tenés acceso a este pedido" },
          { status: 403 }
        );
      }

      // Verificar que el POS pertenezca al mismo grupo del usuario
      const grupoUsuario = await getGrupoIdDeLocal(localId);
      const grupoOrigen = await getGrupoIdDeLocal(pos.origenId);

      if (!grupoUsuario || grupoUsuario !== grupoOrigen) {
        return NextResponse.json(
          { ok: false, error: "No tenés acceso a este pedido" },
          { status: 403 }
        );
      }
    }

    // ============================
    // Estado: solo se puede cancelar "Solicitado"
    // ============================
    if (pos.estado !== "Solicitado") {
      return NextResponse.json(
        {
          ok: false,
          error: `No se puede cancelar un pedido en estado "${pos.estado}". Solo se pueden cancelar pedidos solicitados.`,
        },
        { status: 409 }
      );
    }

    // ============================
    // Eliminar detalles + POS
    // ============================
    await prisma.posTransferenciaDetalle.deleteMany({
      where: { posTransferenciaId: posId },
    });

    await prisma.posTransferencia.delete({
      where: { id: posId },
    });

    return NextResponse.json({
      ok: true,
      item: null,
      error: null,
    });

  } catch (err) {
    console.error("Error cancelar POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al cancelar POS" },
      { status: 500 }
    );
  }
}
