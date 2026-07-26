// app/api/pos-transferencias/solicitar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { requireOperadorSalvoDueno } from "@/lib/operador";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const gateOp = requireOperadorSalvoDueno(req, session);
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    // Si es local (no admin/depósito), exigir pedidos.solicitar
    const permisos = Array.isArray(session.permisos) ? session.permisos : [];
    const esAdmin = permisos.includes("*") && !session.localId;

    if (!esAdmin && session.localId) {
      const localSol = await prisma.local.findUnique({
        where: { id: Number(session.localId) },
        select: { es_deposito: true },
      });

      if (!localSol?.es_deposito && !permisos.includes("pedidos.solicitar")) {
        return NextResponse.json(
          { ok: false, error: "Sin permiso para solicitar pedidos" },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const posId = Number(body.posId || 0);

    if (!posId) {
      return NextResponse.json(
        { ok: false, error: "posId requerido" },
        { status: 400 }
      );
    }

    const pos = await prisma.posTransferencia.findUnique({
      where: { id: posId },
      include: { _count: { select: { detalles: true } } },
    });

    if (!pos) {
      return NextResponse.json(
        { ok: false, error: "POS no encontrada" },
        { status: 404 }
      );
    }

    // Scope: no-admin solo puede solicitar POS de su local (origen o destino).
    // ESCRITURA sobre recurso ajeno → 403.
    if (
      !esAdmin &&
      Number(session.localId) !== pos.origenId &&
      Number(session.localId) !== pos.destinoId
    ) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para esta transferencia" },
        { status: 403 }
      );
    }

    if (!["Borrador", "Preparando"].includes(pos.estado)) {
      return NextResponse.json(
        { ok: false, error: `No se puede solicitar una POS en estado "${pos.estado}"` },
        { status: 400 }
      );
    }

    if (pos._count.detalles === 0) {
      return NextResponse.json(
        { ok: false, error: "Agregá al menos un producto antes de solicitar" },
        { status: 400 }
      );
    }

    // Concurrencia: verificar que no haya otro pedido Solicitado para el mismo par
    const existente = await prisma.posTransferencia.findFirst({
      where: {
        estado: "Solicitado",
        origenId: pos.origenId,
        destinoId: pos.destinoId,
        id: { not: posId },
      },
    });

    if (existente) {
      return NextResponse.json(
        {
          ok: false,
          error: "Ya existe un pedido solicitado para este depósito/local. Esperá a que se procese.",
        },
        { status: 409 }
      );
    }

    const updated = await prisma.posTransferencia.update({
      where: { id: posId },
      data: {
        estado: "Solicitado",
        origenManual: true,
        solicitadoAt: new Date(),
        solicitadoPorUserId: session.id,
      },
    });

    return NextResponse.json({
      ok: true,
      item: {
        id: updated.id,
        estado: updated.estado,
        origenId: updated.origenId,
        destinoId: updated.destinoId,
        origenManual: updated.origenManual,
        solicitadoAt: updated.solicitadoAt,
      },
    });
  } catch (err) {
    console.error("Error solicitar POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al solicitar pedido" },
      { status: 500 }
    );
  }
}
