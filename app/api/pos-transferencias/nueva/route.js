// app/api/pos-transferencias/nueva/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getGrupoIdDeLocal } from "@/lib/grupos";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const destinoId = Number(searchParams.get("destinoId") || 0);
    let origenId = null;

    if (!destinoId) {
      return NextResponse.json(
        { ok: false, error: "destinoId requerido" },
        { status: 400 }
      );
    }

    // =====================================================
    // VALIDAR DESTINO (debe ser local, no depósito)
    // =====================================================
    const destino = await prisma.local.findUnique({
      where: { id: destinoId },
      select: { es_deposito: true },
    });

    if (!destino || destino.es_deposito) {
      return NextResponse.json(
        { ok: false, error: "El destino debe ser un local (no depósito)" },
        { status: 400 }
      );
    }

    // =====================================================
    // ADMIN vs DEPÓSITO NORMAL
    // =====================================================
    const isAdmin = !session.localId;

    if (isAdmin) {
      origenId = Number(searchParams.get("origenId") || 0);

      if (!origenId) {
        return NextResponse.json(
          { ok: false, error: "origenId requerido para admin" },
          { status: 400 }
        );
      }

      const origen = await prisma.local.findUnique({
        where: { id: origenId },
        select: { es_deposito: true },
      });

      if (!origen || !origen.es_deposito) {
        return NextResponse.json(
          { ok: false, error: "El origen del admin debe ser un depósito válido" },
          { status: 400 }
        );
      }
    } else {
      // DEPÓSITO NORMAL → origenId = sesión.localId
      origenId = Number(session.localId);

      const origen = await prisma.local.findUnique({
        where: { id: origenId },
        select: { es_deposito: true },
      });

      if (!origen || !origen.es_deposito) {
        return NextResponse.json(
          { ok: false, error: "El usuario no pertenece a un depósito" },
          { status: 400 }
        );
      }
    }

    // =====================================================
    // VALIDAR QUE ORIGEN Y DESTINO ESTÉN EN EL MISMO GRUPO
    // =====================================================
    const grupoOrigen = await getGrupoIdDeLocal(origenId);
    const grupoDestino = await getGrupoIdDeLocal(destinoId);

    if (!grupoOrigen || !grupoDestino || grupoOrigen !== grupoDestino) {
      return NextResponse.json(
        { ok: false, error: "Origen y destino no pertenecen al mismo grupo" },
        { status: 400 }
      );
    }

    // =====================================================
    // OBTENER POS BORRADOR
    // =====================================================
    let pos = await prisma.posTransferencia.findFirst({
      where: {
        origenId,
        destinoId,
        usuarioId: session.id,
        estado: { in: ["Borrador", "Preparando"] },
      },
      orderBy: { createdAt: "desc" },
    });

    // =====================================================
    // SI NO EXISTE → CREAR UNO
    // =====================================================
    if (!pos) {
      pos = await prisma.posTransferencia.create({
        data: {
          origenId,
          destinoId,
          usuarioId: session.id,
          estado: "Borrador",
        },
      });
    }

    // =====================================================
    // RESPUESTA PRO PARA UI
    // =====================================================
    const item = {
      id: pos.id,
      origenId,
      destinoId,
      estado: pos.estado,
      createdAt: pos.createdAt,
      updatedAt: pos.updatedAt,
    };

    return NextResponse.json({
      ok: true,
      item,
      error: null,
    });

  } catch (err) {
    console.error("Error nueva POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al crear/obtener POS" },
      { status: 500 }
    );
  }
}
